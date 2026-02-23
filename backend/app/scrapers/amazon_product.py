"""Amazon商品ページスクレイパー - ASIN指定で商品情報+価格を取得"""
import logging
import re
from dataclasses import dataclass, field

from playwright.async_api import Page

from app.config import settings
from app.scrapers.base import fetch_with_retry, get_browser, get_page, random_delay

logger = logging.getLogger(__name__)

AMAZON_PRODUCT_URL = "https://www.amazon.co.jp/dp/{asin}"
AMAZON_OFFERS_URL = "https://www.amazon.co.jp/gp/offer-listing/{asin}"


@dataclass
class AmazonProduct:
    asin: str
    title: str | None = None
    price: int | None = None
    brand: str | None = None
    model_number: str | None = None
    category: str | None = None
    image_url: str | None = None
    rating: float | None = None
    review_count: int | None = None


@dataclass
class CompetitorOffer:
    price: int
    condition: str  # "新品" or "中古"
    seller_name: str | None = None
    shipping_cost: int = 0
    is_fba: bool = False


async def _parse_product_page(page: Page, asin: str) -> AmazonProduct:
    """Amazon商品ページから情報を抽出"""
    product = AmazonProduct(asin=asin)

    # タイトル
    title_el = await page.query_selector("#productTitle")
    if title_el:
        product.title = (await title_el.inner_text()).strip()

    # 価格（複数のセレクタパターンに対応）
    price_selectors = [
        "span.a-price span.a-offscreen",
        "#priceblock_ourprice",
        "#priceblock_dealprice",
        "#corePrice_feature_div span.a-offscreen",
        ".a-price .a-offscreen",
    ]
    for selector in price_selectors:
        price_el = await page.query_selector(selector)
        if price_el:
            price_text = (await price_el.inner_text()).strip()
            price_match = re.search(r"[\d,]+", price_text.replace("￥", ""))
            if price_match:
                product.price = int(price_match.group().replace(",", ""))
                break

    # ブランド
    brand_el = await page.query_selector("#bylineInfo")
    if brand_el:
        brand_text = (await brand_el.inner_text()).strip()
        # "ブランド: XXX" or "XXXのストアを表示" パターン
        brand_text = re.sub(r"(ブランド:\s*|のストアを表示)", "", brand_text).strip()
        if brand_text:
            product.brand = brand_text

    # 型番 - 商品情報テーブルから取得
    detail_rows = await page.query_selector_all(
        "#productDetails_techSpec_section_1 tr, "
        "#detailBullets_feature_div li, "
        "#productDetails_detailBullets_sections1 tr"
    )
    for row in detail_rows:
        text = (await row.inner_text()).strip()
        if "型番" in text or "モデル番号" in text or "Model" in text:
            # "型番\tABC-123" のようなパターン
            parts = re.split(r"[\t\n:：]", text)
            if len(parts) >= 2:
                product.model_number = parts[-1].strip()
                break

    # カテゴリ - パンくずリストから取得
    breadcrumbs = await page.query_selector_all("#wayfinding-breadcrumbs_feature_div a")
    if breadcrumbs:
        # 最後のパンくずをカテゴリとする
        last_crumb = breadcrumbs[-1]
        product.category = (await last_crumb.inner_text()).strip()

    # 画像URL
    img_el = await page.query_selector("#landingImage, #imgBlkFront")
    if img_el:
        # data-old-hires が高解像度、なければ src
        product.image_url = (
            await img_el.get_attribute("data-old-hires")
            or await img_el.get_attribute("src")
        )

    # 評価
    rating_el = await page.query_selector("#acrPopover span.a-icon-alt")
    if rating_el:
        rating_text = (await rating_el.inner_text()).strip()
        rating_match = re.search(r"([\d.]+)", rating_text)
        if rating_match:
            product.rating = float(rating_match.group(1))

    # レビュー数
    review_el = await page.query_selector("#acrCustomerReviewText")
    if review_el:
        review_text = (await review_el.inner_text()).strip()
        review_match = re.search(r"[\d,]+", review_text)
        if review_match:
            product.review_count = int(review_match.group().replace(",", ""))

    return product


async def _parse_offers_page(page: Page) -> list[CompetitorOffer]:
    """出品者一覧ページから競合価格を取得"""
    offers = []

    offer_items = await page.query_selector_all(
        "#aod-offer, .olpOffer, div[id^='aod-price']"
    )

    # Alternative: aod (All Offers Display) パターン
    if not offer_items:
        offer_items = await page.query_selector_all(
            "#all-offers-display-scroller .a-section.a-spacing-none"
        )

    # pinned offer（Amazonが販売の場合）
    pinned = await page.query_selector("#aod-pinned-offer")
    if pinned:
        price_el = await pinned.query_selector(".a-offscreen")
        if price_el:
            price_text = (await price_el.inner_text()).strip()
            price_match = re.search(r"[\d,]+", price_text.replace("￥", ""))
            if price_match:
                offers.append(
                    CompetitorOffer(
                        price=int(price_match.group().replace(",", "")),
                        condition="新品",
                        seller_name="Amazon.co.jp",
                        is_fba=True,
                    )
                )

    # 各出品者のオファー
    offer_cards = await page.query_selector_all("#aod-offer")
    for card in offer_cards:
        try:
            # 価格
            price_el = await card.query_selector(".a-offscreen")
            if not price_el:
                continue
            price_text = (await price_el.inner_text()).strip()
            price_match = re.search(r"[\d,]+", price_text.replace("￥", ""))
            if not price_match:
                continue
            price = int(price_match.group().replace(",", ""))

            # コンディション
            condition = "新品"
            cond_el = await card.query_selector("#aod-offer-heading h5")
            if cond_el:
                cond_text = (await cond_el.inner_text()).strip()
                if "中古" in cond_text:
                    condition = "中古"

            # 出品者名
            seller_name = None
            seller_el = await card.query_selector("#aod-offer-soldBy a")
            if seller_el:
                seller_name = (await seller_el.inner_text()).strip()

            # 送料
            shipping_cost = 0
            ship_el = await card.query_selector(
                "#aod-offer-shippingMessage .a-color-base"
            )
            if ship_el:
                ship_text = (await ship_el.inner_text()).strip()
                ship_match = re.search(r"[\d,]+", ship_text)
                if ship_match:
                    shipping_cost = int(ship_match.group().replace(",", ""))

            # FBA判定
            is_fba = False
            fulfillment_el = await card.query_selector("#aod-offer-shippingMessage")
            if fulfillment_el:
                ful_text = (await fulfillment_el.inner_text()).strip()
                is_fba = "Amazon.co.jp" in ful_text and "発送" in ful_text

            offers.append(
                CompetitorOffer(
                    price=price,
                    condition=condition,
                    seller_name=seller_name,
                    shipping_cost=shipping_cost,
                    is_fba=is_fba,
                )
            )
        except Exception as e:
            logger.warning(f"Failed to parse offer: {e}")
            continue

    return offers


async def get_amazon_product(asin: str) -> AmazonProduct | None:
    """ASIN指定でAmazon商品情報を取得"""
    url = AMAZON_PRODUCT_URL.format(asin=asin)

    async with get_browser() as browser:
        async with get_page(browser) as page:
            success = await fetch_with_retry(page, url)
            if not success:
                logger.error(f"Failed to load Amazon product page: {asin}")
                return None

            # ボット検知チェック
            captcha = await page.query_selector(
                "#captchacharacters, form[action*='validateCaptcha']"
            )
            if captcha:
                logger.error(f"CAPTCHA detected for ASIN: {asin}")
                return None

            product = await _parse_product_page(page, asin)
            logger.info(f"Scraped Amazon product: {product.title} ({asin})")
            return product


async def get_competitor_offers(asin: str) -> list[CompetitorOffer]:
    """ASIN指定で競合出品者の価格一覧を取得"""
    url = AMAZON_OFFERS_URL.format(asin=asin)

    async with get_browser() as browser:
        async with get_page(browser) as page:
            success = await fetch_with_retry(page, url)
            if not success:
                logger.error(f"Failed to load offers page: {asin}")
                return []

            # ボット検知チェック
            captcha = await page.query_selector(
                "#captchacharacters, form[action*='validateCaptcha']"
            )
            if captcha:
                logger.error(f"CAPTCHA detected on offers page: {asin}")
                return []

            offers = await _parse_offers_page(page)
            logger.info(f"Found {len(offers)} offers for ASIN: {asin}")
            return offers
