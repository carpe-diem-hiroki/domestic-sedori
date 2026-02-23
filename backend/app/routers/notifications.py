"""通知APIエンドポイント"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.notification import Notification

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class NotificationResponse(BaseModel):
    id: int
    type: str
    title: str
    message: str
    link_url: str | None
    is_read: bool
    created_at: str


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    total: int
    unread_count: int


@router.get("/", response_model=NotificationListResponse)
async def list_notifications(
    limit: int = Query(50, ge=1, le=100),
    unread_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    """通知一覧取得"""
    query = select(Notification).order_by(desc(Notification.created_at))

    if unread_only:
        query = query.where(Notification.is_read.is_(False))

    query = query.limit(limit)
    result = await db.execute(query)
    notifications = result.scalars().all()

    # 未読数
    count_result = await db.execute(
        select(func.count()).select_from(Notification).where(
            Notification.is_read.is_(False)
        )
    )
    unread_count = count_result.scalar() or 0

    return NotificationListResponse(
        items=[
            NotificationResponse(
                id=n.id,
                type=n.type,
                title=n.title,
                message=n.message,
                link_url=n.link_url,
                is_read=n.is_read,
                created_at=n.created_at.isoformat(),
            )
            for n in notifications
        ],
        total=len(notifications),
        unread_count=unread_count,
    )


@router.post("/{notification_id}/read")
async def mark_as_read(notification_id: int, db: AsyncSession = Depends(get_db)):
    """通知を既読にする"""
    await db.execute(
        update(Notification)
        .where(Notification.id == notification_id)
        .values(is_read=True)
    )
    await db.commit()
    return {"detail": "Marked as read"}


@router.post("/read-all")
async def mark_all_as_read(db: AsyncSession = Depends(get_db)):
    """全通知を既読にする"""
    await db.execute(
        update(Notification).where(Notification.is_read.is_(False)).values(is_read=True)
    )
    await db.commit()
    return {"detail": "All marked as read"}


@router.get("/unread-count")
async def get_unread_count(db: AsyncSession = Depends(get_db)):
    """未読通知数を取得"""
    result = await db.execute(
        select(func.count()).select_from(Notification).where(
            Notification.is_read.is_(False)
        )
    )
    count = result.scalar() or 0
    return {"unread_count": count}
