"""Market data via yfinance, indicators via pandas-ta.

yfinance is synchronous, so calls run in worker threads. pandas-ta requires
Python 3.12/3.13 (numba); on other interpreters the equivalent indicators are
computed directly with pandas so the app still runs.
"""

import asyncio

import pandas as pd
import yfinance as yf
from fastapi import HTTPException

from ..cache import TTLCache

try:
    import pandas_ta as ta
except ImportError:
    ta = None

RANGE_PARAMS = {
    "7d": {"period": "7d", "interval": "60m"},
    "1m": {"period": "1mo", "interval": "1d"},
    "3m": {"period": "3mo", "interval": "1d"},
}

_quote_cache = TTLCache(ttl_seconds=60)
_history_cache = TTLCache(ttl_seconds=300)
_index_cache = TTLCache(ttl_seconds=300)

# yfinance symbols for the major US indexes shown on the dashboard strip.
INDEXES = [("^GSPC", "S&P 500"), ("^IXIC", "Nasdaq"), ("^DJI", "Dow Jones")]


def _download_history(ticker: str, period: str, interval: str) -> pd.DataFrame:
    return yf.Ticker(ticker).history(period=period, interval=interval, auto_adjust=True)


def _rsi(close: pd.Series, length: int = 14) -> pd.Series:
    if ta is not None:
        return ta.rsi(close=close, length=length)
    # Wilder's RSI, matching pandas-ta's default RMA smoothing.
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / length, min_periods=length).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / length, min_periods=length).mean()
    return 100 - 100 / (1 + gain / loss)


def _sma(close: pd.Series, length: int = 50) -> pd.Series:
    if ta is not None:
        return ta.sma(close=close, length=length)
    return close.rolling(length).mean()


def _last_valid(series: pd.Series | None) -> float | None:
    if series is None:
        return None
    valid = series.dropna()
    return round(float(valid.iloc[-1]), 4) if not valid.empty else None


def _quote_sync(ticker: str) -> dict:
    df = _download_history(ticker, period="5d", interval="1d")
    closes = df["Close"].dropna() if not df.empty else pd.Series(dtype=float)
    if closes.empty:
        return {"ticker": ticker, "price": None, "previous_close": None, "change_percent": None}
    price = float(closes.iloc[-1])
    previous = float(closes.iloc[-2]) if len(closes) > 1 else None
    change = round((price - previous) / previous * 100, 2) if previous else None
    return {
        "ticker": ticker,
        "price": round(price, 4),
        "previous_close": round(previous, 4) if previous else None,
        "change_percent": change,
    }


async def fetch_quotes(tickers: list[str]) -> list[dict]:
    results: dict[str, dict] = {}
    for ticker in tickers:
        cached = _quote_cache.get(ticker)
        if cached is not None:
            results[ticker] = cached
    missing = [t for t in tickers if t not in results]
    if missing:
        fetched = await asyncio.gather(*(asyncio.to_thread(_quote_sync, t) for t in missing))
        for quote in fetched:
            _quote_cache.set(quote["ticker"], quote)
            results[quote["ticker"]] = quote
    return [results[t] for t in tickers]


async def fetch_history(ticker: str, range_key: str) -> dict:
    cache_key = (ticker, range_key)
    cached = _history_cache.get(cache_key)
    if cached is not None:
        return cached

    params = RANGE_PARAMS[range_key]
    df = await asyncio.to_thread(_download_history, ticker, params["period"], params["interval"])
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No price history found for {ticker}")

    intraday = params["interval"].endswith("m") or params["interval"].endswith("h")
    points = []
    for index, close in df["Close"].dropna().items():
        label = index.isoformat() if intraday else index.date().isoformat()
        points.append({"date": label, "close": round(float(close), 4)})
    if not points:
        raise HTTPException(status_code=404, detail=f"No price history found for {ticker}")

    result = {"ticker": ticker, "range": range_key, "points": points}
    _history_cache.set(cache_key, result)
    return result


def _index_sync(symbol: str, name: str) -> dict | None:
    """Latest session's intraday closes plus change vs the prior session's close."""
    df = _download_history(symbol, period="5d", interval="15m")
    closes = df["Close"].dropna() if not df.empty else pd.Series(dtype=float)
    if closes.empty:
        return None

    days = closes.groupby(closes.index.date)
    last_day = max(days.groups)
    session = days.get_group(last_day)
    prior_days = [d for d in days.groups if d < last_day]
    previous_close = float(days.get_group(max(prior_days)).iloc[-1]) if prior_days else None

    price = float(session.iloc[-1])
    change = round((price - previous_close) / previous_close * 100, 2) if previous_close else None
    return {
        "symbol": symbol,
        "name": name,
        "price": round(price, 2),
        "change_percent": change,
        "points": [
            {"time": index.isoformat(), "close": round(float(close), 2)}
            for index, close in session.items()
        ],
    }


async def fetch_index_performance() -> list[dict]:
    cached = _index_cache.get("all")
    if cached is not None:
        return cached

    fetched = await asyncio.gather(*(asyncio.to_thread(_index_sync, s, n) for s, n in INDEXES))
    results = [item for item in fetched if item is not None]
    if not results:
        raise HTTPException(status_code=502, detail="Index data is unavailable right now")
    _index_cache.set("all", results)
    return results


def _indicators_sync(ticker: str) -> dict | None:
    df = _download_history(ticker, period="6mo", interval="1d")
    if df.empty:
        return None
    close = df["Close"].dropna()
    if len(close) < 2:
        return None

    price = float(close.iloc[-1])
    last30 = close.tail(30)
    sma50 = _last_valid(_sma(close, 50))
    recent = [
        {"date": index.date().isoformat(), "close": round(float(value), 2)}
        for index, value in close.tail(10).items()
    ]
    return {
        "price": round(price, 4),
        "change_30d_percent": round((price / float(last30.iloc[0]) - 1) * 100, 2),
        "high_30d": round(float(last30.max()), 4),
        "low_30d": round(float(last30.min()), 4),
        "rsi_14": _last_valid(_rsi(close, 14)) if len(close) >= 15 else None,
        "sma_50": sma50,
        "price_vs_sma50_percent": round((price / sma50 - 1) * 100, 2) if sma50 else None,
        "recent_closes": recent,
    }


async def fetch_indicators(ticker: str) -> dict | None:
    return await asyncio.to_thread(_indicators_sync, ticker)
