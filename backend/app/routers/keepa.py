"""Keepa連携APIエンドポイント（将来のAmazon価格履歴用）"""
from fastapi import APIRouter, HTTPException, Path

from pydantic import BaseModel

from app.services import keepa

router = APIRouter(prefix="/api/keepa", tags=["keepa"])


class KeepaStatus(BaseModel):
    enabled: bool


class KeepaPoint(BaseModel):
    captured_at: str
    price: int


@router.get("/status", response_model=KeepaStatus)
async def keepa_status():
    """Keepa連携が有効か（APIキー設定済みか）"""
    return KeepaStatus(enabled=keepa.is_enabled())


@router.get("/history/{asin}", response_model=list[KeepaPoint])
async def keepa_history(
    asin: str = Path(..., min_length=10, max_length=10, pattern=r"^[A-Z0-9]{10}$"),
):
    """ASINのAmazon価格履歴を取得（Keepa）。未設定なら503"""
    if not keepa.is_enabled():
        raise HTTPException(status_code=503, detail="Keepa API key not configured")
    try:
        points = await keepa.fetch_amazon_price_history(asin)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Keepa fetch failed: {e}")
    return [KeepaPoint(captured_at=p.captured_at, price=p.price) for p in points]
