"""Amazon API統合テスト（スクレイパーをモック化）"""
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.scrapers.amazon_product import AmazonProduct, CompetitorOffer


def _make_product(**kwargs):
    defaults = {
        "asin": "B09TEST123",
        "title": "テスト商品",
        "price": 5980,
        "brand": "テストブランド",
        "model_number": "TH-32J300",
        "category": "家電",
        "image_url": "https://images-na.ssl-images-amazon.com/test.jpg",
        "rating": 4.5,
        "review_count": 123,
    }
    defaults.update(kwargs)
    return AmazonProduct(**defaults)


def _make_offer(**kwargs):
    defaults = {
        "price": 5000,
        "condition": "新品",
        "seller_name": "テスト出品者",
        "shipping_cost": 0,
        "is_fba": True,
    }
    defaults.update(kwargs)
    return CompetitorOffer(**defaults)


@pytest.mark.asyncio
@patch("app.routers.amazon.get_amazon_product", new_callable=AsyncMock)
async def test_amazon_product(mock_scrape):
    """GET /api/amazon/product/{asin} が商品情報を返す"""
    mock_scrape.return_value = _make_product()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/amazon/product/B09TEST123")
    assert resp.status_code == 200
    data = resp.json()
    assert data["asin"] == "B09TEST123"
    assert data["title"] == "テスト商品"
    assert data["price"] == 5980
    assert data["rating"] == 4.5


@pytest.mark.asyncio
@patch("app.routers.amazon.get_amazon_product", new_callable=AsyncMock)
async def test_amazon_product_not_found(mock_scrape):
    """GET /api/amazon/product/{asin} 見つからない場合404"""
    mock_scrape.return_value = None
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/amazon/product/B000000000")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_amazon_product_invalid_asin():
    """GET /api/amazon/product/{asin} 不正なASINは422"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/amazon/product/bad")
    assert resp.status_code == 422


@pytest.mark.asyncio
@patch("app.routers.amazon.get_amazon_product", new_callable=AsyncMock)
async def test_amazon_save_product(mock_scrape):
    """POST /api/amazon/product/{asin}/save がDB保存して返す"""
    mock_scrape.return_value = _make_product()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/amazon/product/B09TEST123/save")
    assert resp.status_code == 200
    data = resp.json()
    assert data["asin"] == "B09TEST123"
    assert data["id"] > 0
    assert data["price_updated_at"] is not None


@pytest.mark.asyncio
@patch("app.routers.amazon.get_amazon_product", new_callable=AsyncMock)
async def test_amazon_save_product_update(mock_scrape):
    """POST /api/amazon/product/{asin}/save 2回目は更新"""
    mock_scrape.return_value = _make_product()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp1 = await client.post("/api/amazon/product/B09TEST123/save")
        assert resp1.status_code == 200
        id1 = resp1.json()["id"]

        # 2回目（更新）
        mock_scrape.return_value = _make_product(price=6980)
        resp2 = await client.post("/api/amazon/product/B09TEST123/save")
        assert resp2.status_code == 200
        assert resp2.json()["id"] == id1
        assert resp2.json()["price"] == 6980


@pytest.mark.asyncio
@patch("app.routers.amazon.get_competitor_offers", new_callable=AsyncMock)
async def test_amazon_competitors(mock_offers):
    """GET /api/amazon/competitors/{asin} が競合価格を返す"""
    mock_offers.return_value = [
        _make_offer(price=5000, condition="新品"),
        _make_offer(price=4500, condition="新品", seller_name="出品者B", shipping_cost=500),
        _make_offer(price=3000, condition="中古", seller_name="中古店", is_fba=False),
    ]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/amazon/competitors/B09TEST123")
    assert resp.status_code == 200
    data = resp.json()
    assert data["asin"] == "B09TEST123"
    assert len(data["offers"]) == 3
    assert data["lowest_new_price"] == 5000  # 5000+0
    assert data["lowest_used_price"] == 3000  # 3000+0


@pytest.mark.asyncio
@patch("app.routers.amazon.get_competitor_offers", new_callable=AsyncMock)
async def test_amazon_competitors_empty(mock_offers):
    """GET /api/amazon/competitors/{asin} 競合なし"""
    mock_offers.return_value = []
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/amazon/competitors/B09TEST123")
    assert resp.status_code == 200
    data = resp.json()
    assert data["offers"] == []
    assert data["lowest_new_price"] is None
    assert data["lowest_used_price"] is None
