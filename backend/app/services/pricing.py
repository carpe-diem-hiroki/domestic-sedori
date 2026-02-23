"""価格計算サービス - 予想落札価格・利益・利益率を計算"""
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Amazon手数料率（カテゴリ別）
AMAZON_FEE_RATES = {
    "家電": 0.08,
    "ゲーム": 0.15,
    "おもちゃ": 0.10,
    "本": 0.15,
    "CD・DVD": 0.15,
    "default": 0.15,
}


@dataclass
class PricingResult:
    """価格計算結果"""
    selling_price: int              # Amazon販売価格
    expected_winning_price: int     # 予想落札価格
    amazon_fee: int                 # Amazon手数料
    amazon_fee_rate: float          # Amazon手数料率
    shipping_cost: int              # 送料
    other_cost: int                 # その他手数料
    profit: int                     # 利益額
    profit_rate: float              # 利益率（%）


def estimate_winning_price(
    history_prices: list[int],
    buy_now_price: int | None = None,
) -> int | None:
    """予想落札価格を自動計算

    ルール:
    1. 落札履歴がある → 中央値
    2. 履歴なし + 即決価格あり → 即決価格の70%
    3. どちらもなし → None
    """
    if history_prices:
        sorted_prices = sorted(history_prices)
        n = len(sorted_prices)
        if n % 2 == 0:
            return (sorted_prices[n // 2 - 1] + sorted_prices[n // 2]) // 2
        return sorted_prices[n // 2]

    if buy_now_price:
        return int(buy_now_price * 0.7)

    return None


def get_fee_rate(category: str | None) -> float:
    """カテゴリからAmazon手数料率を取得"""
    if not category:
        return AMAZON_FEE_RATES["default"]

    for key, rate in AMAZON_FEE_RATES.items():
        if key in category:
            return rate

    return AMAZON_FEE_RATES["default"]


def calculate_pricing(
    selling_price: int,
    expected_winning_price: int,
    category: str | None = None,
    fee_rate: float | None = None,
    shipping_cost: int = 800,
    other_cost: int = 0,
) -> PricingResult:
    """利益・利益率を計算

    計算式:
    利益 = 販売価格 - 予想落札価格 - Amazon手数料 - 送料 - その他
    利益率 = 利益 / 販売価格 × 100
    """
    if fee_rate is None:
        fee_rate = get_fee_rate(category)

    amazon_fee = int(selling_price * fee_rate)
    profit = selling_price - expected_winning_price - amazon_fee - shipping_cost - other_cost
    profit_rate = (profit / selling_price * 100) if selling_price > 0 else 0.0

    return PricingResult(
        selling_price=selling_price,
        expected_winning_price=expected_winning_price,
        amazon_fee=amazon_fee,
        amazon_fee_rate=fee_rate,
        shipping_cost=shipping_cost,
        other_cost=other_cost,
        profit=profit,
        profit_rate=round(profit_rate, 1),
    )


def suggest_selling_price(
    expected_winning_price: int,
    category: str | None = None,
    fee_rate: float | None = None,
    shipping_cost: int = 800,
    other_cost: int = 0,
    target_profit_rate: float = 20.0,
) -> int:
    """目標利益率から逆算して販売価格を算出

    販売価格 = (落札価格 + 送料 + その他) / (1 - 手数料率 - 目標利益率/100)
    """
    if fee_rate is None:
        fee_rate = get_fee_rate(category)

    denominator = 1 - fee_rate - (target_profit_rate / 100)
    if denominator <= 0:
        # 手数料率 + 目標利益率が100%以上 → 不可能
        return 0

    total_cost = expected_winning_price + shipping_cost + other_cost
    price = int(total_cost / denominator)

    # 100円単位で切り上げ
    return ((price + 99) // 100) * 100
