"""Amazon関連APIエンドポイント"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.product import Product
from app.scrapers.amazon_product import (
    CompetitorOffer,
    get_amazon_product,
    get_competitor_offers,
)

router = APIRouter(prefix="/api/amazon", tags=["amazon"])


# --- レスポンスモデル ---


class ProductResponse(BaseModel):
    asin: str
    title: str | None
    price: int | None
    brand: str | None
    model_number: str | None
    category: str | None
    image_url: str | None
    rating: float | None
    review_count: int | None


class ProductDBResponse(ProductResponse):
    """DB保存済みの商品情報"""
    id: int
    price_updated_at: str | None
    created_at: str


class CompetitorResponse(BaseModel):
    price: int
    condition: str
    seller_name: str | None
    shipping_cost: int
    is_fba: bool
    total_price: int  # price + shipping_cost


class CompetitorsListResponse(BaseModel):
    asin: str
    offers: list[CompetitorResponse]
    lowest_new_price: int | None
    lowest_used_price: int | None


# --- エンドポイント ---


@router.get("/product/{asin}", response_model=ProductResponse)
async def amazon_product(
    asin: str = Path(..., min_length=10, max_length=10, pattern=r"^[A-Z0-9]{10}$"),
):
    """ASIN指定でAmazon商品情報をスクレイピング取得"""
    product = await get_amazon_product(asin)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found or CAPTCHA")

    return ProductResponse(
        asin=product.asin,
        title=product.title,
        price=product.price,
        brand=product.brand,
        model_number=product.model_number,
        category=product.category,
        image_url=product.image_url,
        rating=product.rating,
        review_count=product.review_count,
    )


@router.post("/product/{asin}/save", response_model=ProductDBResponse)
async def save_amazon_product(
    asin: str = Path(..., min_length=10, max_length=10, pattern=r"^[A-Z0-9]{10}$"),
    db: AsyncSession = Depends(get_db),
):
    """Amazon商品をスクレイピングしてDBに保存/更新"""
    scraped = await get_amazon_product(asin)
    if not scraped:
        raise HTTPException(status_code=404, detail="Product not found or CAPTCHA")

    # 既存レコード確認
    result = await db.execute(select(Product).where(Product.asin == asin))
    existing = result.scalar_one_or_none()

    now = datetime.now()

    if existing:
        # 更新（空文字列も有効な値なので is not None で判定）
        if scraped.title is not None:
            existing.title = scraped.title
        if scraped.brand is not None:
            existing.brand = scraped.brand
        if scraped.model_number is not None:
            existing.model_number = scraped.model_number
        if scraped.category is not None:
            existing.category = scraped.category
        if scraped.image_url is not None:
            existing.image_url = scraped.image_url
        if scraped.price is not None:
            existing.amazon_price = scraped.price
        if scraped.rating is not None:
            existing.rating = scraped.rating
        if scraped.review_count is not None:
            existing.review_count = scraped.review_count
        existing.price_updated_at = now
        product = existing
    else:
        # 新規作成
        product = Product(
            asin=asin,
            title=scraped.title or "",
            brand=scraped.brand,
            model_number=scraped.model_number,
            category=scraped.category,
            image_url=scraped.image_url,
            amazon_price=scraped.price,
            rating=scraped.rating,
            review_count=scraped.review_count,
            price_updated_at=now,
        )
        db.add(product)

    await db.commit()
    await db.refresh(product)

    return ProductDBResponse(
        id=product.id,
        asin=product.asin,
        title=product.title,
        price=product.amazon_price,
        brand=product.brand,
        model_number=product.model_number,
        category=product.category,
        image_url=product.image_url,
        rating=product.rating,
        review_count=product.review_count,
        price_updated_at=product.price_updated_at.isoformat()
        if product.price_updated_at
        else None,
        created_at=product.created_at.isoformat(),
    )


@router.get("/competitors/{asin}", response_model=CompetitorsListResponse)
async def amazon_competitors(
    asin: str = Path(..., min_length=10, max_length=10, pattern=r"^[A-Z0-9]{10}$"),
):
    """ASIN指定で競合出品者の価格一覧を取得"""
    offers = await get_competitor_offers(asin)

    responses = []
    for o in offers:
        responses.append(
            CompetitorResponse(
                price=o.price,
                condition=o.condition,
                seller_name=o.seller_name,
                shipping_cost=o.shipping_cost,
                is_fba=o.is_fba,
                total_price=o.price + o.shipping_cost,
            )
        )

    # 最安値計算
    new_prices = [r.total_price for r in responses if r.condition == "新品"]
    used_prices = [r.total_price for r in responses if r.condition == "中古"]

    return CompetitorsListResponse(
        asin=asin,
        offers=responses,
        lowest_new_price=min(new_prices) if new_prices else None,
        lowest_used_price=min(used_prices) if used_prices else None,
    )
