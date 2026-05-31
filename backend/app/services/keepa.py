"""Keepa連携サービス（Amazon価格履歴）

将来の本格連携用の土台。`.env` に KEEPA_API_KEY を設定すると有効化される。
未設定でもアプリは動作する（is_enabled() が False を返すだけ）。

Keepa API: https://keepa.com/#!api
- 価格は「セント/最小単位」ではなく日本円の場合そのまま整数（-1 = データなし）
- 時刻は keepaMinutes（分）= unixミリ秒/60000 - 21564000
"""
import logging
from dataclasses import dataclass

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

KEEPA_BASE = "https://api.keepa.com"
_KEEPA_EPOCH_OFFSET_MIN = 21564000  # keepaMinutes -> unix変換用


def is_enabled() -> bool:
    """Keepa APIキーが設定されていれば True"""
    return bool(settings.keepa_api_key)


def keepa_minutes_to_iso(km: int) -> str:
    """keepaMinutes を ISO8601 文字列へ"""
    from datetime import datetime, timezone

    unix_sec = (km + _KEEPA_EPOCH_OFFSET_MIN) * 60
    return datetime.fromtimestamp(unix_sec, tz=timezone.utc).isoformat()


@dataclass
class KeepaPricePoint:
    captured_at: str  # ISO8601
    price: int        # 円（-1はデータなしとして除外済み）


def _parse_csv_series(csv: list[int] | None) -> list[KeepaPricePoint]:
    """KeepaのCSV配列 [t0, v0, t1, v1, ...] を価格ポイント列に変換"""
    if not csv:
        return []
    points: list[KeepaPricePoint] = []
    for i in range(0, len(csv) - 1, 2):
        t, v = csv[i], csv[i + 1]
        if v is None or v < 0:
            continue  # -1 = その時点でデータなし
        points.append(KeepaPricePoint(captured_at=keepa_minutes_to_iso(t), price=v))
    return points


async def fetch_amazon_price_history(asin: str) -> list[KeepaPricePoint]:
    """ASINのAmazon本体価格の履歴を取得（Keepa csv[0]）

    未設定時は RuntimeError。呼び出し側で is_enabled() を確認すること。
    """
    if not is_enabled():
        raise RuntimeError("Keepa API key is not configured")

    params = {
        "key": settings.keepa_api_key,
        "domain": settings.keepa_domain,
        "asin": asin,
        "history": 1,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{KEEPA_BASE}/product", params=params)
        resp.raise_for_status()
        data = resp.json()

    products = data.get("products") or []
    if not products:
        return []
    csv = products[0].get("csv") or []
    # csv[0] = Amazon本体価格の履歴
    amazon_series = csv[0] if len(csv) > 0 else None
    return _parse_csv_series(amazon_series)
