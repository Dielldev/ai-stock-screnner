"""Supabase PostgREST access.

Requests are made with the anon API key plus the *user's* JWT, so PostgREST
evaluates Row Level Security as that user — the backend never bypasses RLS.
"""

import httpx
from fastapi import HTTPException

from ..config import get_settings
from ..schemas import HoldingIn

_TIMEOUT = 15.0


def _url(table: str) -> str:
    return f"{get_settings().supabase_url}/rest/v1/{table}"


def _headers(user_token: str) -> dict[str, str]:
    return {
        "apikey": get_settings().supabase_anon_key,
        "Authorization": f"Bearer {user_token}",
        "Content-Type": "application/json",
    }


def _raise_for_db_error(res: httpx.Response) -> None:
    if res.is_success:
        return
    try:
        message = res.json().get("message") or res.text
    except ValueError:
        message = res.text
    status = res.status_code if 400 <= res.status_code < 500 else 502
    raise HTTPException(status_code=status, detail=f"Database error: {message}")


async def list_holdings(user_token: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        res = await client.get(
            _url("portfolios"),
            params={"select": "*", "order": "created_at.asc"},
            headers=_headers(user_token),
        )
    _raise_for_db_error(res)
    return res.json()


async def upsert_holdings(user_token: str, user_id: str, holdings: list[HoldingIn]) -> list[dict]:
    rows = [
        {"user_id": user_id, "ticker": h.ticker, "shares": h.shares, "avg_price": h.avg_price}
        for h in holdings
    ]
    headers = _headers(user_token) | {"Prefer": "resolution=merge-duplicates,return=representation"}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        res = await client.post(
            _url("portfolios"),
            params={"on_conflict": "user_id,ticker"},
            headers=headers,
            json=rows,
        )
    _raise_for_db_error(res)
    return res.json()


async def delete_holding(user_token: str, holding_id: str) -> bool:
    headers = _headers(user_token) | {"Prefer": "return=representation"}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        res = await client.delete(
            _url("portfolios"),
            params={"id": f"eq.{holding_id}"},
            headers=headers,
        )
    _raise_for_db_error(res)
    return len(res.json()) > 0
