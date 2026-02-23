from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Auction(Base):
    __tablename__ = "auctions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    auction_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    title: Mapped[str] = mapped_column(String)
    current_price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    buy_now_price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    seller_id: Mapped[str | None] = mapped_column(String, nullable=True)
    start_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    end_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String, default="active")  # active/ended/sold
    image_urls: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    url: Mapped[str | None] = mapped_column(String, nullable=True)
    last_checked: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # 価格変動追跡
    previous_price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price_changed: Mapped[bool] = mapped_column(Boolean, default=False)


class AuctionHistory(Base):
    __tablename__ = "auction_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    keyword: Mapped[str] = mapped_column(String, index=True)
    auction_title: Mapped[str | None] = mapped_column(String, nullable=True)
    winning_price: Mapped[int] = mapped_column(Integer)
    end_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )


class ProductAuctionLink(Base):
    __tablename__ = "product_auction_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id"))
    auction_id: Mapped[int] = mapped_column(Integer, ForeignKey("auctions.id"))
    is_monitoring: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
