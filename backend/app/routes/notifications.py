"""Notification and Outbox routes."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Notification, OutboxJob, OutboxStatus, User
from app.schemas import NotificationResponse, OutboxStatsResponse

router = APIRouter(prefix="/api", tags=["notifications"])


@router.get("/notifications", response_model=list[NotificationResponse])
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    )
    return result.scalars().all()


@router.post("/notifications/{notification_id}/read")
async def mark_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user.id,
        )
    )
    notif = result.scalar_one_or_none()
    if notif is None:
        raise HTTPException(status_code=404, detail="Notification not found")

    await db.execute(
        update(Notification)
        .where(Notification.id == notification_id)
        .values(is_read=True)
    )
    await db.commit()
    return {"ok": True}


@router.get("/outbox/stats", response_model=OutboxStatsResponse)
async def outbox_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    counts = {}
    for s in OutboxStatus:
        result = await db.execute(
            select(func.count(OutboxJob.id)).where(OutboxJob.status == s)
        )
        counts[s.value.lower()] = result.scalar() or 0
    return OutboxStatsResponse(**counts)
