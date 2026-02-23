"""ヤフオク検索スクレイパー - キーワードでオークション検索"""
import logging
import re
from dataclasses import dataclass
from urllib.parse import quote

from playwright.async_api import Page

from app.scrapers.base import fetch_with_retry, get_browser, get_page

logger = logging.getLogger(__name__)

YAHOO_SEARCH_URL = "https://auctions.yahoo.co.jp/search/search?p={keyword}&va={keyword}&exflg=1&b=1&n=50"


@dataclass
class SearchResult:
    auction_id: str
    title: str
    current_price: int | None
    buy_now_price: int | None
    image_url: str | None
    end_time_text: str | None
    bid_count: int | None
    url: str


async def parse_search_results(page: Page) -> list[SearchResult]:
    """検索結果ページから商品一覧をパース（data属性ベース）"""
    results = []

    items = await page.query_selector_all("li.Product")

    for item in items:
        try:
            # data属性から情報取得（テキストパースより信頼性が高い）
            link = await item.query_selector(
                "a.Product__titleLink, a.Product__imageLink"
            )
            if not link:
                continue

            auction_id = await link.get_attribute("data-auction-id")
            if not auction_id:
                continue

            title = await link.get_attribute("data-auction-title") or ""
            price_str = await link.get_attribute("data-auction-price")
            current_price = int(price_str) if price_str else None

            # 即決価格: Product__bonus の data-auction-buynowprice（0 = なし）
            buy_now_price = None
            bonus = await item.query_selector(".Product__bonus")
            if bonus:
                buynow_str = await bonus.get_attribute("data-auction-buynowprice")
                if buynow_str and buynow_str != "0":
                    buy_now_price = int(buynow_str)

            # 画像URL
            img = await item.query_selector("img.Product__imageData")
            image_url = await img.get_attribute("src") if img else None

            # 残り時間
            time_el = await item.query_selector(".Product__time")
            end_time_text = (await time_el.inner_text()).strip() if time_el else None

            # 入札数
            bid_count = None
            bid_el = await item.query_selector(".Product__bid")
            if bid_el:
                bid_text = (await bid_el.inner_text()).strip()
                bid_nums = re.sub(r"[^\d]", "", bid_text)
                if bid_nums:
                    bid_count = int(bid_nums)

            url = f"https://page.auctions.yahoo.co.jp/jp/auction/{auction_id}"

            results.append(
                SearchResult(
                    auction_id=auction_id,
                    title=title,
                    current_price=current_price,
                    buy_now_price=buy_now_price,
                    image_url=image_url,
                    end_time_text=end_time_text,
                    bid_count=bid_count,
                    url=url,
                )
            )
        except Exception as e:
            logger.warning(f"Failed to parse item: {e}")
            continue

    return results


async def search_yahoo_auctions(keyword: str) -> list[SearchResult]:
    """ヤフオクをキーワードで検索し、結果一覧を返す"""
    encoded = quote(keyword)
    url = YAHOO_SEARCH_URL.format(keyword=encoded)

    async with get_browser() as browser:
        async with get_page(browser) as page:
            success = await fetch_with_retry(page, url)
            if not success:
                logger.error(f"Failed to load search page for: {keyword}")
                return []

            results = await parse_search_results(page)
            logger.info(f"Found {len(results)} results for '{keyword}'")
            return results
