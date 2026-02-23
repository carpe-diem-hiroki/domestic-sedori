"""Playwright基盤スクレイパー - stealth設定・遅延・リトライ付き"""
import asyncio
import logging
import random
from contextlib import asynccontextmanager

from playwright.async_api import Browser, Page, async_playwright
from playwright_stealth import Stealth

from app.config import settings

logger = logging.getLogger(__name__)

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
]

stealth = Stealth()


async def random_delay(min_sec: float | None = None, max_sec: float | None = None):
    """ランダム遅延（デフォルト: Yahoo設定の3〜8秒）"""
    min_val = min_sec if min_sec is not None else settings.yahoo_request_delay_min
    max_val = max_sec if max_sec is not None else settings.yahoo_request_delay_max
    delay = random.uniform(min_val, max_val)
    logger.debug(f"Waiting {delay:.1f}s...")
    await asyncio.sleep(delay)


@asynccontextmanager
async def get_browser():
    """Stealth付きPlaywrightブラウザをコンテキストマネージャーで提供"""
    async with stealth.use_async(async_playwright()) as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            yield browser
        finally:
            await browser.close()


@asynccontextmanager
async def get_page(browser: Browser):
    """ページを提供（UA回転+日本語設定）"""
    ua = random.choice(USER_AGENTS)
    context = await browser.new_context(
        user_agent=ua,
        viewport={"width": 1920, "height": 1080},
        locale="ja-JP",
        timezone_id="Asia/Tokyo",
    )
    page = await context.new_page()
    try:
        yield page
    finally:
        await page.close()
        await context.close()


async def fetch_with_retry(page: Page, url: str, max_retries: int = 3) -> bool:
    """リトライ付きページ読み込み。成功時True、失敗時False"""
    for attempt in range(max_retries):
        try:
            await random_delay()
            response = await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            if response and response.ok:
                return True
            logger.warning(
                f"Attempt {attempt + 1}: HTTP {response.status if response else 'N/A'} for {url}"
            )
        except Exception as e:
            logger.warning(f"Attempt {attempt + 1}: {e}")
        if attempt < max_retries - 1:
            await asyncio.sleep(5 * (attempt + 1))
    logger.error(f"Failed after {max_retries} attempts: {url}")
    return False
