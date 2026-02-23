"""スクレイパーのパース関数テスト（Playwright Page をモック化）"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.scrapers.amazon_product import (
    AmazonProduct,
    CompetitorOffer,
    _parse_offers_page,
    _parse_product_page,
    get_amazon_product,
    get_competitor_offers,
)
from app.scrapers.yahoo_search import SearchResult, parse_search_results, search_yahoo_auctions
from app.scrapers.yahoo_detail import AuctionDetail, parse_auction_detail, get_auction_detail
from app.scrapers.yahoo_history import HistoryResult, parse_closed_results, search_auction_history


# --- ヘルパー: query_selector のモック ---

def _mock_element(inner_text="", src=None, href=None, attrs=None):
    """Playwright ElementHandle のモック"""
    el = AsyncMock()
    el.inner_text = AsyncMock(return_value=inner_text)
    el.get_attribute = AsyncMock(side_effect=lambda name: (attrs or {}).get(name))
    if src:
        el.get_attribute = AsyncMock(side_effect=lambda name: src if name == "src" else (attrs or {}).get(name))
    return el


def _mock_page(query_results=None, query_all_results=None):
    """Playwright Page のモック"""
    page = AsyncMock()
    # query_selector は呼ばれるたびに query_results から pop
    if query_results is not None:
        page.query_selector = AsyncMock(side_effect=query_results)
    else:
        page.query_selector = AsyncMock(return_value=None)
    # query_selector_all はデフォルトで空リスト
    if query_all_results is not None:
        page.query_selector_all = AsyncMock(side_effect=query_all_results)
    else:
        page.query_selector_all = AsyncMock(return_value=[])
    return page


# ========================================
# Yahoo検索パース
# ========================================

class TestParseSearchResults:
    """parse_search_results のテスト"""

    @pytest.mark.asyncio
    async def test_empty_page(self):
        page = _mock_page(query_all_results=[[]])
        results = await parse_search_results(page)
        assert results == []

    @pytest.mark.asyncio
    async def test_single_item(self):
        # li.Product 内の要素をモック
        link_el = AsyncMock()
        link_el.get_attribute = AsyncMock(side_effect=lambda name: {
            "data-auction-id": "abc123",
            "data-auction-title": "テスト商品",
            "data-auction-price": "5000",
        }.get(name))

        item = AsyncMock()
        item.query_selector = AsyncMock(side_effect=[
            link_el,  # a.Product__titleLink
            None,     # .Product__bonus
            None,     # img.Product__imageData
            None,     # .Product__time
            None,     # .Product__bid
        ])

        page = AsyncMock()
        page.query_selector_all = AsyncMock(return_value=[item])

        results = await parse_search_results(page)
        assert len(results) == 1
        assert results[0].auction_id == "abc123"
        assert results[0].current_price == 5000

    @pytest.mark.asyncio
    async def test_item_with_no_link(self):
        """リンクがない項目はスキップ"""
        item = AsyncMock()
        item.query_selector = AsyncMock(return_value=None)

        page = AsyncMock()
        page.query_selector_all = AsyncMock(return_value=[item])

        results = await parse_search_results(page)
        assert results == []


class TestSearchYahooAuctions:
    """search_yahoo_auctions のテスト"""

    @pytest.mark.asyncio
    @patch("app.scrapers.yahoo_search.get_page")
    @patch("app.scrapers.yahoo_search.get_browser")
    @patch("app.scrapers.yahoo_search.fetch_with_retry", new_callable=AsyncMock)
    async def test_search_failure(self, mock_fetch, mock_browser, mock_page):
        mock_fetch.return_value = False
        mock_browser_ctx = AsyncMock()
        mock_browser.__aenter__ = AsyncMock(return_value=mock_browser_ctx)
        mock_browser.__aexit__ = AsyncMock(return_value=False)
        mock_page_ctx = AsyncMock()
        mock_page.__aenter__ = AsyncMock(return_value=mock_page_ctx)
        mock_page.__aexit__ = AsyncMock(return_value=False)
        mock_browser.return_value = mock_browser
        mock_page.return_value = mock_page

        results = await search_yahoo_auctions("テスト")
        assert results == []


# ========================================
# Yahoo詳細パース
# ========================================

class TestParseAuctionDetail:

    @pytest.mark.asyncio
    async def test_no_title(self):
        """タイトルがない場合はNoneを返す"""
        page = AsyncMock()
        page.query_selector = AsyncMock(return_value=None)
        page.query_selector_all = AsyncMock(return_value=[])

        result = await parse_auction_detail(page, "test123")
        assert result is None

    @pytest.mark.asyncio
    async def test_basic_detail(self):
        """基本的な詳細パース"""
        title_el = AsyncMock()
        title_el.inner_text = AsyncMock(return_value="  テスト商品タイトル  ")

        page = AsyncMock()
        # query_selector の呼び出し順序: h1, bid, seller
        page.query_selector = AsyncMock(side_effect=[
            title_el,  # h1
            None,      # a[href*='bid_hist']
            None,      # a[href*='seller']
        ])
        # query_selector_all: dl, table tr, img
        page.query_selector_all = AsyncMock(return_value=[])

        result = await parse_auction_detail(page, "test123")
        assert result is not None
        assert result.title == "テスト商品タイトル"
        assert result.auction_id == "test123"


class TestGetAuctionDetail:

    @pytest.mark.asyncio
    @patch("app.scrapers.yahoo_detail.get_page")
    @patch("app.scrapers.yahoo_detail.get_browser")
    @patch("app.scrapers.yahoo_detail.fetch_with_retry", new_callable=AsyncMock)
    async def test_fetch_failure(self, mock_fetch, mock_browser, mock_page):
        mock_fetch.return_value = False
        mock_browser_ctx = AsyncMock()
        mock_browser.__aenter__ = AsyncMock(return_value=mock_browser_ctx)
        mock_browser.__aexit__ = AsyncMock(return_value=False)
        mock_page_ctx = AsyncMock()
        mock_page.__aenter__ = AsyncMock(return_value=mock_page_ctx)
        mock_page.__aexit__ = AsyncMock(return_value=False)
        mock_browser.return_value = mock_browser
        mock_page.return_value = mock_page

        result = await get_auction_detail("test123")
        assert result is None


# ========================================
# Yahoo落札履歴パース
# ========================================

class TestParseClosedResults:

    @pytest.mark.asyncio
    async def test_empty_page(self):
        page = AsyncMock()
        page.query_selector_all = AsyncMock(return_value=[])
        results = await parse_closed_results(page)
        assert results == []

    @pytest.mark.asyncio
    async def test_item_without_title_link(self):
        """タイトルリンクがない項目はスキップ"""
        item = AsyncMock()
        item.query_selector = AsyncMock(return_value=None)

        page = AsyncMock()
        page.query_selector_all = AsyncMock(return_value=[item])

        results = await parse_closed_results(page)
        assert results == []


class TestSearchAuctionHistory:

    @pytest.mark.asyncio
    @patch("app.scrapers.yahoo_history.get_page")
    @patch("app.scrapers.yahoo_history.get_browser")
    @patch("app.scrapers.yahoo_history.fetch_with_retry", new_callable=AsyncMock)
    async def test_fetch_failure(self, mock_fetch, mock_browser, mock_page):
        mock_fetch.return_value = False
        mock_browser_ctx = AsyncMock()
        mock_browser.__aenter__ = AsyncMock(return_value=mock_browser_ctx)
        mock_browser.__aexit__ = AsyncMock(return_value=False)
        mock_page_ctx = AsyncMock()
        mock_page.__aenter__ = AsyncMock(return_value=mock_page_ctx)
        mock_page.__aexit__ = AsyncMock(return_value=False)
        mock_browser.return_value = mock_browser
        mock_page.return_value = mock_page

        results = await search_auction_history("テスト")
        assert results == []


# ========================================
# Amazon商品パース
# ========================================

class TestParseProductPage:

    @pytest.mark.asyncio
    async def test_empty_page(self):
        """空のページでもクラッシュしない"""
        page = AsyncMock()
        page.query_selector = AsyncMock(return_value=None)
        page.query_selector_all = AsyncMock(return_value=[])

        product = await _parse_product_page(page, "B09TEST123")
        assert product.asin == "B09TEST123"
        assert product.title is None
        assert product.price is None

    @pytest.mark.asyncio
    async def test_with_title_and_price(self):
        """タイトルと価格が取得できるケース"""
        title_el = AsyncMock()
        title_el.inner_text = AsyncMock(return_value="テストAmazon商品")

        price_el = AsyncMock()
        price_el.inner_text = AsyncMock(return_value="￥5,980")

        page = AsyncMock()
        call_count = [0]
        def query_selector_side_effect(selector):
            if "#productTitle" in selector:
                return title_el
            if "a-offscreen" in selector or "a-price" in selector:
                return price_el
            return None

        page.query_selector = AsyncMock(side_effect=query_selector_side_effect)
        page.query_selector_all = AsyncMock(return_value=[])

        product = await _parse_product_page(page, "B09TEST123")
        assert product.title == "テストAmazon商品"
        assert product.price == 5980


class TestParseOffersPage:

    @pytest.mark.asyncio
    async def test_empty_page(self):
        """出品者がいない場合"""
        page = AsyncMock()
        page.query_selector = AsyncMock(return_value=None)
        page.query_selector_all = AsyncMock(return_value=[])

        offers = await _parse_offers_page(page)
        assert offers == []

    @pytest.mark.asyncio
    async def test_pinned_offer(self):
        """pinnedオファー（Amazon販売）がある場合"""
        pinned_price = AsyncMock()
        pinned_price.inner_text = AsyncMock(return_value="￥4,980")

        pinned = AsyncMock()
        pinned.query_selector = AsyncMock(return_value=pinned_price)

        page = AsyncMock()
        def query_selector_side_effect(selector):
            if "#aod-pinned-offer" in selector:
                return pinned
            return None
        page.query_selector = AsyncMock(side_effect=query_selector_side_effect)
        page.query_selector_all = AsyncMock(return_value=[])

        offers = await _parse_offers_page(page)
        assert len(offers) == 1
        assert offers[0].price == 4980
        assert offers[0].seller_name == "Amazon.co.jp"
        assert offers[0].is_fba is True


class TestGetAmazonProduct:

    @pytest.mark.asyncio
    @patch("app.scrapers.amazon_product.get_page")
    @patch("app.scrapers.amazon_product.get_browser")
    @patch("app.scrapers.amazon_product.fetch_with_retry", new_callable=AsyncMock)
    async def test_fetch_failure(self, mock_fetch, mock_browser, mock_page):
        mock_fetch.return_value = False
        mock_browser_ctx = AsyncMock()
        mock_browser.__aenter__ = AsyncMock(return_value=mock_browser_ctx)
        mock_browser.__aexit__ = AsyncMock(return_value=False)
        mock_page_ctx = AsyncMock()
        mock_page.__aenter__ = AsyncMock(return_value=mock_page_ctx)
        mock_page.__aexit__ = AsyncMock(return_value=False)
        mock_browser.return_value = mock_browser
        mock_page.return_value = mock_page

        result = await get_amazon_product("B09TEST123")
        assert result is None

    @pytest.mark.asyncio
    @patch("app.scrapers.amazon_product.get_page")
    @patch("app.scrapers.amazon_product.get_browser")
    @patch("app.scrapers.amazon_product.fetch_with_retry", new_callable=AsyncMock)
    async def test_captcha_detected(self, mock_fetch, mock_browser, mock_page):
        mock_fetch.return_value = True
        captcha_el = AsyncMock()
        mock_page_obj = AsyncMock()
        mock_page_obj.query_selector = AsyncMock(return_value=captcha_el)
        mock_page_obj.query_selector_all = AsyncMock(return_value=[])

        mock_browser_ctx = AsyncMock()
        mock_browser.__aenter__ = AsyncMock(return_value=mock_browser_ctx)
        mock_browser.__aexit__ = AsyncMock(return_value=False)
        mock_page.__aenter__ = AsyncMock(return_value=mock_page_obj)
        mock_page.__aexit__ = AsyncMock(return_value=False)
        mock_browser.return_value = mock_browser
        mock_page.return_value = mock_page

        result = await get_amazon_product("B09TEST123")
        assert result is None

    @pytest.mark.asyncio
    @patch("app.scrapers.amazon_product._parse_product_page", new_callable=AsyncMock)
    @patch("app.scrapers.amazon_product.get_page")
    @patch("app.scrapers.amazon_product.get_browser")
    @patch("app.scrapers.amazon_product.fetch_with_retry", new_callable=AsyncMock)
    async def test_success(self, mock_fetch, mock_browser, mock_page, mock_parse):
        mock_fetch.return_value = True
        mock_page_obj = AsyncMock()
        mock_page_obj.query_selector = AsyncMock(return_value=None)  # no captcha

        mock_browser_ctx = AsyncMock()
        mock_browser.__aenter__ = AsyncMock(return_value=mock_browser_ctx)
        mock_browser.__aexit__ = AsyncMock(return_value=False)
        mock_page.__aenter__ = AsyncMock(return_value=mock_page_obj)
        mock_page.__aexit__ = AsyncMock(return_value=False)
        mock_browser.return_value = mock_browser
        mock_page.return_value = mock_page

        mock_parse.return_value = AmazonProduct(asin="B09TEST123", title="テスト")

        result = await get_amazon_product("B09TEST123")
        assert result is not None
        assert result.title == "テスト"


class TestGetCompetitorOffers:

    @pytest.mark.asyncio
    @patch("app.scrapers.amazon_product.get_page")
    @patch("app.scrapers.amazon_product.get_browser")
    @patch("app.scrapers.amazon_product.fetch_with_retry", new_callable=AsyncMock)
    async def test_fetch_failure(self, mock_fetch, mock_browser, mock_page):
        mock_fetch.return_value = False
        mock_browser_ctx = AsyncMock()
        mock_browser.__aenter__ = AsyncMock(return_value=mock_browser_ctx)
        mock_browser.__aexit__ = AsyncMock(return_value=False)
        mock_page_ctx = AsyncMock()
        mock_page.__aenter__ = AsyncMock(return_value=mock_page_ctx)
        mock_page.__aexit__ = AsyncMock(return_value=False)
        mock_browser.return_value = mock_browser
        mock_page.return_value = mock_page

        result = await get_competitor_offers("B09TEST123")
        assert result == []

    @pytest.mark.asyncio
    @patch("app.scrapers.amazon_product.get_page")
    @patch("app.scrapers.amazon_product.get_browser")
    @patch("app.scrapers.amazon_product.fetch_with_retry", new_callable=AsyncMock)
    async def test_captcha_detected(self, mock_fetch, mock_browser, mock_page):
        mock_fetch.return_value = True
        captcha_el = AsyncMock()
        mock_page_obj = AsyncMock()
        mock_page_obj.query_selector = AsyncMock(return_value=captcha_el)
        mock_page_obj.query_selector_all = AsyncMock(return_value=[])

        mock_browser_ctx = AsyncMock()
        mock_browser.__aenter__ = AsyncMock(return_value=mock_browser_ctx)
        mock_browser.__aexit__ = AsyncMock(return_value=False)
        mock_page.__aenter__ = AsyncMock(return_value=mock_page_obj)
        mock_page.__aexit__ = AsyncMock(return_value=False)
        mock_browser.return_value = mock_browser
        mock_page.return_value = mock_page

        result = await get_competitor_offers("B09TEST123")
        assert result == []
