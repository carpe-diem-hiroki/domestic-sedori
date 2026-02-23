"""通知APIの統合テスト"""
import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import patch

from app.main import app


# --- 通知テスト ---


@pytest.mark.asyncio
async def test_notifications_empty():
    """通知が空の場合"""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/api/notifications/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["unread_count"] == 0


@pytest.mark.asyncio
async def test_unread_count():
    """未読数の取得"""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/api/notifications/unread-count")
        assert resp.status_code == 200
        data = resp.json()
        assert "unread_count" in data
        assert isinstance(data["unread_count"], int)


@pytest.mark.asyncio
async def test_mark_all_read():
    """全既読API"""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post("/api/notifications/read-all")
        assert resp.status_code == 200
        assert resp.json()["detail"] == "All marked as read"


# --- スケジューラーテスト ---


@pytest.mark.asyncio
async def test_scheduler_status():
    """スケジューラーのステータス取得"""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/api/scheduler/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "running" in data
        assert "interval_minutes" in data
        assert isinstance(data["running"], bool)


@pytest.mark.asyncio
async def test_scheduler_start_stop():
    """スケジューラーの開始と停止"""
    # start_scheduler / stop_scheduler / get_scheduler_status をモック化して
    # APSchedulerの実装に依存しないテストにする
    mock_running = {"value": False}

    def mock_start():
        mock_running["value"] = True

    def mock_stop():
        mock_running["value"] = False

    def mock_status():
        return {
            "running": mock_running["value"],
            "interval_minutes": 10,
            "next_run": None,
        }

    with (
        patch("app.routers.scheduler.start_scheduler", side_effect=mock_start),
        patch("app.routers.scheduler.stop_scheduler", side_effect=mock_stop),
        patch("app.routers.scheduler.get_scheduler_status", side_effect=mock_status),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            # Start
            resp = await client.post("/api/scheduler/start")
            assert resp.status_code == 200

            # Verify running
            resp = await client.get("/api/scheduler/status")
            assert resp.json()["running"] is True

            # Stop
            resp = await client.post("/api/scheduler/stop")
            assert resp.status_code == 200

            # Verify stopped
            resp = await client.get("/api/scheduler/status")
            assert resp.json()["running"] is False
