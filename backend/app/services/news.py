"""Recent headlines from the Yahoo Finance per-ticker RSS feed."""

import asyncio
import html
import logging

import feedparser
import httpx

logger = logging.getLogger(__name__)

RSS_URL = "https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}&region=US&lang=en-US"
_BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"


async def fetch_headlines(ticker: str, limit: int = 10) -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            res = await client.get(RSS_URL.format(ticker=ticker), headers={"User-Agent": _BROWSER_UA})
            res.raise_for_status()
    except httpx.HTTPError:
        logger.warning("Yahoo RSS fetch failed for %s", ticker, exc_info=True)
        return []

    feed = await asyncio.to_thread(feedparser.parse, res.content)
    items = []
    for entry in feed.entries[: limit * 2]:
        title = html.unescape(getattr(entry, "title", "")).strip()
        if not title:
            continue
        items.append(
            {
                "title": title,
                "link": getattr(entry, "link", "") or "",
                "published": getattr(entry, "published", None),
            }
        )
        if len(items) >= limit:
            break
    return items
