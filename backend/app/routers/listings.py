"""出品管理APIエンドポイント"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Listing, Product
from app.services.pricing import calculate_pricing

router = APIRouter(prefix="/api/listings", tags=["listings"])


# --- リクエスト/レスポンスモデル ---


class ListingCreate(BaseModel):
    product_id: int
    link_id: int | None = None
    sku: str = Field(..., min_length=1, max_length=100)
    price: int = Field(..., gt=0)
    sub_condition: str = "中古 - 良い"
    lead_time_days: int = Field(8, ge=1, le=30)
    description: str | None = None
    template_id: int | None = None
    actual_purchase_price: int | None = Field(None, ge=0)
    min_price: int | None = Field(None, ge=0)


class ListingUpdate(BaseModel):
    sku: str | None = Field(None, min_length=1, max_length=100)
    price: int | None = Field(None, gt=0)
    sub_condition: str | None = None
    lead_time_days: int | None = Field(None, ge=1, le=30)
    description: str | None = None
    status: str | None = None
    actual_purchase_price: int | None = Field(None, ge=0)
    min_price: int | None = Field(None, ge=0)


class ListingSoldRequest(BaseModel):
    """売れた記録。sold_price 未指定なら現在の出品価格を使う。"""
    sold_price: int | None = Field(None, gt=0)
    sold_date: str | None = None  # ISO形式。未指定なら現在時刻
    shipping_cost: int = Field(800, ge=0)
    category: str | None = None  # 手数料率算出用


class ListingResponse(BaseModel):
    id: int
    product_id: int
    link_id: int | None
    asin: str
    product_title: str
    image_url: str | None
    sku: str
    price: int
    sub_condition: str
    lead_time_days: int
    quantity: int
    status: str
    description: str | None
    actual_purchase_price: int | None
    min_price: int | None
    sold_price: int | None
    sold_date: str | None
    actual_profit: int | None
    created_at: str


# --- ヘルパー ---


def _to_response(listing: Listing, product: Product) -> ListingResponse:
    """Listing + Product から共通レスポンスを構築"""
    return ListingResponse(
        id=listing.id,
        product_id=listing.product_id,
        link_id=listing.link_id,
        asin=product.asin,
        product_title=product.title,
        image_url=product.image_url,
        sku=listing.sku,
        price=listing.price,
        sub_condition=listing.sub_condition,
        lead_time_days=listing.lead_time_days,
        quantity=listing.quantity,
        status=listing.status,
        description=listing.description,
        actual_purchase_price=listing.actual_purchase_price,
        min_price=listing.min_price,
        sold_price=listing.sold_price,
        sold_date=listing.sold_date.isoformat() if listing.sold_date else None,
        actual_profit=listing.actual_profit,
        created_at=listing.created_at.isoformat(),
    )


async def _get_listing_with_product(
    listing_id: int, db: AsyncSession
) -> tuple[Listing, Product]:
    """Listing と Product を取得（無ければ404）"""
    result = await db.execute(
        select(Listing, Product)
        .join(Product, Listing.product_id == Product.id)
        .where(Listing.id == listing_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Listing not found")
    return row


# --- エンドポイント ---


@router.get("/", response_model=list[ListingResponse])
async def list_listings(db: AsyncSession = Depends(get_db)):
    """出品一覧取得"""
    result = await db.execute(
        select(Listing, Product)
        .join(Product, Listing.product_id == Product.id)
        .where(Listing.status != "deleted")
        .order_by(Listing.id.desc())
    )
    return [_to_response(listing, product) for listing, product in result.all()]


@router.post("/", response_model=ListingResponse)
async def create_listing(req: ListingCreate, db: AsyncSession = Depends(get_db)):
    """出品登録"""
    result = await db.execute(select(Product).where(Product.id == req.product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # SKU重複チェック
    result = await db.execute(
        select(Listing).where(Listing.sku == req.sku, Listing.status != "deleted")
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="SKU already exists")

    listing = Listing(
        product_id=req.product_id,
        link_id=req.link_id,
        sku=req.sku,
        price=req.price,
        sub_condition=req.sub_condition,
        lead_time_days=req.lead_time_days,
        quantity=1,
        status="active",
        description=req.description,
        template_id=req.template_id,
        actual_purchase_price=req.actual_purchase_price,
        min_price=req.min_price,
    )
    db.add(listing)
    await db.commit()
    await db.refresh(listing)

    return _to_response(listing, product)


@router.get("/{listing_id}", response_model=ListingResponse)
async def get_listing(listing_id: int, db: AsyncSession = Depends(get_db)):
    """出品詳細取得"""
    listing, product = await _get_listing_with_product(listing_id, db)
    return _to_response(listing, product)


@router.put("/{listing_id}", response_model=ListingResponse)
async def update_listing(
    listing_id: int, req: ListingUpdate, db: AsyncSession = Depends(get_db)
):
    """出品情報更新"""
    listing, product = await _get_listing_with_product(listing_id, db)

    if req.sku is not None:
        listing.sku = req.sku
    if req.price is not None:
        listing.price = req.price
    if req.sub_condition is not None:
        listing.sub_condition = req.sub_condition
    if req.lead_time_days is not None:
        listing.lead_time_days = req.lead_time_days
    if req.description is not None:
        listing.description = req.description
    if req.status is not None:
        listing.status = req.status
    if req.actual_purchase_price is not None:
        listing.actual_purchase_price = req.actual_purchase_price
    if req.min_price is not None:
        listing.min_price = req.min_price

    await db.commit()
    return _to_response(listing, product)


@router.post("/{listing_id}/sold", response_model=ListingResponse)
async def mark_sold(
    listing_id: int, req: ListingSoldRequest, db: AsyncSession = Depends(get_db)
):
    """売れた記録。実績利益を自動計算して保存する。

    実績利益 = 売値 - 仕入れ値 - Amazon手数料 - 送料
    （仕入れ値が未登録の場合は手数料・送料を引いた粗利のみ）
    """
    listing, product = await _get_listing_with_product(listing_id, db)

    sold_price = req.sold_price if req.sold_price is not None else listing.price

    if req.sold_date:
        try:
            sold_date = datetime.fromisoformat(req.sold_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid sold_date format")
    else:
        sold_date = datetime.now()

    # 実績利益を計算（仕入れ値が無ければ 0 として粗利を出す）
    purchase = listing.actual_purchase_price or 0
    category = req.category or product.category
    calc = calculate_pricing(
        selling_price=sold_price,
        expected_winning_price=purchase,
        category=category,
        shipping_cost=req.shipping_cost,
    )

    listing.sold_price = sold_price
    listing.sold_date = sold_date
    listing.actual_profit = calc.profit
    listing.status = "sold"
    listing.quantity = 0

    await db.commit()
    return _to_response(listing, product)


@router.delete("/{listing_id}")
async def delete_listing(listing_id: int, db: AsyncSession = Depends(get_db)):
    """出品削除（論理削除）"""
    result = await db.execute(select(Listing).where(Listing.id == listing_id))
    listing = result.scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    listing.status = "deleted"
    await db.commit()
    return {"detail": "Listing deleted"}
