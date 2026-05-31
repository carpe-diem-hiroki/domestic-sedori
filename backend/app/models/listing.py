from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Listing(Base):
    __tablename__ = "listings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id"))
    link_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("product_auction_links.id"), nullable=True
    )
    sku: Mapped[str] = mapped_column(String, unique=True)
    price: Mapped[int] = mapped_column(Integer)
    condition: Mapped[str] = mapped_column(String, default="UsedGood")
    sub_condition: Mapped[str] = mapped_column(String, default="良い")
    lead_time_days: Mapped[int] = mapped_column(Integer, default=8)
    quantity: Mapped[int] = mapped_column(Integer, default=1)  # 0=停止, 1=出品中
    status: Mapped[str] = mapped_column(String, default="active")  # active/inactive/sold/deleted
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    template_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("templates.id"), nullable=True
    )
    # 実績トラッキング
    actual_purchase_price: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # 実際の落札価格（仕入れ値）
    min_price: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # 最低販売価格（自動値下げの下限）
    sold_price: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # 実際に売れた価格
    sold_date: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )  # 販売日
    actual_profit: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # 実績利益 = sold_price - actual_purchase_price - 手数料 - 送料
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
