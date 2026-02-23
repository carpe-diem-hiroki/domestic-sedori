"""価格計算APIの統合テスト"""
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_calculate_endpoint():
    """POST /api/pricing/calculate が正しい結果を返す"""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/api/pricing/calculate",
            json={
                "selling_price": 10000,
                "expected_winning_price": 5000,
                "fee_rate": 0.15,
                "shipping_cost": 800,
                "other_cost": 0,
            },
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["selling_price"] == 10000
    assert data["amazon_fee"] == 1500
    assert data["profit"] == 2700
    assert data["profit_rate"] == 27.0


@pytest.mark.asyncio
async def test_estimate_endpoint():
    """POST /api/pricing/estimate が中央値を返す"""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/api/pricing/estimate",
            json={"history_prices": [1000, 2000, 3000]},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["expected_winning_price"] == 2000
    assert data["source"] == "history_median"
    assert data["data_count"] == 3


@pytest.mark.asyncio
async def test_estimate_buynow_fallback():
    """POST /api/pricing/estimate 履歴なし→即決価格70%"""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/api/pricing/estimate",
            json={"history_prices": [], "buy_now_price": 10000},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["expected_winning_price"] == 7000
    assert data["source"] == "buynow_70pct"


@pytest.mark.asyncio
async def test_estimate_no_data():
    """POST /api/pricing/estimate データなし→None"""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/api/pricing/estimate",
            json={"history_prices": []},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["expected_winning_price"] is None
    assert data["source"] == "none"


@pytest.mark.asyncio
async def test_suggest_endpoint():
    """POST /api/pricing/suggest が推奨価格を返す"""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/api/pricing/suggest",
            json={
                "expected_winning_price": 5000,
                "fee_rate": 0.15,
                "shipping_cost": 800,
                "target_profit_rate": 20.0,
            },
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["suggested_price"] > 0
    assert data["suggested_price"] % 100 == 0
    assert data["actual_profit_rate"] >= 19.0  # 目標付近


@pytest.mark.asyncio
async def test_health_endpoint():
    """GET /api/health"""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
