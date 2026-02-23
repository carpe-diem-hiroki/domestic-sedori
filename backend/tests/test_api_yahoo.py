"""ヤフオクAPI統合テスト（スクレイパーをモック化）"""
from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.scrapers.yahoo_detail import AuctionDetail
from app.scrapers.yahoo_history import HistoryResult
from app.scrapers.yahoo_search import SearchResult


def _make_search_result(**kwargs):
    defaults = {
        "auction_id": "a123",
        "title": "テスト商品",
        "current_price": 5000,
        "buy_now_price": 8000,
        "image_url": "https://img.example.com/1.jpg",
        "end_time_text": "残り2日",
        "bid_count": 3,
        "url": "https://page.auctions.yahoo.co.jp/jp/auction/a123",
    }
    defaults.update(kwargs)
    return SearchResult(**defaults)


def _make_detail(**kwargs):
    defaults = {
        "auction_id": "a123",
        "title": "テスト商品詳細",
        "current_price": 5000,
        "buy_now_price": 8000,
        "start_price": 1000,
        "bid_count": 3,
        "seller_id": "seller1",
        "seller_name": "テスト出品者",
        "start_time": datetime(2026, 2, 20, 10, 0),
        "end_time": datetime(2026, 2, 27, 10, 0),
        "condition": "目立った傷や汚れなし",
        "image_urls": ["https://img.example.com/1.jpg"],
        "shipping_info": "送料無料",
        "category": "家電",
        "brand": "テストブランド",
        "url": "https://page.auctions.yahoo.co.jp/jp/auction/a123",
    }
    defaults.update(kwargs)
    return AuctionDetail(**defaults)


def _make_history(**kwargs):
    defaults = {
        "auction_id": "h123",
        "title": "落札テスト",
        "winning_price": 4000,
        "end_date": datetime(2026, 2, 15, 16, 0),
        "bid_count": 5,
    }
    defaults.update(kwargs)
    return HistoryResult(**defaults)


@pytest.mark.asyncio
@patch("app.routers.yahoo.search_yahoo_auctions", new_callable=AsyncMock)
async def test_yahoo_search(mock_search):
    """GET /api/yahoo/search が検索結果を返す"""
    mock_search.return_value = [_make_search_result(), _make_search_result(auction_id="b456")]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/yahoo/search?keyword=テスト")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["auction_id"] == "a123"
    assert data[0]["current_price"] == 5000
    mock_search.assert_called_once_with("テスト")


@pytest.mark.asyncio
@patch("app.routers.yahoo.search_yahoo_auctions", new_callable=AsyncMock)
async def test_yahoo_search_empty(mock_search):
    """GET /api/yahoo/search 結果なし"""
    mock_search.return_value = []
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/yahoo/search?keyword=存在しない")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_yahoo_search_no_keyword():
    """GET /api/yahoo/search キーワードなしは422"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/yahoo/search")
    assert resp.status_code == 422


@pytest.mark.asyncio
@patch("app.routers.yahoo.get_auction_detail", new_callable=AsyncMock)
async def test_yahoo_detail(mock_detail):
    """GET /api/yahoo/detail/{id} が詳細を返す"""
    mock_detail.return_value = _make_detail()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/yahoo/detail/a123")
    assert resp.status_code == 200
    data = resp.json()
    assert data["auction_id"] == "a123"
    assert data["title"] == "テスト商品詳細"
    assert data["current_price"] == 5000
    assert data["seller_name"] == "テスト出品者"


@pytest.mark.asyncio
@patch("app.routers.yahoo.get_auction_detail", new_callable=AsyncMock)
async def test_yahoo_detail_not_found(mock_detail):
    """GET /api/yahoo/detail/{id} 404"""
    mock_detail.return_value = None
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/yahoo/detail/z999")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_yahoo_detail_invalid_id():
    """GET /api/yahoo/detail/{id} 不正なIDは422"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/yahoo/detail/bad-id!")
    assert resp.status_code == 422


@pytest.mark.asyncio
@patch("app.routers.yahoo.search_auction_history", new_callable=AsyncMock)
async def test_yahoo_history(mock_history):
    """GET /api/yahoo/history が落札履歴を返す"""
    mock_history.return_value = [
        _make_history(winning_price=3000),
        _make_history(winning_price=4000, auction_id="h456"),
        _make_history(winning_price=5000, auction_id="h789"),
    ]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/yahoo/history?keyword=テスト")
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 3
    assert data["median_price"] == 4000
    assert data["average_price"] == 4000


@pytest.mark.asyncio
@patch("app.routers.yahoo.search_auction_history", new_callable=AsyncMock)
async def test_yahoo_history_empty(mock_history):
    """GET /api/yahoo/history 結果なし"""
    mock_history.return_value = []
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/yahoo/history?keyword=存在しない")
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 0
    assert data["median_price"] is None
