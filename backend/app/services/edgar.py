"""Latest earnings-related filing text from the SEC EDGAR public API.

Strategy: prefer the most recent 8-K that reports item 2.02 (Results of
Operations) and pull its EX-99 earnings press release; otherwise fall back to
the latest 10-Q/10-K primary document. EDGAR requires a descriptive User-Agent
with contact info and allows max 10 req/s.
"""

import asyncio
import html
import logging
import re

import httpx

from ..cache import TTLCache
from ..config import get_settings

logger = logging.getLogger(__name__)

TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json"
SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik:010d}.json"
ARCHIVE_BASE = "https://www.sec.gov/Archives/edgar/data/{cik}/{accession}"

EXCERPT_CHARS = 8000
_DOWNLOAD_CAP = 1_500_000

_ticker_map: dict[str, dict] | None = None
_ticker_map_lock = asyncio.Lock()
_filing_cache = TTLCache(ttl_seconds=24 * 3600)


def _headers() -> dict[str, str]:
    return {"User-Agent": get_settings().sec_edgar_user_agent}


async def _get_ticker_map(client: httpx.AsyncClient) -> dict[str, dict]:
    global _ticker_map
    async with _ticker_map_lock:
        if _ticker_map is None:
            res = await client.get(TICKER_MAP_URL, headers=_headers())
            res.raise_for_status()
            _ticker_map = {
                row["ticker"].upper(): {"cik": row["cik_str"], "title": row["title"]}
                for row in res.json().values()
            }
    return _ticker_map


async def _get_text_capped(client: httpx.AsyncClient, url: str) -> str:
    chunks: list[bytes] = []
    total = 0
    async with client.stream("GET", url, headers=_headers()) as res:
        res.raise_for_status()
        async for chunk in res.aiter_bytes():
            chunks.append(chunk)
            total += len(chunk)
            if total >= _DOWNLOAD_CAP:
                break
    return b"".join(chunks)[:_DOWNLOAD_CAP].decode("utf-8", errors="ignore")


def _strip_html(raw: str) -> str:
    raw = re.sub(r"(?is)<(script|style|ix:header)\b.*?</\1>", " ", raw)
    text = re.sub(r"(?s)<[^>]+>", " ", raw)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _pick_filing(recent: dict) -> tuple[str, str, str, str, bool] | None:
    """Return (form, accession, primary_doc, filed_date, is_earnings_8k)."""
    forms = recent.get("form", [])
    accessions = recent.get("accessionNumber", [])
    docs = recent.get("primaryDocument", [])
    dates = recent.get("filingDate", [])
    items = recent.get("items", [])

    for i, form in enumerate(forms):
        if form == "8-K" and i < len(items) and "2.02" in (items[i] or ""):
            return form, accessions[i], docs[i], dates[i], True
    for i, form in enumerate(forms):
        if form in ("10-Q", "10-K"):
            return form, accessions[i], docs[i], dates[i], False
    return None


async def _find_press_release(
    client: httpx.AsyncClient, cik: int, accession_flat: str, accession_dashed: str
) -> str | None:
    """Locate the EX-99 earnings press release attached to an 8-K.

    Exhibit filenames are arbitrary (e.g. NVIDIA uses q1fy27pr.htm), so parse the
    filing index page, whose table maps each document to its exhibit type.
    """
    base = ARCHIVE_BASE.format(cik=cik, accession=accession_flat)
    res = None
    for suffix in ("-index.htm", "-index.html"):
        try:
            res = await client.get(f"{base}/{accession_dashed}{suffix}", headers=_headers())
            res.raise_for_status()
            break
        except httpx.HTTPError:
            res = None
    if res is None:
        return None
    for row in res.text.split("<tr")[1:]:
        if ">EX-99" not in row:
            continue
        match = re.search(r'href="[^"]*?([A-Za-z0-9_.\-]+\.(?:htm|html|txt))"', row)
        if match:
            return match.group(1)
    return None


async def _fetch_filing_excerpt(client: httpx.AsyncClient, cik: int, company: str) -> dict | None:
    res = await client.get(SUBMISSIONS_URL.format(cik=cik), headers=_headers())
    res.raise_for_status()
    picked = _pick_filing(res.json().get("filings", {}).get("recent", {}))
    if picked is None:
        return None

    form, accession, doc_name, filed, is_earnings_8k = picked
    accession_flat = accession.replace("-", "")
    if is_earnings_8k:
        press_release = await _find_press_release(client, cik, accession_flat, accession)
        if press_release:
            doc_name = press_release
        else:
            logger.info("No EX-99 exhibit found for %s %s; using primary document", company, accession)

    doc_url = ARCHIVE_BASE.format(cik=cik, accession=accession_flat) + f"/{doc_name}"
    text = _strip_html(await _get_text_capped(client, doc_url))
    if len(text) < 200:
        return None
    return {"form": form, "filed": filed, "company": company, "excerpt": text[:EXCERPT_CHARS]}


async def fetch_latest_earnings(ticker: str) -> dict | None:
    """Best-effort: returns None for ETFs/funds and on any EDGAR failure."""
    cached = _filing_cache.get(ticker)
    if cached is not None:
        return cached["value"]

    result = None
    try:
        async with httpx.AsyncClient(timeout=25, follow_redirects=True) as client:
            entry = (await _get_ticker_map(client)).get(ticker.upper())
            if entry is not None:
                result = await _fetch_filing_excerpt(client, entry["cik"], entry["title"])
    except Exception:
        logger.warning("EDGAR lookup failed for %s", ticker, exc_info=True)
        result = None

    _filing_cache.set(ticker, {"value": result})
    return result


async def lookup_company_name(ticker: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            entry = (await _get_ticker_map(client)).get(ticker.upper())
            return entry["title"] if entry else None
    except Exception:
        return None
