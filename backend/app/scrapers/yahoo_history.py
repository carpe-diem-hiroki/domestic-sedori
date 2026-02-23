"""ヤフオク落札履歴スクレイパー - 過去の落札データを取得"""
import logging
import re
from dataclasses import dataclass
from datetime import datetime
from urllib.parse import quote

from playwright.async_api import Page

from app.scrapers.base import fetch_with_retry, get_browser, get_page

logger = logging.getLogger(__name__)

YAHOO_CLOSED_URL = (
    "https://auctions.yahoo.co.jp/closedsearch/closedsearch"
    "?p={keyword}&va={keyword}&exflg=1&b=1&n={count}"
)


@dataclass
class HistoryResult:
    auction_id: str
    title: str
    winning_price: int
    end_date: datetime | None
    bid_count: int | None = None


def _parse_closed_date(text: str) -> datetime | None:
    """落札日時をパース（例: "02/21 16:03" → 今年のdatetimeに変換）"""
    match = re.match(r"(\d{2})/(\d{2})\s+(\d{2}):(\d{2})", text.strip())
    if match:
        now = datetime.now()
        month = int(match.group(1))
        day = int(match.group(2))
        hour = int(match.group(3))
        minute = int(match.group(4))
        # 年は推定（現在月より大きければ前年）
        year = now.year if month <= now.month else now.year - 1
        try:
            return datetime(year, month, day, hour, minute)
        except ValueError:
            return None
    return None


async def parse_closed_results(page: Page) -> list[HistoryResult]:
    """落札履歴ページから結果をパース"""
    results = []

    items = await page.query_selector_all("li.Product")

    for item in items:
        try:
            # タイトルとオークションID
            title_link = await item.query_selector("a.Product__titleLink")
            if not title_link:
                continue

            title = (await title_link.inner_text()).strip()
            href = await title_link.get_attribute("href") or ""
            match = re.search(r"/auction/([a-zA-Z0-9]+)", href)
            if not match:
                continue
            auction_id = match.group(1)

            # 落札価格 - "落札" ラベルの価格を取得
            winning_price = None
            price_els = await item.query_selector_all(".Product__price")
            for price_el in price_els:
                text = (await price_el.inner_text()).strip()
                if "落札" in text:
                    price_match = re.search(r"([\d,]+)円", text)
                    if price_match:
                        winning_price = int(price_match.group(1).replace(",", ""))
                    break

            if winning_price is None:
                continue

            # 終了日時
            time_el = await item.query_selector(".Product__time")
            end_date = None
            if time_el:
                time_text = (await time_el.inner_text()).strip()
                end_date = _parse_closed_date(time_text)

            # 入札数
            bid_count = None
            bid_el = await item.query_selector("a.Product__bid")
            if bid_el:
                bid_text = (await bid_el.inner_text()).strip()
                bid_nums = re.sub(r"[^\d]", "", bid_text)
                if bid_nums:
                    bid_count = int(bid_nums)

            results.append(
                HistoryResult(
                    auction_id=auction_id,
                    title=title,
                    winning_price=winning_price,
                    end_date=end_date,
                    bid_count=bid_count,
                )
            )
        except Exception as e:
            logger.warning(f"Failed to parse closed item: {e}")
            continue

    return results


async def search_auction_history(
    keyword: str, count: int = 50
) -> list[HistoryResult]:
    """キーワードで落札履歴を検索"""
    encoded = quote(keyword)
    url = YAHOO_CLOSED_URL.format(keyword=encoded, count=count)

    async with get_browser() as browser:
        async with get_page(browser) as page:
            success = await fetch_with_retry(page, url)
            if not success:
                logger.error(f"Failed to load history page for: {keyword}")
                return []

            results = await parse_closed_results(page)
            logger.info(f"Found {len(results)} history results for '{keyword}'")
            return results
