"""監視対象APIの統合テスト"""
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_monitor_add_and_list():
    """POST /api/monitor/add → GET /api/monitor/list"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 追加
        resp = await client.post(
            "/api/monitor/add",
            json={
                "asin": "B09TEST123",
                "product_title": "テスト商品",
                "auction_id": "a123456789",
                "auction_title": "ヤフオクテスト",
                "current_price": 5000,
                "buy_now_price": 8000,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["asin"] == "B09TEST123"
        assert data["yahoo_auction_id"] == "a123456789"
        assert data["is_monitoring"] is True
        link_id = data["id"]

        # 一覧
        resp = await client.get("/api/monitor/list?status=active")
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) == 1
        assert items[0]["id"] == link_id


@pytest.mark.asyncio
async def test_monitor_get_and_delete():
    """GET /api/monitor/{id} → DELETE /api/monitor/{id}"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # まず追加
        resp = await client.post(
            "/api/monitor/add",
            json={
                "asin": "B09TEST456",
                "product_title": "テスト商品2",
                "auction_id": "b987654321",
                "auction_title": "ヤフオクテスト2",
                "current_price": 3000,
            },
        )
        link_id = resp.json()["id"]

        # 詳細取得
        resp = await client.get(f"/api/monitor/{link_id}")
        assert resp.status_code == 200
        assert resp.json()["asin"] == "B09TEST456"

        # 削除
        resp = await client.delete(f"/api/monitor/{link_id}")
        assert resp.status_code == 200
        assert "removed" in resp.json()["message"].lower() or "Monitor" in resp.json()["message"]

        # 削除後は一覧に出ない（is_monitoring=Falseになる）
        resp = await client.get("/api/monitor/list?status=active")
        items = resp.json()["items"]
        assert all(item["id"] != link_id or not item["is_monitoring"] for item in items)


@pytest.mark.asyncio
async def test_monitor_get_not_found():
    """GET /api/monitor/{id} 存在しないID"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/monitor/99999")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_monitor_delete_not_found():
    """DELETE /api/monitor/{id} 存在しないID"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.delete("/api/monitor/99999")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_monitor_add_duplicate_reactivates():
    """同じASIN+オークションIDを2回追加しても再有効化される"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = {
            "asin": "B09DUPLIC0",
            "product_title": "重複テスト",
            "auction_id": "dup123",
            "auction_title": "重複オークション",
            "current_price": 1000,
        }
        resp1 = await client.post("/api/monitor/add", json=payload)
        assert resp1.status_code == 200
        link_id = resp1.json()["id"]

        # 削除
        await client.delete(f"/api/monitor/{link_id}")

        # 再追加
        resp2 = await client.post("/api/monitor/add", json=payload)
        assert resp2.status_code == 200
        assert resp2.json()["id"] == link_id
        assert resp2.json()["is_monitoring"] is True


@pytest.mark.asyncio
async def test_monitor_add_invalid_asin():
    """POST /api/monitor/add 不正なASINは422"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/monitor/add",
            json={
                "asin": "bad",
                "product_title": "テスト",
                "auction_id": "a123",
                "auction_title": "テスト",
            },
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_monitor_list_ended():
    """GET /api/monitor/list?status=ended"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/monitor/list?status=ended")
    assert resp.status_code == 200
    assert resp.json()["total"] >= 0


@pytest.mark.asyncio
async def test_monitor_list_invalid_status():
    """GET /api/monitor/list?status=invalid は422"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/monitor/list?status=invalid")
    assert resp.status_code == 422
