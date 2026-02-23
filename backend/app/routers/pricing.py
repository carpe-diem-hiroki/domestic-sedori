"""価格計算APIエンドポイント"""
from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.services.pricing import (
    calculate_pricing,
    estimate_winning_price,
    suggest_selling_price,
)

router = APIRouter(prefix="/api/pricing", tags=["pricing"])


class CalculateRequest(BaseModel):
    selling_price: int
    expected_winning_price: int
    category: str | None = None
    fee_rate: float | None = None
    shipping_cost: int = 800
    other_cost: int = 0


class CalculateResponse(BaseModel):
    selling_price: int
    expected_winning_price: int
    amazon_fee: int
    amazon_fee_rate: float
    shipping_cost: int
    other_cost: int
    profit: int
    profit_rate: float


class EstimateRequest(BaseModel):
    history_prices: list[int]
    buy_now_price: int | None = None


class EstimateResponse(BaseModel):
    expected_winning_price: int | None
    data_count: int
    source: str  # "history_median" or "buynow_70pct" or "none"


class SuggestRequest(BaseModel):
    expected_winning_price: int
    category: str | None = None
    fee_rate: float | None = None
    shipping_cost: int = 800
    other_cost: int = 0
    target_profit_rate: float = 20.0


class SuggestResponse(BaseModel):
    suggested_price: int
    expected_winning_price: int
    target_profit_rate: float
    actual_profit_rate: float
    profit: int


@router.post("/calculate", response_model=CalculateResponse)
async def api_calculate(req: CalculateRequest):
    """価格計算: 販売価格と予想落札価格から利益を算出"""
    result = calculate_pricing(
        selling_price=req.selling_price,
        expected_winning_price=req.expected_winning_price,
        category=req.category,
        fee_rate=req.fee_rate,
        shipping_cost=req.shipping_cost,
        other_cost=req.other_cost,
    )
    return CalculateResponse(
        selling_price=result.selling_price,
        expected_winning_price=result.expected_winning_price,
        amazon_fee=result.amazon_fee,
        amazon_fee_rate=result.amazon_fee_rate,
        shipping_cost=result.shipping_cost,
        other_cost=result.other_cost,
        profit=result.profit,
        profit_rate=result.profit_rate,
    )


@router.post("/estimate", response_model=EstimateResponse)
async def api_estimate(req: EstimateRequest):
    """予想落札価格を自動推定"""
    price = estimate_winning_price(req.history_prices, req.buy_now_price)

    if req.history_prices and price is not None:
        source = "history_median"
    elif req.buy_now_price and price is not None:
        source = "buynow_70pct"
    else:
        source = "none"

    return EstimateResponse(
        expected_winning_price=price,
        data_count=len(req.history_prices),
        source=source,
    )


@router.post("/suggest", response_model=SuggestResponse)
async def api_suggest(req: SuggestRequest):
    """目標利益率から推奨販売価格を逆算"""
    suggested = suggest_selling_price(
        expected_winning_price=req.expected_winning_price,
        category=req.category,
        fee_rate=req.fee_rate,
        shipping_cost=req.shipping_cost,
        other_cost=req.other_cost,
        target_profit_rate=req.target_profit_rate,
    )

    # 推奨価格での実際の利益率を計算
    result = calculate_pricing(
        selling_price=suggested,
        expected_winning_price=req.expected_winning_price,
        category=req.category,
        fee_rate=req.fee_rate,
        shipping_cost=req.shipping_cost,
        other_cost=req.other_cost,
    )

    return SuggestResponse(
        suggested_price=suggested,
        expected_winning_price=req.expected_winning_price,
        target_profit_rate=req.target_profit_rate,
        actual_profit_rate=result.profit_rate,
        profit=result.profit,
    )
