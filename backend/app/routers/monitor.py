"""監視対象管理APIエンドポイント"""
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Auction, Product, ProductAuctionLink

router = APIRouter(prefix="/api/monitor", tags=["monitor"])


# --- リクエスト/レスポンスモデル ---


class StatusFilter(str, Enum):
    active = "active"
    ended = "ended"


class MonitorAddRequest(BaseModel):
    asin: str = Field(..., min_length=10, max_length=10, pattern=r"^[A-Z0-9]{10}$")
    product_title: str = Field(..., min_length=1, max_length=500)
    auction_id: str = Field(..., min_length=1, max_length=30, pattern=r"^[a-zA-Z0-9]+$")
    auction_title: str = Field(..., min_length=1, max_length=500)
    current_price: int | None = None
    buy_now_price: int | None = None
    image_url: str | None = None
    url: str | None = None


class MonitorResponse(BaseModel):
    id: int
    product_id: int
    auction_id: int
    asin: str
    product_title: str
    yahoo_auction_id: str
    auction_title: str
    current_price: int | None
    buy_now_price: int | None
    status: str
    is_monitoring: bool


class MonitorListResponse(BaseModel):
    items: list[MonitorResponse]
    total: int


# --- エンドポイント ---


@router.post("/add", response_model=MonitorResponse)
async def add_monitor(req: MonitorAddRequest, db: AsyncSession = Depends(get_db)):
    """監視対象を追加（Amazon商品とヤフオクを紐づけ）"""

    # Product を取得 or 作成
    result = await db.execute(select(Product).where(Product.asin == req.asin))
    product = result.scalar_one_or_none()

    if not product:
        product = Product(asin=req.asin, title=req.product_title)
        db.add(product)
        await db.flush()

    # Auction を取得 or 作成
    result = await db.execute(
        select(Auction).where(Auction.auction_id == req.auction_id)
    )
    auction = result.scalar_one_or_none()

    if not auction:
        auction = Auction(
            auction_id=req.auction_id,
            title=req.auction_title,
            current_price=req.current_price,
            buy_now_price=req.buy_now_price,
            url=req.url,
            status="active",
        )
        db.add(auction)
        await db.flush()

    # 既に紐づけが存在するかチェック
    result = await db.execute(
        select(ProductAuctionLink).where(
            ProductAuctionLink.product_id == product.id,
            ProductAuctionLink.auction_id == auction.id,
        )
    )
    link = result.scalar_one_or_none()

    if link:
        # 既存の紐づけを再有効化
        link.is_monitoring = True
    else:
        link = ProductAuctionLink(
            product_id=product.id,
            auction_id=auction.id,
            is_monitoring=True,
        )
        db.add(link)
        await db.flush()

    await db.commit()

    return MonitorResponse(
        id=link.id,
        product_id=product.id,
        auction_id=auction.id,
        asin=product.asin,
        product_title=product.title,
        yahoo_auction_id=auction.auction_id,
        auction_title=auction.title,
        current_price=auction.current_price,
        buy_now_price=auction.buy_now_price,
        status=auction.status,
        is_monitoring=link.is_monitoring,
    )


@router.get("/list", response_model=MonitorListResponse)
async def list_monitors(
    status: StatusFilter = Query(StatusFilter.active, description="active or ended"),
    db: AsyncSession = Depends(get_db),
):
    """監視中の商品一覧を取得"""
    query = (
        select(ProductAuctionLink, Product, Auction)
        .join(Product, ProductAuctionLink.product_id == Product.id)
        .join(Auction, ProductAuctionLink.auction_id == Auction.id)
        .where(ProductAuctionLink.is_monitoring.is_(True))
    )

    if status == StatusFilter.active:
        query = query.where(Auction.status == "active")
    elif status == StatusFilter.ended:
        query = query.where(Auction.status.in_(["ended", "sold"]))

    result = await db.execute(query)
    rows = result.all()

    items = [
        MonitorResponse(
            id=link.id,
            product_id=product.id,
            auction_id=auction.id,
            asin=product.asin,
            product_title=product.title,
            yahoo_auction_id=auction.auction_id,
            auction_title=auction.title,
            current_price=auction.current_price,
            buy_now_price=auction.buy_now_price,
            status=auction.status,
            is_monitoring=link.is_monitoring,
        )
        for link, product, auction in rows
    ]

    return MonitorListResponse(items=items, total=len(items))


@router.get("/{link_id}", response_model=MonitorResponse)
async def get_monitor(link_id: int, db: AsyncSession = Depends(get_db)):
    """監視対象の詳細を取得"""
    result = await db.execute(
        select(ProductAuctionLink, Product, Auction)
        .join(Product, ProductAuctionLink.product_id == Product.id)
        .join(Auction, ProductAuctionLink.auction_id == Auction.id)
        .where(ProductAuctionLink.id == link_id)
    )
    row = result.one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="Monitor not found")

    link, product, auction = row
    return MonitorResponse(
        id=link.id,
        product_id=product.id,
        auction_id=auction.id,
        asin=product.asin,
        product_title=product.title,
        yahoo_auction_id=auction.auction_id,
        auction_title=auction.title,
        current_price=auction.current_price,
        buy_now_price=auction.buy_now_price,
        status=auction.status,
        is_monitoring=link.is_monitoring,
    )


@router.delete("/{link_id}")
async def remove_monitor(link_id: int, db: AsyncSession = Depends(get_db)):
    """監視対象を解除"""
    result = await db.execute(
        select(ProductAuctionLink).where(ProductAuctionLink.id == link_id)
    )
    link = result.scalar_one_or_none()

    if not link:
        raise HTTPException(status_code=404, detail="Monitor not found")

    link.is_monitoring = False
    await db.commit()

    return {"message": "Monitor removed", "id": link_id}
