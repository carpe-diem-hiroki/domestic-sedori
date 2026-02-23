"""監視ジョブスケジューラー - ヤフオク価格の定期チェック"""
import logging
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.models import Auction, Notification, ProductAuctionLink
from app.scrapers.yahoo_detail import get_auction_detail

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def check_monitored_auctions():
    """監視対象の全オークションの価格を更新"""
    logger.info("Starting scheduled auction check...")

    async with async_session() as db:
        # 監視中 + activeのオークションを取得
        result = await db.execute(
            select(Auction)
            .join(
                ProductAuctionLink,
                ProductAuctionLink.auction_id == Auction.id,
            )
            .where(
                ProductAuctionLink.is_monitoring.is_(True),
                Auction.status == "active",
            )
            .distinct()
        )
        auctions = result.scalars().all()

        if not auctions:
            logger.info("No active monitored auctions to check")
            return

        logger.info(f"Checking {len(auctions)} auctions...")
        updated = 0
        ended = 0

        for auction in auctions:
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
                updated += 1

            except Exception as e:
                logger.error(f"Error checking auction {auction.auction_id}: {e}")

        await db.commit()
        logger.info(
            f"Check complete: {updated} updated, {ended} ended"
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
