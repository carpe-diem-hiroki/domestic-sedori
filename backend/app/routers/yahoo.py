"""ヤフオク関連APIエンドポイント"""
from fastapi import APIRouter, HTTPException, Path, Query
from pydantic import BaseModel

from app.scrapers.yahoo_detail import AuctionDetail, get_auction_detail
from app.scrapers.yahoo_history import search_auction_history
from app.scrapers.yahoo_search import search_yahoo_auctions

router = APIRouter(prefix="/api/yahoo", tags=["yahoo"])


# --- レスポンスモデル ---


class SearchResultResponse(BaseModel):
    auction_id: str
    title: str
    current_price: int | None
    buy_now_price: int | None
    image_url: str | None
    end_time_text: str | None
    bid_count: int | None
    url: str


class DetailResponse(BaseModel):
    auction_id: str
    title: str
    current_price: int | None
    buy_now_price: int | None
    start_price: int | None
    bid_count: int | None
    seller_id: str | None
    seller_name: str | None
    start_time: str | None
    end_time: str | None
    condition: str | None
    image_urls: list[str]
    shipping_info: str | None
    category: str | None
    brand: str | None
    url: str


class HistoryResultResponse(BaseModel):
    auction_id: str
    title: str
    winning_price: int
    end_date: str | None
    bid_count: int | None


class HistoryResponse(BaseModel):
    results: list[HistoryResultResponse]
    count: int
    median_price: int | None
    average_price: int | None


# --- エンドポイント ---


@router.get("/search", response_model=list[SearchResultResponse])
async def yahoo_search(keyword: str = Query(..., min_length=1)):
    """ヤフオクをキーワードで検索"""
    results = await search_yahoo_auctions(keyword)
    return [
        SearchResultResponse(
            auction_id=r.auction_id,
            title=r.title,
            current_price=r.current_price,
            buy_now_price=r.buy_now_price,
            image_url=r.image_url,
            end_time_text=r.end_time_text,
            bid_count=r.bid_count,
            url=r.url,
        )
        for r in results
    ]


@router.get("/detail/{auction_id}", response_model=DetailResponse)
async def yahoo_detail(
    auction_id: str = Path(..., min_length=1, max_length=30, pattern=r"^[a-zA-Z0-9]+$"),
):
    """ヤフオク商品の詳細情報を取得"""
    detail = await get_auction_detail(auction_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Auction not found")

    return DetailResponse(
        auction_id=detail.auction_id,
        title=detail.title,
        current_price=detail.current_price,
        buy_now_price=detail.buy_now_price,
        start_price=detail.start_price,
        bid_count=detail.bid_count,
        seller_id=detail.seller_id,
        seller_name=detail.seller_name,
        start_time=detail.start_time.isoformat() if detail.start_time else None,
        end_time=detail.end_time.isoformat() if detail.end_time else None,
        condition=detail.condition,
        image_urls=detail.image_urls,
        shipping_info=detail.shipping_info,
        category=detail.category,
        brand=detail.brand,
        url=detail.url,
    )


@router.get("/history", response_model=HistoryResponse)
async def yahoo_history(
    keyword: str = Query(..., min_length=1),
    count: int = Query(50, ge=1, le=100),
):
    """キーワードで落札履歴を検索"""
    results = await search_auction_history(keyword, count=count)

    prices = [r.winning_price for r in results]
    median_price = None
    average_price = None

    if prices:
        sorted_prices = sorted(prices)
        n = len(sorted_prices)
        median_price = (
            (sorted_prices[n // 2 - 1] + sorted_prices[n // 2]) // 2
            if n % 2 == 0
            else sorted_prices[n // 2]
        )
        average_price = sum(prices) // len(prices)

    return HistoryResponse(
        results=[
            HistoryResultResponse(
                auction_id=r.auction_id,
                title=r.title,
                winning_price=r.winning_price,
                end_date=r.end_date.isoformat() if r.end_date else None,
                bid_count=r.bid_count,
            )
            for r in results
        ],
        count=len(results),
        median_price=median_price,
        average_price=average_price,
    )
