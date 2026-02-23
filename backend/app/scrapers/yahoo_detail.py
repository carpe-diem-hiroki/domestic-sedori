"""ヤフオク商品詳細スクレイパー - オークション詳細ページから情報取得"""
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime

from playwright.async_api import Page

from app.scrapers.base import fetch_with_retry, get_browser, get_page

logger = logging.getLogger(__name__)

YAHOO_DETAIL_URL = "https://page.auctions.yahoo.co.jp/jp/auction/{auction_id}"


@dataclass
class AuctionDetail:
    auction_id: str
    title: str
    current_price: int | None = None
    buy_now_price: int | None = None
    start_price: int | None = None
    bid_count: int | None = None
    seller_id: str | None = None
    seller_name: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    condition: str | None = None
    image_urls: list[str] = field(default_factory=list)
    description: str | None = None
    shipping_info: str | None = None
    category: str | None = None
    brand: str | None = None
    url: str = ""


def _parse_price(text: str) -> int | None:
    """価格テキストから最初の数値を抽出（例: "1,000円（税0円）" → 1000）"""
    match = re.search(r"([\d,]+)円", text)
    if match:
        nums = match.group(1).replace(",", "")
        return int(nums) if nums else None
    # 円がない場合はカンマ区切り数値として解釈
    nums = re.sub(r"[^\d]", "", text)
    return int(nums) if nums else None


def _parse_datetime(text: str) -> datetime | None:
    """日時テキストをパース（例: "2026年2月19日（木）16時16分"）"""
    match = re.search(r"(\d{4})年(\d{1,2})月(\d{1,2})日.*?(\d{1,2})時(\d{1,2})分", text)
    if match:
        return datetime(
            int(match.group(1)), int(match.group(2)), int(match.group(3)),
            int(match.group(4)), int(match.group(5)),
        )
    return None


async def parse_auction_detail(page: Page, auction_id: str) -> AuctionDetail | None:
    """商品詳細ページから情報を抽出"""
    detail = AuctionDetail(
        auction_id=auction_id,
        title="",
        url=YAHOO_DETAIL_URL.format(auction_id=auction_id),
    )

    # タイトル
    title_el = await page.query_selector("h1")
    if title_el:
        detail.title = (await title_el.inner_text()).strip()

    if not detail.title:
        logger.warning(f"Title not found for {auction_id}")
        return None

    # 価格情報 - dl要素から取得
    price_dls = await page.query_selector_all("dl")
    for dl in price_dls:
        text = (await dl.inner_text()).strip()
        price_match = re.search(r"([\d,]+)円", text)
        if not price_match:
            continue

        if text.startswith("現在"):
            detail.current_price = _parse_price(text)
        elif text.startswith("即決"):
            detail.buy_now_price = _parse_price(text)
            # 即決のみのオークションでは現在価格=即決価格
            if detail.current_price is None:
                detail.current_price = detail.buy_now_price

    # 入札数
    bid_el = await page.query_selector("a[href*='bid_hist']")
    if bid_el:
        bid_text = (await bid_el.inner_text()).strip()
        bid_nums = re.sub(r"[^\d]", "", bid_text)
        if bid_nums:
            detail.bid_count = int(bid_nums)

    # 出品者
    seller_el = await page.query_selector("a[href*='seller']")
    if seller_el:
        detail.seller_name = (await seller_el.inner_text()).strip()
        href = await seller_el.get_attribute("href") or ""
        match = re.search(r"/seller/([^/?]+)", href)
        if match:
            detail.seller_id = match.group(1)

    # テーブルから開始価格・日時を取得
    rows = await page.query_selector_all("table tr")
    for row in rows:
        ths = await row.query_selector_all("th")
        tds = await row.query_selector_all("td")
        for th, td in zip(ths, tds):
            label = (await th.inner_text()).strip()
            value = (await td.inner_text()).strip()

            if label == "開始時の価格":
                detail.start_price = _parse_price(value)
            elif label == "開始日時":
                detail.start_time = _parse_datetime(value)
            elif label == "終了日時":
                detail.end_time = _parse_datetime(value)

    # カテゴリ・ブランド・商品状態 - dl要素から
    for dl in price_dls:
        text = (await dl.inner_text()).strip()
        if "カテゴリ" in text and "ブランド" in text:
            # カテゴリ
            cat_match = re.search(r"カテゴリ\n(.+?)(?:\n|ブランド)", text, re.DOTALL)
            if cat_match:
                detail.category = cat_match.group(1).strip().replace("\n", " > ")

            # ブランド
            brand_match = re.search(r"ブランド\n(.+?)(?:\n|シリーズ|製品情報|商品の状態)", text)
            if brand_match:
                detail.brand = brand_match.group(1).strip()

            # 商品の状態
            cond_match = re.search(r"商品の状態\n(.+?)(?:\n|個数|$)", text)
            if cond_match:
                detail.condition = cond_match.group(1).strip()
            break

    # 送料情報 - 専用dl or カテゴリdl内から取得
    for dl in price_dls:
        text = (await dl.inner_text()).strip()
        if "送料" in text and ("落札者" in text or "出品者" in text or "無料" in text):
            # カテゴリdl内の「送料\n無料」パターン
            ship_match = re.search(r"送料\n(.+?)(?:\n|配送方法|$)", text)
            if ship_match:
                detail.shipping_info = ship_match.group(1).strip()
            else:
                detail.shipping_info = text.replace("\n", " ").strip()[:100]
            break

    # 画像URL - auctions.c.yimg.jp の画像を重複排除で取得
    seen_urls = set()
    imgs = await page.query_selector_all("img[alt*='_画像']")
    for img in imgs:
        src = await img.get_attribute("src") or ""
        if "auctions.c.yimg.jp" in src and src not in seen_urls:
            seen_urls.add(src)
            detail.image_urls.append(src)

    return detail


async def get_auction_detail(auction_id: str) -> AuctionDetail | None:
    """オークションIDから商品詳細を取得"""
    url = YAHOO_DETAIL_URL.format(auction_id=auction_id)

    async with get_browser() as browser:
        async with get_page(browser) as page:
            success = await fetch_with_retry(page, url)
            if not success:
                logger.error(f"Failed to load detail page for: {auction_id}")
                return None

            result = await parse_auction_detail(page, auction_id)
            if result:
                logger.info(
                    f"Detail fetched: {result.title} ({result.current_price}円)"
                )
            return result
