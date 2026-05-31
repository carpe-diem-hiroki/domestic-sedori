"""集計・分析APIエンドポイント"""
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Auction, Listing, Product, ProductAuctionLink

router = APIRouter(prefix="/api/stats", tags=["stats"])


# --- レスポンスモデル ---


class InventoryStats(BaseModel):
    active_count: int       # 出品中の件数
    total_price: int        # 出品中の総額（price合計）


class SoldStats(BaseModel):
    count: int              # 売れた件数
    total_sales: int        # 売上合計（sold_price合計）
    total_profit: int       # 実績利益合計
    avg_profit_rate: float  # 平均利益率（%）


class MonitorStats(BaseModel):
    active: int             # 監視中
    ended: int              # 終了


class PriceBand(BaseModel):
    label: str
    sold_count: int
    total_profit: int
    avg_profit_rate: float


class RecentSold(BaseModel):
    listing_id: int
    asin: str
    product_title: str
    sold_price: int | None
    actual_profit: int | None
    sold_date: str | None


class StatsSummary(BaseModel):
    period: str             # "month" or "all"
    inventory: InventoryStats
    sold: SoldStats
    monitors: MonitorStats
    price_bands: list[PriceBand]
    recent_sold: list[RecentSold]


# --- 価格帯定義（売値ベース） ---

# (ラベル, 下限, 上限) 上限 None は無制限
PRICE_BANDS: list[tuple[str, int, int | None]] = [
    ("〜5,000円", 0, 5000),
    ("5,000〜20,000円", 5000, 20000),
    ("20,000円〜", 20000, None),
]


# --- エンドポイント ---


@router.get("/summary", response_model=StatsSummary)
async def stats_summary(
    period: str = Query("month", pattern="^(month|all)$"),
    db: AsyncSession = Depends(get_db),
):
    """集計サマリー: 在庫・売上・利益・価格帯別・直近売れた商品"""

    # --- 在庫（出品中） ---
    inv_result = await db.execute(
        select(
            func.count(Listing.id),
            func.coalesce(func.sum(Listing.price), 0),
        ).where(Listing.status == "active")
    )
    inv_count, inv_total = inv_result.one()

    # --- 売れた商品（期間フィルター） ---
    sold_query = select(Listing).where(Listing.status == "sold")
    if period == "month":
        now = datetime.now()
        month_start = datetime(now.year, now.month, 1)
        sold_query = sold_query.where(Listing.sold_date >= month_start)

    sold_result = await db.execute(sold_query)
    sold_listings = sold_result.scalars().all()

    total_sales = sum(s.sold_price or 0 for s in sold_listings)
    total_profit = sum(s.actual_profit or 0 for s in sold_listings)
    # 平均利益率 = 利益合計 / 売上合計
    avg_profit_rate = (
        round(total_profit / total_sales * 100, 1) if total_sales > 0 else 0.0
    )

    # --- 価格帯別（売れた商品） ---
    bands: list[PriceBand] = []
    for label, low, high in PRICE_BANDS:
        in_band = [
            s
            for s in sold_listings
            if s.sold_price is not None
            and s.sold_price >= low
            and (high is None or s.sold_price < high)
        ]
        band_sales = sum(s.sold_price or 0 for s in in_band)
        band_profit = sum(s.actual_profit or 0 for s in in_band)
        band_rate = (
            round(band_profit / band_sales * 100, 1) if band_sales > 0 else 0.0
        )
        bands.append(
            PriceBand(
                label=label,
                sold_count=len(in_band),
                total_profit=band_profit,
                avg_profit_rate=band_rate,
            )
        )

    # --- 監視数 ---
    active_mon = await db.execute(
        select(func.count(ProductAuctionLink.id))
        .join(Auction, ProductAuctionLink.auction_id == Auction.id)
        .where(
            ProductAuctionLink.is_monitoring.is_(True),
            Auction.status == "active",
        )
    )
    ended_mon = await db.execute(
        select(func.count(ProductAuctionLink.id))
        .join(Auction, ProductAuctionLink.auction_id == Auction.id)
        .where(
            ProductAuctionLink.is_monitoring.is_(True),
            Auction.status.in_(["ended", "sold"]),
        )
    )

    # --- 直近売れた商品（全期間から最新5件） ---
    recent_result = await db.execute(
        select(Listing, Product)
        .join(Product, Listing.product_id == Product.id)
        .where(Listing.status == "sold")
        .order_by(Listing.sold_date.desc().nullslast())
        .limit(5)
    )
    recent_sold = [
        RecentSold(
            listing_id=listing.id,
            asin=product.asin,
            product_title=product.title,
            sold_price=listing.sold_price,
            actual_profit=listing.actual_profit,
            sold_date=listing.sold_date.isoformat() if listing.sold_date else None,
        )
        for listing, product in recent_result.all()
    ]

    return StatsSummary(
        period=period,
        inventory=InventoryStats(active_count=inv_count, total_price=inv_total),
        sold=SoldStats(
            count=len(sold_listings),
            total_sales=total_sales,
            total_profit=total_profit,
            avg_profit_rate=avg_profit_rate,
        ),
        monitors=MonitorStats(
            active=active_mon.scalar_one(),
            ended=ended_mon.scalar_one(),
        ),
        price_bands=bands,
        recent_sold=recent_sold,
    )
