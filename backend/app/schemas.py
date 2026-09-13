from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from .utils import TICKER_RE


class ParseRequest(BaseModel):
    text: str = Field(min_length=3, max_length=2000)


class HoldingIn(BaseModel):
    ticker: str
    shares: float = Field(gt=0)
    avg_price: float = Field(ge=0)

    @field_validator("ticker")
    @classmethod
    def normalize(cls, value: str) -> str:
        ticker = value.strip().upper()
        if not TICKER_RE.match(ticker):
            raise ValueError(f"invalid ticker symbol: {value!r}")
        return ticker


class ParseResponse(BaseModel):
    holdings: list[HoldingIn]
    ignored: list[str] = []


class SaveHoldingsRequest(BaseModel):
    holdings: list[HoldingIn] = Field(min_length=1, max_length=50)


class HoldingRow(BaseModel):
    id: UUID
    user_id: UUID
    ticker: str
    shares: float
    avg_price: float
    created_at: datetime


class Quote(BaseModel):
    ticker: str
    price: float | None = None
    previous_close: float | None = None
    change_percent: float | None = None


class PricePoint(BaseModel):
    date: str
    close: float


class HistoryResponse(BaseModel):
    ticker: str
    range: Literal["7d", "1m", "3m"]
    points: list[PricePoint]


class IndexPoint(BaseModel):
    time: str
    close: float


class IndexPerformance(BaseModel):
    symbol: str
    name: str
    price: float
    change_percent: float | None = None
    points: list[IndexPoint]


class NewsItem(BaseModel):
    title: str
    link: str = ""
    published: str | None = None


class EarningsInfo(BaseModel):
    form: str
    filed: str
    company: str


class Indicators(BaseModel):
    price: float
    change_30d_percent: float | None = None
    high_30d: float | None = None
    low_30d: float | None = None
    rsi_14: float | None = None
    sma_50: float | None = None
    price_vs_sma50_percent: float | None = None


class OutlookResponse(BaseModel):
    ticker: str
    sentiment: Literal["bullish", "neutral", "bearish"]
    summary: str
    risks: list[str]
    indicators: Indicators
    headlines: list[NewsItem]
    earnings: EarningsInfo | None = None
    generated_at: datetime
