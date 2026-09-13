import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError

from ..auth import AuthedUser, get_current_user
from ..schemas import HoldingIn, HoldingRow, ParseRequest, ParseResponse, SaveHoldingsRequest
from ..services import db, llm

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.post("/parse", response_model=ParseResponse)
async def parse_portfolio(body: ParseRequest, user: AuthedUser = Depends(get_current_user)):
    """Parse a plain-English holdings description into structured holdings (preview only)."""
    try:
        raw = await llm.parse_holdings_text(body.text)
    except Exception as exc:
        logger.exception("Groq parse failed")
        raise HTTPException(status_code=502, detail=f"AI parsing failed: {exc}")

    holdings: list[HoldingIn] = []
    ignored = [str(reason) for reason in raw.get("ignored", []) if str(reason).strip()]
    for item in raw.get("holdings", []):
        try:
            holdings.append(HoldingIn.model_validate(item))
        except ValidationError:
            ignored.append(f"Could not validate parsed holding: {item}")
    return ParseResponse(holdings=holdings, ignored=ignored)


@router.get("", response_model=list[HoldingRow])
async def get_portfolio(user: AuthedUser = Depends(get_current_user)):
    return await db.list_holdings(user.token)


@router.post("", response_model=list[HoldingRow], status_code=201)
async def save_holdings(body: SaveHoldingsRequest, user: AuthedUser = Depends(get_current_user)):
    """Upsert holdings (merging on ticker) for the authenticated user."""
    return await db.upsert_holdings(user.token, user.id, body.holdings)


@router.delete("/{holding_id}", status_code=204)
async def delete_holding(holding_id: UUID, user: AuthedUser = Depends(get_current_user)):
    deleted = await db.delete_holding(user.token, str(holding_id))
    if not deleted:
        raise HTTPException(status_code=404, detail="Holding not found")
