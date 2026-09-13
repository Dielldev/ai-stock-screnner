import re

from fastapi import HTTPException

TICKER_RE = re.compile(r"^[A-Za-z][A-Za-z0-9.\-]{0,9}$")


def normalize_ticker(raw: str) -> str:
    ticker = raw.strip().upper()
    if not TICKER_RE.match(ticker):
        raise HTTPException(status_code=400, detail=f"Invalid ticker symbol: {raw!r}")
    return ticker
