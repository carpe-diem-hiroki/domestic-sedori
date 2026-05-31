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

# 取得を止める重いリソース（DOMだけ取れれば良いので画像等は不要）
_BLOCKED_RESOURCE_TYPES = {"image", "media", "font", "stylesheet"}


async def random_delay(min_sec: float | None = None, max_sec: float | None = None):
    """ランダム遅延（デフォルト: Yahoo設定の3〜8秒）"""
    min_val = min_sec if min_sec is not None else settings.yahoo_request_delay_min
    max_val = max_sec if max_sec is not None else settings.yahoo_request_delay_max
    delay = random.uniform(min_val, max_val)
    logger.debug(f"Waiting {delay:.1f}s...")
    await asyncio.sleep(delay)


# ===== 共有ブラウザ（起動コストを1回に集約） =====

_pw_cm = None          # stealth.use_async(async_playwright()) のコンテキストマネージャ
_playwright = None     # その __aenter__ 戻り値
_browser: Browser | None = None
_browser_lock = asyncio.Lock()


async def get_shared_browser() -> Browser:
    """プロセス内で1つだけ起動するブラウザを返す（使い回し）"""
    global _pw_cm, _playwright, _browser
    if _browser is not None and _browser.is_connected():
        return _browser
    async with _browser_lock:
        # ロック取得待ちの間に他タスクが初期化済みかもしれない
        if _browser is not None and _browser.is_connected():
            return _browser
        if _playwright is None:
            _pw_cm = stealth.use_async(async_playwright())
            _playwright = await _pw_cm.__aenter__()
        _browser = await _playwright.chromium.launch(headless=True)
        logger.info("Shared browser launched")
        return _browser


async def close_shared_browser() -> None:
    """共有ブラウザ・Playwrightを終了（lifespan shutdownで呼ぶ）"""
    global _pw_cm, _playwright, _browser
    if _browser is not None:
        try:
            await _browser.close()
        except Exception:
            pass
        _browser = None
    if _pw_cm is not None:
        try:
            await _pw_cm.__aexit__(None, None, None)
        except Exception:
            pass
        _pw_cm = None
        _playwright = None
    logger.info("Shared browser closed")


@asynccontextmanager
async def get_browser():
    """後方互換: 共有ブラウザをコンテキストマネージャー形式で返す（閉じない）"""
    browser = await get_shared_browser()
    yield browser


async def _block_heavy_resources(route):
    if route.request.resource_type in _BLOCKED_RESOURCE_TYPES:
        await route.abort()
    else:
        await route.continue_()


@asynccontextmanager
async def get_page(browser: Browser):
    """ページを提供（UA回転+日本語設定+重いリソースのブロック）"""
    ua = random.choice(USER_AGENTS)
    context = await browser.new_context(
        user_agent=ua,
        viewport={"width": 1920, "height": 1080},
        locale="ja-JP",
        timezone_id="Asia/Tokyo",
    )
    await context.route("**/*", _block_heavy_resources)
    page = await context.new_page()
    try:
        yield page
    finally:
        await page.close()
        await context.close()


async def fetch_with_retry(
    page: Page,
    url: str,
    max_retries: int = 3,
    delay_min: float | None = None,
    delay_max: float | None = None,
) -> bool:
    """リトライ付きページ読み込み。成功時True、失敗時False

    delay_min/max を指定すると事前待機を上書きできる（対話検索は短く、巡回は長く）。
    """
    for attempt in range(max_retries):
        try:
            await random_delay(delay_min, delay_max)
            response = await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            if response and response.ok:
                return True
            status = response.status if response else None
            logger.warning(f"Attempt {attempt + 1}: HTTP {status} for {url}")
            # 4xx（404等）は再試行しても無駄なので即中断
            if status is not None and 400 <= status < 500:
                return False
        except Exception as e:
            logger.warning(f"Attempt {attempt + 1}: {e}")
        if attempt < max_retries - 1:
            await asyncio.sleep(5 * (attempt + 1))
    logger.error(f"Failed after {max_retries} attempts: {url}")
    return False
