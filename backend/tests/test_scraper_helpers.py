"""スクレイパーヘルパー関数のユニットテスト"""
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.scrapers.yahoo_detail import _parse_datetime, _parse_price
from app.scrapers.yahoo_history import _parse_closed_date


class TestParsePrice:
    """_parse_price のテスト"""

    def test_basic_yen(self):
        assert _parse_price("1,000円") == 1000

    def test_with_tax(self):
        assert _parse_price("1,000円（税0円）") == 1000

    def test_large_number(self):
        assert _parse_price("100,000円") == 100000

    def test_no_yen_sign(self):
        assert _parse_price("5000") == 5000

    def test_no_match(self):
        assert _parse_price("abc") is None

    def test_empty(self):
        assert _parse_price("") is None


class TestParseDatetime:
    """_parse_datetime のテスト"""

    def test_basic(self):
        result = _parse_datetime("2026年2月19日（木）16時16分")
        assert result == datetime(2026, 2, 19, 16, 16)

    def test_different_date(self):
        result = _parse_datetime("2026年12月1日（日）9時5分")
        assert result == datetime(2026, 12, 1, 9, 5)

    def test_no_match(self):
        assert _parse_datetime("不明") is None

    def test_empty(self):
        assert _parse_datetime("") is None


class TestParseClosedDate:
    """_parse_closed_date のテスト"""

    def test_basic(self):
        result = _parse_closed_date("02/21 16:03")
        assert result is not None
        assert result.month == 2
        assert result.day == 21
        assert result.hour == 16
        assert result.minute == 3

    def test_no_match(self):
        assert _parse_closed_date("不明") is None

    def test_empty(self):
        assert _parse_closed_date("") is None


class TestRandomDelay:
    """random_delay のテスト"""

    @pytest.mark.asyncio
    @patch("app.scrapers.base.asyncio.sleep", new_callable=AsyncMock)
    async def test_default_delay(self, mock_sleep):
        from app.scrapers.base import random_delay
        await random_delay()
        mock_sleep.assert_called_once()
        delay = mock_sleep.call_args[0][0]
        assert 3 <= delay <= 8

    @pytest.mark.asyncio
    @patch("app.scrapers.base.asyncio.sleep", new_callable=AsyncMock)
    async def test_custom_delay(self, mock_sleep):
        from app.scrapers.base import random_delay
        await random_delay(min_sec=1, max_sec=2)
        mock_sleep.assert_called_once()
        delay = mock_sleep.call_args[0][0]
        assert 1 <= delay <= 2


class TestFetchWithRetry:
    """fetch_with_retry のテスト"""

    @pytest.mark.asyncio
    @patch("app.scrapers.base.random_delay", new_callable=AsyncMock)
    async def test_success(self, mock_delay):
        from app.scrapers.base import fetch_with_retry
        page = AsyncMock()
        response = MagicMock()
        response.ok = True
        response.status = 200
        page.goto = AsyncMock(return_value=response)

        result = await fetch_with_retry(page, "https://example.com")
        assert result is True

    @pytest.mark.asyncio
    @patch("app.scrapers.base.random_delay", new_callable=AsyncMock)
    @patch("app.scrapers.base.asyncio.sleep", new_callable=AsyncMock)
    async def test_retry_then_success(self, mock_sleep, mock_delay):
        from app.scrapers.base import fetch_with_retry
        page = AsyncMock()
        fail_response = MagicMock()
        fail_response.ok = False
        fail_response.status = 503
        ok_response = MagicMock()
        ok_response.ok = True
        ok_response.status = 200
        page.goto = AsyncMock(side_effect=[fail_response, ok_response])

        result = await fetch_with_retry(page, "https://example.com", max_retries=2)
        assert result is True

    @pytest.mark.asyncio
    @patch("app.scrapers.base.random_delay", new_callable=AsyncMock)
    @patch("app.scrapers.base.asyncio.sleep", new_callable=AsyncMock)
    async def test_all_retries_fail(self, mock_sleep, mock_delay):
        from app.scrapers.base import fetch_with_retry
        page = AsyncMock()
        page.goto = AsyncMock(side_effect=Exception("timeout"))

        result = await fetch_with_retry(page, "https://example.com", max_retries=2)
        assert result is False


class TestConfigSettings:
    """config.py のテスト"""

    def test_cors_origins_list(self):
        from app.config import settings
        origins = settings.cors_origins_list
        assert isinstance(origins, list)
        assert len(origins) >= 1
        assert "http://localhost:5173" in origins
