import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import market, outlook, portfolio

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(
    title="AI Portfolio Tracker API",
    version="1.0.0",
    description="FastAPI backend: Supabase-authenticated portfolio storage, "
    "market data, and Groq-powered AI Outlook.",
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(portfolio.router)
app.include_router(market.router)
app.include_router(outlook.router)


@app.get("/healthz", tags=["health"])
async def healthz():
    return {"status": "ok"}
