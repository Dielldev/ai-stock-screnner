from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import get_current_user
from ..schemas import HistoryResponse, IndexPerformance, Quote
from ..services import market_data
from ..utils import normalize_ticker

router = APIRouter(
    prefix="/api/market",
    tags=["market"],
    dependencies=[Depends(get_current_user)],
)

MAX_QUOTE_TICKERS = 30


@router.get("/quotes", response_model=list[Quote])
async def get_quotes(tickers: str = Query(min_length=1, max_length=400)):
    """Batch quotes, e.g. /api/market/quotes?tickers=NVDA,VOO"""
    symbols = list(dict.fromkeys(normalize_ticker(t) for t in tickers.split(",") if t.strip()))
    if not symbols:
        raise HTTPException(status_code=400, detail="No tickers provided")
    return await market_data.fetch_quotes(symbols[:MAX_QUOTE_TICKERS])


@router.get("/indexes", response_model=list[IndexPerformance])
async def get_indexes():
    """Intraday performance of the major US indexes (S&P 500, Nasdaq, Dow)."""
    return await market_data.fetch_index_performance()


@router.get("/history/{ticker}", response_model=HistoryResponse)
async def get_history(ticker: str, range_key: Literal["7d", "1m", "3m"] = Query("1m", alias="range")):
    return await market_data.fetch_history(normalize_ticker(ticker), range_key)
