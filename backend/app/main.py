"""FastAPI メインアプリケーション"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine
from app.models import Base
from app.routers import amazon, monitor, notifications, pricing, scheduler, templates, yahoo

# ログ設定
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """起動時にDBテーブルを自動作成 + スケジューラー起動、終了時に停止"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    if settings.scheduler_auto_start:
        from app.services.scheduler import start_scheduler
        start_scheduler()

    yield

    from app.services.scheduler import stop_scheduler
    stop_scheduler()


app = FastAPI(
    title="Sedori Tool API",
    description="ヤフオク→Amazon無在庫転売支援ツール",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS設定（フロントエンド・Edge拡張からのアクセスを許可）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)

# ルーター登録
app.include_router(yahoo.router)
app.include_router(monitor.router)
app.include_router(pricing.router)
app.include_router(amazon.router)
app.include_router(templates.router)
app.include_router(notifications.router)
app.include_router(scheduler.router)


@app.get("/")
async def root():
    return {"message": "Sedori Tool API", "version": "0.1.0"}


@app.get("/api/health")
async def health():
    return {"status": "ok"}
