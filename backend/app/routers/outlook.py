import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from ..auth import AuthedUser, get_current_user
from ..cache import TTLCache
from ..schemas import EarningsInfo, Indicators, NewsItem, OutlookResponse
from ..services import edgar, embeddings, llm, market_data, news
from ..utils import normalize_ticker

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/outlook", tags=["outlook"])

_outlook_cache = TTLCache(ttl_seconds=15 * 60)

VALID_SENTIMENTS = ("bullish", "neutral", "bearish")


def _build_context(ticker: str, indicators: dict, headlines: list[dict], earnings: dict | None) -> str:
    lines = [f"TICKER: {ticker}", "", "TECHNICALS (daily):", f"- Current price: ${indicators['price']:.2f}"]
    if indicators.get("change_30d_percent") is not None:
        lines.append(f"- 30-day change: {indicators['change_30d_percent']:+.2f}%")
    if indicators.get("high_30d") is not None:
        lines.append(f"- 30-day range: ${indicators['low_30d']:.2f} to ${indicators['high_30d']:.2f}")
    if indicators.get("rsi_14") is not None:
        lines.append(f"- RSI (14-day): {indicators['rsi_14']:.1f}")
    if indicators.get("sma_50") is not None:
        lines.append(
            f"- 50-day moving average: ${indicators['sma_50']:.2f} "
            f"(price is {indicators['price_vs_sma50_percent']:+.2f}% vs it)"
        )
    if indicators.get("recent_closes"):
        closes = ", ".join(f"{c['date']}: {c['close']}" for c in indicators["recent_closes"])
        lines.append(f"- Last 10 daily closes: {closes}")

    lines += ["", "RECENT NEWS HEADLINES (most relevant first):"]
    if headlines:
        lines += [f"- {h['title']}" for h in headlines]
    else:
        lines.append("- No recent headlines found.")

    lines.append("")
    if earnings:
        lines.append(
            f"LATEST SEC FILING ({earnings['form']} filed {earnings['filed']} "
            f"by {earnings['company']}), excerpt:"
        )
        lines.append(earnings["excerpt"])
    else:
        lines.append("LATEST SEC FILING: none found (security may be an ETF or fund).")
    return "\n".join(lines)


@router.get("/{ticker}", response_model=OutlookResponse)
async def get_outlook(ticker: str, user: AuthedUser = Depends(get_current_user)):
    """Generate the AI Outlook: technicals + news + latest SEC filing, synthesized by Groq."""
    symbol = normalize_ticker(ticker)
    cached = _outlook_cache.get(symbol)
    if cached is not None:
        return cached

    indicators, headlines, earnings = await asyncio.gather(
        market_data.fetch_indicators(symbol),
        news.fetch_headlines(symbol, limit=10),
        edgar.fetch_latest_earnings(symbol),
        return_exceptions=True,
    )
    if isinstance(indicators, BaseException):
        logger.warning("Indicator fetch failed for %s: %s", symbol, indicators)
        indicators = None
    if isinstance(headlines, BaseException):
        logger.warning("News fetch failed for %s: %s", symbol, headlines)
        headlines = []
    if isinstance(earnings, BaseException):
        logger.warning("EDGAR fetch failed for %s: %s", symbol, earnings)
        earnings = None
    if indicators is None:
        raise HTTPException(status_code=404, detail=f"No market data found for {symbol}")

    company = earnings["company"] if earnings else (await edgar.lookup_company_name(symbol) or symbol)
    headlines = await embeddings.rank_headlines(
        f"{company} ({symbol}) stock performance, earnings and outlook", headlines, top_k=5
    )

    context = _build_context(symbol, indicators, headlines, earnings)
    try:
        verdict = await llm.generate_outlook(context)
    except Exception as exc:
        logger.exception("Groq outlook failed")
        raise HTTPException(status_code=502, detail=f"AI outlook generation failed: {exc}")

    sentiment = str(verdict.get("sentiment", "")).lower()
    if sentiment not in VALID_SENTIMENTS:
        sentiment = "neutral"

    response = OutlookResponse(
        ticker=symbol,
        sentiment=sentiment,
        summary=str(verdict.get("summary", "")).strip() or "No summary was generated.",
        risks=[str(r).strip() for r in verdict.get("risks", []) if str(r).strip()][:5],
        indicators=Indicators(**{k: v for k, v in indicators.items() if k in Indicators.model_fields}),
        headlines=[NewsItem(**h) for h in headlines],
        earnings=EarningsInfo(form=earnings["form"], filed=earnings["filed"], company=earnings["company"])
        if earnings
        else None,
        generated_at=datetime.now(timezone.utc),
    )
    _outlook_cache.set(symbol, response)
    return response
