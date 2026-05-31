"""Amazon一覧ページ収集スクレイパー

カテゴリ/検索結果ページのURLから、全商品カードの ASIN・タイトル・価格を
1回のページ読み込み＋1回のevaluateでまとめて収集する（高速）。
拡張機能がブラウザ上でやっている収集をサーバー側で再現したもの。
"""
import logging
import re
from dataclasses import dataclass

from app.config import settings
from app.scrapers.base import fetch_with_retry, get_browser, get_page

logger = logging.getLogger(__name__)


@dataclass
class ListingCard:
    asin: str
    title: str
    price: int | None
    image_url: str | None


# data-asin カードから asin/title/price/image を一括抽出するJS
_HARVEST_JS = r"""
() => {
  const seen = new Set();
  const out = [];
  document.querySelectorAll('[data-asin]').forEach((el) => {
    const asin = el.getAttribute('data-asin');
    if (!asin || seen.has(asin)) return;
    const titleEl = el.querySelector(
      'h2 a, h2, .a-size-medium.a-color-base.a-text-normal, .a-size-base-plus.a-color-base.a-text-normal'
    );
    const title = titleEl ? titleEl.textContent.trim() : '';
    if (!title) return;  // 広告枠など本文無しはスキップ
    seen.add(asin);
    const priceEl = el.querySelector('.a-price .a-offscreen') || el.querySelector('.a-price');
    const img = el.querySelector('img.s-image') || el.querySelector('img');
    out.push({
      asin,
      title,
      price_text: priceEl ? priceEl.textContent : null,
      image_url: img ? img.getAttribute('src') : null,
    });
  });
  return out;
}
"""


def _parse_price(text: str | None) -> int | None:
    if not text:
        return None
    m = re.sub(r"[^\d]", "", text.replace("￥", "").replace("¥", ""))
    return int(m) if m else None


def _is_amazon_listing_url(url: str) -> bool:
    return "amazon.co.jp" in url and (
        "/s?" in url or "/s/" in url or "/b/" in url or "/b?" in url
        or "/gp/browse" in url or "/gp/bestsellers" in url or "/gp/search" in url
    )


# 任意ページ内のAmazon商品リンクからASINを拾う正規表現
_ASIN_LINK_RE = re.compile(
    r"amazon\.co\.jp/(?:[^\s\"']*?/)?(?:dp|gp/product|gp/aw/d|gp/offer-listing)/([A-Z0-9]{10})",
    re.I,
)


async def harvest_asins_from_url(url: str, limit: int = 30) -> list[str]:
    """任意のWebページ（ブログ記事等）からAmazon商品のASINを抽出する。

    ページHTML内の amazon.co.jp/dp/ASIN 形式リンクを拾って重複排除して返す。
    Amazon以外のサイト（せどりブログ等）でも、Amazon商品にリンクしていれば収集できる。
    """
    async with get_browser() as browser:
        async with get_page(browser) as page:
            success = await fetch_with_retry(
                page, url,
                delay_min=settings.yahoo_search_delay_min,
                delay_max=settings.yahoo_search_delay_max,
            )
            if not success:
                logger.error(f"Failed to load page: {url}")
                return []
            html = await page.content()

    seen: set[str] = set()
    asins: list[str] = []
    for m in _ASIN_LINK_RE.finditer(html):
        a = m.group(1).upper()
        if a not in seen:
            seen.add(a)
            asins.append(a)
            if len(asins) >= limit:
                break
    logger.info(f"Harvested {len(asins)} ASIN links from {url}")
    return asins


async def harvest_amazon_listing(url: str, limit: int = 30) -> list[ListingCard]:
    """Amazon一覧ページURLから商品カードを収集（先頭limit件）"""
    async with get_browser() as browser:
        async with get_page(browser) as page:
            success = await fetch_with_retry(
                page,
                url,
                delay_min=settings.yahoo_search_delay_min,
                delay_max=settings.yahoo_search_delay_max,
            )
            if not success:
                logger.error(f"Failed to load Amazon listing: {url}")
                return []

            raw = await page.evaluate(_HARVEST_JS)

    cards: list[ListingCard] = []
    for r in raw[:limit]:
        cards.append(
            ListingCard(
                asin=r["asin"],
                title=r.get("title") or "",
                price=_parse_price(r.get("price_text")),
                image_url=r.get("image_url"),
            )
        )
    logger.info(f"Harvested {len(cards)} cards from listing")
    return cards
