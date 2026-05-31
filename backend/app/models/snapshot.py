from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PriceSnapshot(Base):
    """価格推移グラフ用の時系列スナップショット

    スケジューラーが監視対象ごとに定期記録する。
    1行 = ある時点での「ヤフオク相場・Amazon価格・想定利益率」のセット。
    """

    __tablename__ = "price_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    link_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("product_auction_links.id"), index=True
    )
    yahoo_price: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # ヤフオク現在価格（落札相場の代理）
    amazon_price: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # Amazon販売価格
    profit_rate: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )  # 想定利益率（%）
    captured_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), index=True
    )
