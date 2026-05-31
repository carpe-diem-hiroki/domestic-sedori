"""出品管理APIエンドポイント"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Listing, Product

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


class ListingUpdate(BaseModel):
    sku: str | None = Field(None, min_length=1, max_length=100)
    price: int | None = Field(None, gt=0)
    sub_condition: str | None = None
    lead_time_days: int | None = Field(None, ge=1, le=30)
    description: str | None = None
    status: str | None = None


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
    created_at: str


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
    rows = result.all()
    return [
        ListingResponse(
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
            created_at=listing.created_at.isoformat(),
        )
        for listing, product in rows
    ]


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
    )
    db.add(listing)
    await db.commit()
    await db.refresh(listing)

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
        created_at=listing.created_at.isoformat(),
    )


@router.get("/{listing_id}", response_model=ListingResponse)
async def get_listing(listing_id: int, db: AsyncSession = Depends(get_db)):
    """出品詳細取得"""
    result = await db.execute(
        select(Listing, Product)
        .join(Product, Listing.product_id == Product.id)
        .where(Listing.id == listing_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Listing not found")

    listing, product = row
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
        created_at=listing.created_at.isoformat(),
    )


@router.put("/{listing_id}", response_model=ListingResponse)
async def update_listing(
    listing_id: int, req: ListingUpdate, db: AsyncSession = Depends(get_db)
):
    """出品情報更新"""
    result = await db.execute(
        select(Listing, Product)
        .join(Product, Listing.product_id == Product.id)
        .where(Listing.id == listing_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Listing not found")

    listing, product = row

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

    await db.commit()

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
        created_at=listing.created_at.isoformat(),
    )


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
