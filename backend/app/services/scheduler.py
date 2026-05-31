"""監視ジョブスケジューラー - ヤフオク価格の定期チェック"""
import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import desc, select

from app.config import settings
from app.database import async_session
from app.models import (
    Auction,
    Notification,
    PriceSnapshot,
    Product,
    ProductAuctionLink,
)
from app.scrapers.amazon_product import get_amazon_product
from app.scrapers.yahoo_detail import get_auction_detail
from app.services.pricing import calculate_pricing

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def check_monitored_auctions():
    """監視対象の全オークションの価格を更新"""
    logger.info("Starting scheduled auction check...")

    async with async_session() as db:
        # 監視中 + activeのオークションを link・product と一緒に取得
        result = await db.execute(
            select(ProductAuctionLink, Auction, Product)
            .join(Auction, ProductAuctionLink.auction_id == Auction.id)
            .join(Product, ProductAuctionLink.product_id == Product.id)
            .where(
                ProductAuctionLink.is_monitoring.is_(True),
                Auction.status == "active",
            )
        )
        rows = result.all()

        if not rows:
            logger.info("No active monitored auctions to check")
            return

        logger.info(f"Checking {len(rows)} auctions...")
        updated = 0
        ended = 0

        for link, auction, product in rows:
            try:
                detail = await get_auction_detail(auction.auction_id)
                if not detail:
                    logger.warning(f"Could not fetch detail for {auction.auction_id}")
                    continue

                now = datetime.now()

                # 価格変動チェック
                old_price = auction.current_price
                new_price = detail.current_price

                if old_price is not None and new_price is not None and old_price != new_price:
                    auction.previous_price = old_price
                    auction.price_changed = True

                    # 通知を作成
                    direction = "上昇" if new_price > old_price else "下落"
                    diff = abs(new_price - old_price)
                    notification = Notification(
                        type="price_change",
                        title=f"価格{direction}: {auction.title[:30]}",
                        message=(
                            f"{auction.title}\n"
                            f"{old_price:,}円 → {new_price:,}円 ({direction}{diff:,}円)"
                        ),
                        link_url=f"/monitor/{auction.id}",
                    )
                    db.add(notification)
                    logger.info(
                        f"Price change for {auction.auction_id}: "
                        f"{old_price} -> {new_price}"
                    )

                # 価格更新
                if detail.current_price is not None:
                    auction.current_price = detail.current_price
                if detail.buy_now_price is not None:
                    auction.buy_now_price = detail.buy_now_price

                # 終了チェック
                if detail.end_time and detail.end_time < now:
                    auction.status = "ended"
                    ended += 1

                    notification = Notification(
                        type="auction_ended",
                        title=f"オークション終了: {auction.title[:30]}",
                        message=(
                            f"{auction.title}\n"
                            f"最終価格: {auction.current_price:,}円"
                            if auction.current_price
                            else f"{auction.title}\n終了"
                        ),
                        link_url=f"/monitor/{auction.id}",
                    )
                    db.add(notification)

                auction.last_checked = now

                # Amazon価格リフレッシュ → スナップショット記録 → 価格差チャンス検出
                await _process_price_intelligence(db, link, auction, product, now)

                updated += 1

            except Exception as e:
                logger.error(f"Error checking auction {auction.auction_id}: {e}")

        await db.commit()
        logger.info(
            f"Check complete: {updated} updated, {ended} ended"
        )


async def _maybe_refresh_amazon_price(product: Product, now: datetime) -> None:
    """Amazon価格が古い/未取得なら再スクレイピングして更新する"""
    if not settings.amazon_refresh_enabled:
        return

    fresh_enough = (
        product.amazon_price is not None
        and product.price_updated_at is not None
        and product.price_updated_at
        > now - timedelta(hours=settings.amazon_refresh_interval_hours)
    )
    if fresh_enough:
        return

    try:
        amzn = await get_amazon_product(product.asin)
        if amzn and amzn.price is not None:
            product.amazon_price = amzn.price
            product.price_updated_at = now
            if amzn.category and not product.category:
                product.category = amzn.category
            logger.info(f"Amazon price refreshed: {product.asin} = {amzn.price}")
    except Exception as e:
        logger.warning(f"Amazon refresh failed for {product.asin}: {e}")


async def _get_previous_profit_rate(db, link_id: int) -> float | None:
    """直近のスナップショットの利益率を取得（チャンスのエッジ検出用）"""
    result = await db.execute(
        select(PriceSnapshot.profit_rate)
        .where(PriceSnapshot.link_id == link_id)
        .order_by(desc(PriceSnapshot.captured_at))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _process_price_intelligence(db, link, auction, product, now) -> None:
    """価格差インテリジェンス処理

    1. Amazon価格をリフレッシュ
    2. 想定利益・利益率を計算
    3. スナップショットを記録（グラフ用）
    4. 利益率が閾値を新たに超えたら「仕入れチャンス」通知を発火（エッジ検出）
    """
    await _maybe_refresh_amazon_price(product, now)

    yahoo_price = auction.current_price
    amazon_price = product.amazon_price

    profit = None
    profit_rate = None
    if amazon_price and yahoo_price:
        calc = calculate_pricing(
            selling_price=amazon_price,
            expected_winning_price=yahoo_price,
            category=product.category,
            shipping_cost=settings.chance_default_shipping,
        )
        profit = calc.profit
        profit_rate = calc.profit_rate

    # エッジ検出のため「直近の利益率」を先に取得（新スナップショット追加前）
    prev_rate = await _get_previous_profit_rate(db, link.id)

    db.add(
        PriceSnapshot(
            link_id=link.id,
            yahoo_price=yahoo_price,
            amazon_price=amazon_price,
            profit_rate=profit_rate,
        )
    )

    # 仕入れチャンス判定: 今回は閾値超え かつ 前回は閾値未満（新規発生時のみ通知）
    if profit_rate is None or profit is None:
        return

    meets_now = (
        profit_rate >= settings.chance_min_profit_rate
        and profit >= settings.chance_min_profit_amount
    )
    met_before = prev_rate is not None and prev_rate >= settings.chance_min_profit_rate

    if meets_now and not met_before:
        db.add(
            Notification(
                type="price_gap",
                title=f"仕入れチャンス: {product.title[:30]}",
                message=(
                    f"{product.title}\n"
                    f"ヤフオク {yahoo_price:,}円 → Amazon {amazon_price:,}円\n"
                    f"想定利益 {profit:,}円（利益率 {profit_rate}%）"
                ),
                link_url=f"/monitors/{link.id}",
            )
        )
        logger.info(
            f"Chance detected: link={link.id} profit={profit} rate={profit_rate}%"
        )


def start_scheduler():
    """スケジューラーを起動"""
    if scheduler.running:
        logger.warning("Scheduler is already running")
        return

    scheduler.add_job(
        check_monitored_auctions,
        "interval",
        minutes=settings.scheduler_interval_minutes,
        id="check_auctions",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(
        f"Scheduler started (interval: {settings.scheduler_interval_minutes}min)"
    )


def stop_scheduler():
    """スケジューラーを停止"""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")


def get_scheduler_status() -> dict:
    """スケジューラーの状態を取得"""
    job = scheduler.get_job("check_auctions")
    return {
        "running": scheduler.running,
        "interval_minutes": settings.scheduler_interval_minutes,
        "next_run": job.next_run_time.isoformat() if job and job.next_run_time else None,
    }
