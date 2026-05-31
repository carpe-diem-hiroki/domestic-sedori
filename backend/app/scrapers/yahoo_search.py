"""ヤフオク検索スクレイパー - キーワードでオークション検索"""
import logging
import re
import time
from dataclasses import dataclass
from urllib.parse import quote

from playwright.async_api import Page

from app.config import settings
from app.scrapers.base import fetch_with_retry, get_browser, get_page

logger = logging.getLogger(__name__)

YAHOO_SEARCH_URL = "https://auctions.yahoo.co.jp/search/search?p={keyword}&va={keyword}&exflg=1&b=1&n=50"

# 検索結果のメモリキャッシュ: 正規化キーワード -> (結果, 取得時刻)
_search_cache: dict[str, tuple[list["SearchResult"], float]] = {}


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


# 検索結果を1回の page.evaluate でまとめて抽出するJS
# （商品ごとに query_selector を回すとCDP往復が数百回になり遅いため）
_EXTRACT_JS = r"""
() => {
  const out = [];
  document.querySelectorAll('li.Product').forEach((item) => {
    const link = item.querySelector('a.Product__titleLink, a.Product__imageLink');
    if (!link) return;
    const auctionId = link.getAttribute('data-auction-id');
    if (!auctionId) return;
    const bonus = item.querySelector('.Product__bonus');
    const buynow = bonus ? bonus.getAttribute('data-auction-buynowprice') : null;
    const img = item.querySelector('img.Product__imageData');
    const timeEl = item.querySelector('.Product__time');
    const bidEl = item.querySelector('.Product__bid');
    out.push({
      auction_id: auctionId,
      title: link.getAttribute('data-auction-title') || '',
      price_str: link.getAttribute('data-auction-price'),
      buynow_str: buynow,
      image_url: img ? img.getAttribute('src') : null,
      end_time_text: timeEl ? timeEl.textContent.trim() : null,
      bid_text: bidEl ? bidEl.textContent.trim() : null,
    });
  });
  return out;
}
"""


def _to_int(value: str | None) -> int | None:
    if not value:
        return None
    digits = re.sub(r"[^\d]", "", value)
    return int(digits) if digits else None


async def parse_search_results(page: Page) -> list[SearchResult]:
    """検索結果ページから商品一覧をパース（1回のevaluateで一括取得）"""
    raw = await page.evaluate(_EXTRACT_JS)

    results: list[SearchResult] = []
    for r in raw:
        try:
            buynow = _to_int(r.get("buynow_str"))
            if buynow == 0:
                buynow = None  # 0 = 即決なし
            auction_id = r["auction_id"]
            results.append(
                SearchResult(
                    auction_id=auction_id,
                    title=r.get("title") or "",
                    current_price=_to_int(r.get("price_str")),
                    buy_now_price=buynow,
                    image_url=r.get("image_url"),
                    end_time_text=r.get("end_time_text") or None,
                    bid_count=_to_int(r.get("bid_text")),
                    url=f"https://page.auctions.yahoo.co.jp/jp/auction/{auction_id}",
                )
            )
        except Exception as e:
            logger.warning(f"Failed to map item: {e}")
            continue

    return results


async def search_yahoo_auctions(keyword: str) -> list[SearchResult]:
    """ヤフオクをキーワードで検索し、結果一覧を返す"""
    # キャッシュヒット判定（正規化キーワード）
    cache_key = keyword.strip().lower()
    now = time.monotonic()
    cached = _search_cache.get(cache_key)
    if cached and now - cached[1] < settings.yahoo_search_cache_ttl:
        logger.info(f"Cache hit for '{keyword}' ({len(cached[0])} results)")
        return cached[0]

    encoded = quote(keyword)
    url = YAHOO_SEARCH_URL.format(keyword=encoded)

    async with get_browser() as browser:
        async with get_page(browser) as page:
            # 対話検索なので事前待機は短く
            success = await fetch_with_retry(
                page,
                url,
                delay_min=settings.yahoo_search_delay_min,
                delay_max=settings.yahoo_search_delay_max,
            )
            if not success:
                logger.error(f"Failed to load search page for: {keyword}")
                # 失敗（404等）も短時間キャッシュして連打を防ぐ
                _search_cache[cache_key] = ([], now)
                return []

            results = await parse_search_results(page)
            logger.info(f"Found {len(results)} results for '{keyword}'")
            _search_cache[cache_key] = (results, now)
            return results
