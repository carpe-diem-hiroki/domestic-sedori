"""価格計算サービスのユニットテスト"""
import pytest

from app.services.pricing import (
    calculate_pricing,
    estimate_winning_price,
    get_fee_rate,
    suggest_selling_price,
)


class TestEstimateWinningPrice:
    """予想落札価格の自動計算テスト"""

    def test_history_median_odd(self):
        """奇数件の落札履歴 → 中央値を返す"""
        prices = [1000, 3000, 2000]
        assert estimate_winning_price(prices) == 2000

    def test_history_median_even(self):
        """偶数件の落札履歴 → 中央値(平均)を返す"""
        prices = [1000, 2000, 3000, 4000]
        # ソート後: [1000, 2000, 3000, 4000] → (2000+3000)//2 = 2500
        assert estimate_winning_price(prices) == 2500

    def test_history_single(self):
        """1件だけの履歴 → その値を返す"""
        assert estimate_winning_price([5000]) == 5000

    def test_no_history_with_buynow(self):
        """履歴なし + 即決価格あり → 即決価格の70%"""
        result = estimate_winning_price([], buy_now_price=10000)
        assert result == 7000

    def test_no_history_no_buynow(self):
        """履歴なし + 即決なし → None"""
        assert estimate_winning_price([]) is None

    def test_history_takes_priority_over_buynow(self):
        """履歴がある場合は即決価格より履歴を優先"""
        result = estimate_winning_price([3000, 5000], buy_now_price=10000)
        # 中央値 = (3000+5000)//2 = 4000 （即決の7000ではない）
        assert result == 4000

    def test_buynow_zero(self):
        """即決価格0 → None"""
        assert estimate_winning_price([], buy_now_price=0) is None


class TestGetFeeRate:
    """Amazon手数料率取得テスト"""

    def test_electronics(self):
        assert get_fee_rate("家電") == 0.08

    def test_games(self):
        assert get_fee_rate("ゲーム") == 0.15

    def test_toys(self):
        assert get_fee_rate("おもちゃ") == 0.10

    def test_category_with_partial_match(self):
        """カテゴリ名に「家電」が含まれる場合もマッチ"""
        assert get_fee_rate("大型家電・季節家電") == 0.08

    def test_unknown_category(self):
        """不明なカテゴリ → デフォルト15%"""
        assert get_fee_rate("スポーツ") == 0.15

    def test_none_category(self):
        """カテゴリなし → デフォルト15%"""
        assert get_fee_rate(None) == 0.15


class TestCalculatePricing:
    """利益計算テスト"""

    def test_basic_calculation(self):
        """基本的な利益計算"""
        result = calculate_pricing(
            selling_price=10000,
            expected_winning_price=5000,
            fee_rate=0.15,
            shipping_cost=800,
            other_cost=0,
        )
        # 手数料: 10000 * 0.15 = 1500
        # 利益: 10000 - 5000 - 1500 - 800 = 2700
        # 利益率: 2700/10000*100 = 27.0%
        assert result.amazon_fee == 1500
        assert result.profit == 2700
        assert result.profit_rate == 27.0

    def test_negative_profit(self):
        """赤字の場合はマイナスの利益"""
        result = calculate_pricing(
            selling_price=5000,
            expected_winning_price=5000,
            fee_rate=0.15,
            shipping_cost=800,
        )
        # 手数料: 750, 利益: 5000-5000-750-800 = -1550
        assert result.profit < 0

    def test_zero_selling_price(self):
        """販売価格0 → 利益率0"""
        result = calculate_pricing(
            selling_price=0,
            expected_winning_price=1000,
        )
        assert result.profit_rate == 0.0

    def test_with_category(self):
        """カテゴリ指定時は対応する手数料率を使う"""
        result = calculate_pricing(
            selling_price=10000,
            expected_winning_price=5000,
            category="家電",
        )
        assert result.amazon_fee_rate == 0.08
        assert result.amazon_fee == 800

    def test_explicit_fee_rate_overrides_category(self):
        """明示的なfee_rateはカテゴリより優先"""
        result = calculate_pricing(
            selling_price=10000,
            expected_winning_price=5000,
            category="家電",
            fee_rate=0.20,
        )
        assert result.amazon_fee_rate == 0.20
        assert result.amazon_fee == 2000

    def test_with_other_cost(self):
        """その他経費を含む計算"""
        result = calculate_pricing(
            selling_price=10000,
            expected_winning_price=5000,
            fee_rate=0.15,
            shipping_cost=800,
            other_cost=200,
        )
        # 利益: 10000-5000-1500-800-200 = 2500
        assert result.profit == 2500


class TestSuggestSellingPrice:
    """推奨販売価格の逆算テスト"""

    def test_basic_suggestion(self):
        """基本的な逆算"""
        price = suggest_selling_price(
            expected_winning_price=5000,
            fee_rate=0.15,
            shipping_cost=800,
            other_cost=0,
            target_profit_rate=20.0,
        )
        # 分母 = 1 - 0.15 - 0.20 = 0.65
        # 原価 = 5000 + 800 = 5800
        # 価格 = 5800 / 0.65 = 8923 → 100円切り上げ = 9000
        assert price == 9000

    def test_impossible_rate(self):
        """手数料+目標利益率が100%以上 → 0"""
        price = suggest_selling_price(
            expected_winning_price=5000,
            fee_rate=0.50,
            target_profit_rate=60.0,
        )
        assert price == 0

    def test_rounds_up_to_100(self):
        """100円単位で切り上げ"""
        price = suggest_selling_price(
            expected_winning_price=3000,
            fee_rate=0.15,
            shipping_cost=800,
            target_profit_rate=20.0,
        )
        assert price % 100 == 0
        assert price > 0

    def test_with_category(self):
        """カテゴリ指定での逆算"""
        price = suggest_selling_price(
            expected_winning_price=5000,
            category="家電",
            shipping_cost=800,
            target_profit_rate=20.0,
        )
        # 手数料率: 8% → 分母 = 1 - 0.08 - 0.20 = 0.72
        # 原価 = 5800, 価格 = 5800/0.72 = 8056 → 8100
        assert price == 8100
