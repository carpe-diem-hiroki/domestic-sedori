"""スケジューラー管理APIエンドポイント"""
from fastapi import APIRouter
from pydantic import BaseModel

from app.services.scheduler import (
    get_scheduler_status,
    start_scheduler,
    stop_scheduler,
)

router = APIRouter(prefix="/api/scheduler", tags=["scheduler"])


class SchedulerStatusResponse(BaseModel):
    running: bool
    interval_minutes: int
    next_run: str | None


@router.get("/status", response_model=SchedulerStatusResponse)
async def scheduler_status():
    """スケジューラーの状態を取得"""
    status = get_scheduler_status()
    return SchedulerStatusResponse(**status)


@router.post("/start")
async def scheduler_start():
    """スケジューラーを起動"""
    start_scheduler()
    return {"detail": "Scheduler started"}


@router.post("/stop")
async def scheduler_stop():
    """スケジューラーを停止"""
    stop_scheduler()
    return {"detail": "Scheduler stopped"}


@router.post("/run-now")
async def run_now():
    """今すぐ監視チェックを実行"""
    from app.services.scheduler import check_monitored_auctions

    await check_monitored_auctions()
    return {"detail": "Check completed"}
