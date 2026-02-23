"""スケジューラーサービスのユニットテスト"""
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.scrapers.yahoo_detail import AuctionDetail
from app.services.scheduler import (
    check_monitored_auctions,
    get_scheduler_status,
    start_scheduler,
    stop_scheduler,
)


def _make_mock_auction(auction_id="a123", title="テスト", current_price=5000, status="active"):
    """モック用Auctionオブジェクト"""
    mock = MagicMock()
    mock.id = 1
    mock.auction_id = auction_id
    mock.title = title
    mock.current_price = current_price
    mock.buy_now_price = 8000
    mock.status = status
    mock.previous_price = None
    mock.price_changed = False
    mock.last_checked = None
    return mock


def _make_detail(current_price=6000, end_time=None):
    return AuctionDetail(
        auction_id="a123",
        title="テスト商品",
        current_price=current_price,
        buy_now_price=8000,
        end_time=end_time or datetime(2030, 12, 31, 23, 59),
    )


@pytest.mark.asyncio
@patch("app.services.scheduler.async_session")
@patch("app.services.scheduler.get_auction_detail", new_callable=AsyncMock)
async def test_check_no_auctions(mock_detail, mock_session_factory):
    """監視対象なし → 何もしない"""
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_db.execute = AsyncMock(return_value=mock_result)
    mock_db.commit = AsyncMock()

    mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_db)
    mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

    await check_monitored_auctions()
    mock_detail.assert_not_called()


@pytest.mark.asyncio
@patch("app.services.scheduler.async_session")
@patch("app.services.scheduler.get_auction_detail", new_callable=AsyncMock)
async def test_check_price_change(mock_detail, mock_session_factory):
    """価格変動があれば通知を作成"""
    auction = _make_mock_auction(current_price=5000)
    mock_detail.return_value = _make_detail(current_price=6000)

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [auction]
    mock_db.execute = AsyncMock(return_value=mock_result)
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_db)
    mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

    await check_monitored_auctions()

    # 価格が更新され、通知が追加される
    assert auction.current_price == 6000
    assert auction.previous_price == 5000
    assert auction.price_changed is True
    # db.add が呼ばれる（Notification追加）
    assert mock_db.add.call_count >= 1


@pytest.mark.asyncio
@patch("app.services.scheduler.async_session")
@patch("app.services.scheduler.get_auction_detail", new_callable=AsyncMock)
async def test_check_auction_ended(mock_detail, mock_session_factory):
    """終了オークションを検知"""
    auction = _make_mock_auction(current_price=5000)
    # 過去の end_time を返す
    mock_detail.return_value = _make_detail(
        current_price=5000,
        end_time=datetime(2020, 1, 1, 0, 0),
    )

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [auction]
    mock_db.execute = AsyncMock(return_value=mock_result)
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_db)
    mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

    await check_monitored_auctions()

    assert auction.status == "ended"
    # auction_ended 通知が追加される
    assert mock_db.add.call_count >= 1


@pytest.mark.asyncio
@patch("app.services.scheduler.async_session")
@patch("app.services.scheduler.get_auction_detail", new_callable=AsyncMock)
async def test_check_detail_fetch_failed(mock_detail, mock_session_factory):
    """詳細取得失敗 → スキップ"""
    auction = _make_mock_auction()
    mock_detail.return_value = None

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [auction]
    mock_db.execute = AsyncMock(return_value=mock_result)
    mock_db.commit = AsyncMock()

    mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_db)
    mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

    await check_monitored_auctions()
    # 価格は変わらない
    assert auction.current_price == 5000


@patch("app.services.scheduler.scheduler")
def test_start_scheduler(mock_sched):
    """start_scheduler がジョブを追加して起動する"""
    mock_sched.running = False
    start_scheduler()
    mock_sched.add_job.assert_called_once()
    mock_sched.start.assert_called_once()


@patch("app.services.scheduler.scheduler")
def test_start_scheduler_already_running(mock_sched):
    """既に起動中なら何もしない"""
    mock_sched.running = True
    start_scheduler()
    mock_sched.start.assert_not_called()


@patch("app.services.scheduler.scheduler")
def test_stop_scheduler(mock_sched):
    """stop_scheduler が停止する"""
    mock_sched.running = True
    stop_scheduler()
    mock_sched.shutdown.assert_called_once_with(wait=False)


@patch("app.services.scheduler.scheduler")
def test_stop_scheduler_not_running(mock_sched):
    """起動中でなければ何もしない"""
    mock_sched.running = False
    stop_scheduler()
    mock_sched.shutdown.assert_not_called()


@patch("app.services.scheduler.scheduler")
def test_get_scheduler_status(mock_sched):
    """get_scheduler_status がステータスを返す"""
    mock_sched.running = True
    mock_job = MagicMock()
    mock_job.next_run_time = datetime(2026, 2, 23, 15, 0)
    mock_sched.get_job.return_value = mock_job

    status = get_scheduler_status()
    assert status["running"] is True
    assert "2026-02-23" in status["next_run"]


@patch("app.services.scheduler.scheduler")
def test_get_scheduler_status_no_job(mock_sched):
    """ジョブがない場合"""
    mock_sched.running = False
    mock_sched.get_job.return_value = None

    status = get_scheduler_status()
    assert status["running"] is False
    assert status["next_run"] is None
