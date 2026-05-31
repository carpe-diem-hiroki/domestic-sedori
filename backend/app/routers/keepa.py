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


class KeepaIdentityResponse(BaseModel):
    asin: str
    title: str | None
    brand: str | None
    model: str | None
    jan_codes: list[str]


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


@router.get("/identity/{asin}", response_model=KeepaIdentityResponse)
async def keepa_identity(
    asin: str = Path(..., min_length=10, max_length=10, pattern=r"^[A-Z0-9]{10}$"),
):
    """ASINのブランド・型番・JAN(EAN)を取得（マッチングの最上位キー）。未設定なら503"""
    if not keepa.is_enabled():
        raise HTTPException(status_code=503, detail="Keepa API key not configured")
    try:
        ident = await keepa.fetch_product_identity(asin)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Keepa fetch failed: {e}")
    if not ident:
        raise HTTPException(status_code=404, detail="Product not found in Keepa")
    return KeepaIdentityResponse(
        asin=ident.asin, title=ident.title, brand=ident.brand,
        model=ident.model, jan_codes=ident.jan_codes,
    )
