"""テンプレートAPIの統合テスト"""
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_template_crud():
    """テンプレートのCRUD一連操作"""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        # Create
        resp = await client.post(
            "/api/templates/",
            json={"name": "テスト用テンプレート", "body": "商品説明: {title}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "テスト用テンプレート"
        template_id = data["id"]

        # Read (list)
        resp = await client.get("/api/templates/")
        assert resp.status_code == 200
        templates = resp.json()
        assert any(t["id"] == template_id for t in templates)

        # Read (single)
        resp = await client.get(f"/api/templates/{template_id}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "テスト用テンプレート"

        # Update
        resp = await client.put(
            f"/api/templates/{template_id}",
            json={"name": "更新済みテンプレート"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "更新済みテンプレート"
        assert resp.json()["body"] == "商品説明: {title}"  # bodyは変更なし

        # Delete
        resp = await client.delete(f"/api/templates/{template_id}")
        assert resp.status_code == 200

        # Verify deleted
        resp = await client.get(f"/api/templates/{template_id}")
        assert resp.status_code == 404


@pytest.mark.asyncio
async def test_template_not_found():
    """存在しないテンプレートの取得 → 404"""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/api/templates/99999")
        assert resp.status_code == 404
