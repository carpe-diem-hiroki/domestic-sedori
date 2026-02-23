"""Amazonスクレイパーのユニットテスト（モック使用）"""
import pytest

from app.scrapers.amazon_product import AmazonProduct, CompetitorOffer


class TestAmazonProductDataclass:
    """AmazonProductデータクラスのテスト"""

    def test_default_values(self):
        """デフォルト値が正しく設定される"""
        product = AmazonProduct(asin="B09TEST123")
        assert product.asin == "B09TEST123"
        assert product.title is None
        assert product.price is None
        assert product.brand is None
        assert product.model_number is None
        assert product.category is None
        assert product.image_url is None
        assert product.rating is None
        assert product.review_count is None

    def test_full_product(self):
        """全フィールドが設定される"""
        product = AmazonProduct(
            asin="B09TEST123",
            title="テスト商品",
            price=5980,
            brand="テストブランド",
            model_number="TH-32J300",
            category="家電",
            image_url="https://example.com/img.jpg",
            rating=4.5,
            review_count=123,
        )
        assert product.title == "テスト商品"
        assert product.price == 5980
        assert product.rating == 4.5


class TestCompetitorOfferDataclass:
    """CompetitorOfferデータクラスのテスト"""

    def test_basic_offer(self):
        """基本的なオファー"""
        offer = CompetitorOffer(
            price=5000,
            condition="新品",
            seller_name="テスト出品者",
            shipping_cost=0,
            is_fba=True,
        )
        assert offer.price == 5000
        assert offer.condition == "新品"
        assert offer.is_fba is True

    def test_used_offer_with_shipping(self):
        """送料ありの中古オファー"""
        offer = CompetitorOffer(
            price=3000,
            condition="中古",
            shipping_cost=500,
            is_fba=False,
        )
        assert offer.condition == "中古"
        assert offer.shipping_cost == 500


class TestAmazonURLFormats:
    """URL生成のテスト"""

    def test_product_url(self):
        from app.scrapers.amazon_product import AMAZON_PRODUCT_URL

        url = AMAZON_PRODUCT_URL.format(asin="B09TEST123")
        assert "B09TEST123" in url
        assert "amazon.co.jp/dp/" in url

    def test_offers_url(self):
        from app.scrapers.amazon_product import AMAZON_OFFERS_URL

        url = AMAZON_OFFERS_URL.format(asin="B09TEST123")
        assert "B09TEST123" in url
        assert "offer-listing" in url
