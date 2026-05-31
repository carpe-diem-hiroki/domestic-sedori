"""価格差一括検索APIエンドポイント

入力（Amazon一覧URL または ASINリスト）から、
Amazon価格とヤフオク相場の価格差を一気に算出して返す。
"""
import asyncio
import logging
import re

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session
from app.scrapers.amazon_listing import _is_amazon_listing_url, harvest_amazon_listing
from app.scrapers.amazon_product import get_amazon_product
from app.scrapers.yahoo_search import search_yahoo_auctions
from app.services.matching import (
    build_search_keyword,
    is_relevant,
    representative_price,
)
from app.services.pricing import calculate_pricing
from app.models import Product

router = APIRouter(prefix="/api/research", tags=["research"])

MAX_ITEMS = 30
YAHOO_CONCURRENCY = 5
AMAZON_CONCURRENCY = 3


class PriceDiffRequest(BaseModel):
    query: str          # Amazon一覧URL もしくは 改行/空白/カンマ区切りのASIN列
    shipping_cost: int = 800


class PriceDiffRow(BaseModel):
    asin: str
    amazon_title: str
    amazon_price: int | None
    amazon_image: str | None
    yahoo_count: int
    best_yahoo_price: int | None
    best_yahoo_url: str | None
    best_yahoo_title: str | None
    profit: int | None
    profit_rate: float | None
    error: str | None = None


class PriceDiffResponse(BaseModel):
    mode: str           # "url" or "asins"
    items: list[PriceDiffRow]
    total: int


def _parse_asins(text: str) -> list[str]:
    """テキストからASIN（10桁英数）を抽出・重複排除"""
    candidates = re.split(r"[\s,\n]+", text.strip())
    seen: set[str] = set()
    asins: list[str] = []
    for c in candidates:
        c = c.strip().upper()
        if re.fullmatch(r"[A-Z0-9]{10}", c) and c not in seen:
            seen.add(c)
            asins.append(c)
    return asins


async def _get_amazon_for_asin(asin: str) -> tuple[str, int | None, str | None, str | None]:
    """ASIN→(title, price, image, category)。DBにあれば再利用、無ければスクレイプして保存"""
    async with async_session() as db:  # type: AsyncSession
        result = await db.execute(select(Product).where(Product.asin == asin))
        product = result.scalar_one_or_none()
        if product and product.amazon_price is not None:
            return product.title, product.amazon_price, product.image_url, product.category

    amzn = await get_amazon_product(asin)
    if not amzn:
        return "", None, None, None

    # DBへ保存/更新
    from datetime import datetime
    async with async_session() as db:
        result = await db.execute(select(Product).where(Product.asin == asin))
        product = result.scalar_one_or_none()
        if product:
            product.title = amzn.title or product.title
            product.amazon_price = amzn.price
            product.image_url = amzn.image_url or product.image_url
            product.category = amzn.category or product.category
            product.price_updated_at = datetime.now()
        else:
            product = Product(
                asin=asin,
                title=amzn.title or asin,
                amazon_price=amzn.price,
                image_url=amzn.image_url,
                category=amzn.category,
                brand=amzn.brand,
                model_number=amzn.model_number,
                price_updated_at=datetime.now(),
            )
            db.add(product)
        await db.commit()

    return amzn.title or "", amzn.price, amzn.image_url, amzn.category


async def _build_row(
    asin: str,
    title: str,
    amazon_price: int | None,
    image: str | None,
    category: str | None,
    shipping_cost: int,
    sem: asyncio.Semaphore,
) -> PriceDiffRow:
    """1商品分: ヤフオク検索→関連性フィルタ→相場(中央値)→利益を計算"""
    keyword = build_search_keyword(title) if title else asin
    async with sem:
        try:
            results = await search_yahoo_auctions(keyword)
        except Exception as e:
            return PriceDiffRow(
                asin=asin, amazon_title=title, amazon_price=amazon_price,
                amazon_image=image, yahoo_count=0, best_yahoo_price=None,
                best_yahoo_url=None, best_yahoo_title=None, profit=None,
                profit_rate=None, error=f"Y!検索失敗: {e}",
            )

    # 関連性フィルタ: カテゴリ違い・無関係な商品を除外（誤マッチ防止）
    relevant = [
        r for r in results
        if r.current_price is not None and is_relevant(title, r.title)
    ]

    if not relevant:
        return PriceDiffRow(
            asin=asin, amazon_title=title, amazon_price=amazon_price,
            amazon_image=image, yahoo_count=len(results), best_yahoo_price=None,
            best_yahoo_url=None, best_yahoo_title=None, profit=None,
            profit_rate=None,
            error="ヤフオクに該当商品なし（同カテゴリの一致なし）",
        )

    # 仕入れ見込み価格＝関連結果の中央値（1円開始などの外れ値を排除）
    rep_price = representative_price([r.current_price for r in relevant])
    # 中央値に最も近い出品を代表リンクに
    rep_item = min(relevant, key=lambda r: abs((r.current_price or 0) - (rep_price or 0)))

    profit = None
    profit_rate = None
    if rep_price and amazon_price:
        calc = calculate_pricing(
            selling_price=amazon_price,
            expected_winning_price=rep_price,
            category=category,
            shipping_cost=shipping_cost,
        )
        profit = calc.profit
        profit_rate = calc.profit_rate

    return PriceDiffRow(
        asin=asin,
        amazon_title=title,
        amazon_price=amazon_price,
        amazon_image=image,
        yahoo_count=len(relevant),
        best_yahoo_price=rep_price,
        best_yahoo_url=rep_item.url,
        best_yahoo_title=rep_item.title,
        profit=profit,
        profit_rate=profit_rate,
    )


@router.post("/price-diff", response_model=PriceDiffResponse)
async def price_diff(req: PriceDiffRequest):
    """Amazon一覧URL もしくは ASINリストから価格差を一括算出"""
    query = req.query.strip()
    sem = asyncio.Semaphore(YAHOO_CONCURRENCY)

    if _is_amazon_listing_url(query):
        # URLモード: 一覧ページから ASIN・タイトル・価格を自動収集
        cards = await harvest_amazon_listing(query, limit=MAX_ITEMS)
        tasks = [
            _build_row(
                c.asin, c.title, c.price, c.image_url, None,
                req.shipping_cost, sem,
            )
            for c in cards
        ]
        rows = await asyncio.gather(*tasks)
        mode = "url"
    else:
        # ASINモード: 各ASINのAmazon情報を取得（DBキャッシュ優先）
        asins = _parse_asins(query)[:MAX_ITEMS]
        amzn_sem = asyncio.Semaphore(AMAZON_CONCURRENCY)

        async def fetch_and_build(asin: str) -> PriceDiffRow:
            async with amzn_sem:
                title, price, image, category = await _get_amazon_for_asin(asin)
            if not title and price is None:
                return PriceDiffRow(
                    asin=asin, amazon_title="", amazon_price=None,
                    amazon_image=None, yahoo_count=0, best_yahoo_price=None,
                    best_yahoo_url=None, best_yahoo_title=None, profit=None,
                    profit_rate=None, error="Amazon商品取得失敗（CAPTCHA等）",
                )
            return await _build_row(
                asin, title, price, image, category, req.shipping_cost, sem
            )

        rows = await asyncio.gather(*[fetch_and_build(a) for a in asins])
        mode = "asins"

    # 利益率の高い順（profit_rate None は末尾）
    rows_sorted = sorted(
        rows, key=lambda r: (r.profit_rate is not None, r.profit_rate or 0), reverse=True
    )
    return PriceDiffResponse(mode=mode, items=rows_sorted, total=len(rows_sorted))
