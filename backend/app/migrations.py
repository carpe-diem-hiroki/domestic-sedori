"""軽量マイグレーション

Alembic を使わないため、起動時に既存テーブルへ不足カラムを追加する。
SQLite の `ALTER TABLE ... ADD COLUMN`（NULL許容カラムのみ）で冪等に実行する。
新規テーブルは Base.metadata.create_all が作成するのでここでは扱わない。
"""
import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

logger = logging.getLogger(__name__)

# テーブル名 -> [(カラム名, SQLの型定義), ...]
# すべて NULL 許容（既存行があるため DEFAULT なしで追加可能）
COLUMN_ADDITIONS: dict[str, list[tuple[str, str]]] = {
    "listings": [
        ("actual_purchase_price", "INTEGER"),
        ("min_price", "INTEGER"),
        ("sold_price", "INTEGER"),
        ("sold_date", "DATETIME"),
        ("actual_profit", "INTEGER"),
    ],
}


async def _get_existing_columns(conn: AsyncConnection, table: str) -> set[str]:
    result = await conn.execute(text(f"PRAGMA table_info({table})"))
    return {row[1] for row in result.fetchall()}


async def run_migrations(conn: AsyncConnection) -> None:
    """不足カラムを追加する（create_all の後に呼ぶ）"""
    for table, columns in COLUMN_ADDITIONS.items():
        existing = await _get_existing_columns(conn, table)
        if not existing:
            # テーブル自体が無い（create_all で新規作成済み = 全カラムある）→ スキップ
            continue
        for col_name, col_type in columns:
            if col_name in existing:
                continue
            await conn.execute(
                text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}")
            )
            logger.info(f"Migration: added column {table}.{col_name} ({col_type})")
