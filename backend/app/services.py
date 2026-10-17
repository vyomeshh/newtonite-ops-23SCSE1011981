"""Core business logic: RBAC, workflow, idempotency, claim, outbox."""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy import and_, case, func, literal_column, or_, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ROLE_HIERARCHY,
    ActivityEvent,
    EventType,
    IdempotencyKey,
    ItemType,
    Membership,
    Notification,
    OutboxEventType,
    OutboxJob,
    OutboxStatus,
    Priority,
    Status,
    TeamRole,
    User,
    WorkItem,
)


# ═══════════════════════════════════════════════════════════════════════════
# RBAC
# ═══════════════════════════════════════════════════════════════════════════

async def require_team_role(
    db: AsyncSession,
    user: User,
    team_id: int,
    min_role: TeamRole,
) -> Membership:
    """
    Check that `user` has at least `min_role` in `team_id`.
    Returns the Membership row on success; raises 403 on failure.
    """
    result = await db.execute(
        select(Membership).where(
            Membership.user_id == user.id,
            Membership.team_id == team_id,
        )
    )
    membership = result.scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You are not a member of team {team_id}",
        )
    if ROLE_HIERARCHY[membership.role] < ROLE_HIERARCHY[min_role]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires at least {min_role.value} role in this team (you are {membership.role.value})",
        )
    return membership


def _item_to_dict(item: WorkItem) -> dict:
    """Serialise a WorkItem to a JSON-safe dict for API responses."""
    return {
        "id": item.id,
        "title": item.title,
        "description": item.description,
        "item_type": item.item_type.value if isinstance(item.item_type, ItemType) else item.item_type,
        "priority": item.priority.value if isinstance(item.priority, Priority) else item.priority,
        "status": item.status.value if isinstance(item.status, Status) else item.status,
        "team_id": item.team_id,
        "team_name": item.team.name if item.team else None,
        "assignee_id": item.assignee_id,
        "assignee_name": item.assignee.full_name if item.assignee else None,
        "created_by_id": item.created_by_id,
        "created_by_name": item.created_by.full_name if item.created_by else None,
        "approved_by_id": item.approved_by_id,
        "approved_by_name": item.approved_by.full_name if item.approved_by else None,
        "due_date": item.due_date.isoformat() if item.due_date else None,
        "version": item.version,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


async def _get_item_fresh(db: AsyncSession, item_id: int) -> WorkItem | None:
    """Fetch a work item with all joined relationships."""
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(WorkItem)
        .options(
            selectinload(WorkItem.team),
            selectinload(WorkItem.assignee),
            selectinload(WorkItem.created_by),
            selectinload(WorkItem.approved_by),
        )
        .where(WorkItem.id == item_id)
    )
    return result.scalar_one_or_none()


# ═══════════════════════════════════════════════════════════════════════════
# Idempotency
# ═══════════════════════════════════════════════════════════════════════════

def compute_request_hash(body: Any) -> str:
    """SHA-256 hex digest of the canonical JSON body."""
    raw = json.dumps(body, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


async def check_idempotency(
    db: AsyncSession,
    key: str,
    user_id: int,
    endpoint: str,
    request_hash: str,
) -> Optional[IdempotencyKey]:
    """
    Returns an existing IdempotencyKey if found for this key+user+endpoint.
    Raises 422 if the same key was used with a different payload.
    """
    result = await db.execute(
        select(IdempotencyKey).where(
            IdempotencyKey.key == key,
            IdempotencyKey.user_id == user_id,
            IdempotencyKey.endpoint == endpoint,
        )
    )
    existing = result.scalar_one_or_none()
    if existing is None:
        return None
    if existing.request_hash != request_hash:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Idempotency key reused with different request payload",
        )
    return existing


async def store_idempotency(
    db: AsyncSession,
    key: str,
    user_id: int,
    endpoint: str,
    request_hash: str,
    response_status: int,
    response_body: dict,
):
    """Persist the idempotency record for future replays."""
    record = IdempotencyKey(
        key=key,
        user_id=user_id,
        endpoint=endpoint,
        request_hash=request_hash,
        response_status=response_status,
        response_body=response_body,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db.add(record)
    await db.flush()


# ═══════════════════════════════════════════════════════════════════════════
# Workflow transition rules
# ═══════════════════════════════════════════════════════════════════════════

ALLOWED_TRANSITIONS: dict[Status, set[Status]] = {
    Status.OPEN: {Status.IN_PROGRESS},
    Status.IN_PROGRESS: {Status.AWAITING_APPROVAL, Status.RESOLVED, Status.OPEN},
    Status.AWAITING_APPROVAL: {Status.RESOLVED, Status.IN_PROGRESS},
    Status.RESOLVED: {Status.CLOSED, Status.IN_PROGRESS},
    Status.CLOSED: {Status.IN_PROGRESS},
}


def validate_transition(
    item: WorkItem,
    target: Status,
    user_role: TeamRole,
) -> None:
    """
    Raise 400 / 403 if the requested transition is illegal.
    Does NOT commit – only validates.
    """
    current = Status(item.status) if isinstance(item.status, str) else item.status
    if target not in ALLOWED_TRANSITIONS.get(current, set()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Transition from {current.value} to {target.value} is not allowed",
        )

    item_type = ItemType(item.item_type) if isinstance(item.item_type, str) else item.item_type
    item_priority = Priority(item.priority) if isinstance(item.priority, str) else item.priority

    # Compliance/Payment/Urgent items must go through AWAITING_APPROVAL
    requires_approval = (
        item_type in (ItemType.COMPLIANCE, ItemType.PAYMENT) or
        item_priority == Priority.URGENT
    )
    if requires_approval and current == Status.IN_PROGRESS and target == Status.RESOLVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This item requires lead approval before resolution. "
                   "Transition to AWAITING_APPROVAL first.",
        )

    # Lead/Admin-only transitions
    lead_only_transitions = {
        (Status.AWAITING_APPROVAL, Status.RESOLVED),
        (Status.CLOSED, Status.IN_PROGRESS),
    }
    if (current, target) in lead_only_transitions:
        if ROLE_HIERARCHY[user_role] < ROLE_HIERARCHY[TeamRole.LEAD]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Only LEAD or ADMIN can perform {current.value} → {target.value}",
            )


# ═══════════════════════════════════════════════════════════════════════════
# Atomic Claim
# ═══════════════════════════════════════════════════════════════════════════

async def atomic_claim_item(
    db: AsyncSession,
    item_id: int,
    user: User,
) -> dict:
    """
    Atomically claim an unassigned work item via a single UPDATE … RETURNING.
    Returns the serialised item on success.
    Raises 409 if already claimed.
    """
    stmt = (
        update(WorkItem)
        .where(
            WorkItem.id == item_id,
            WorkItem.assignee_id.is_(None),
        )
        .values(
            assignee_id=user.id,
            status=case(
                (WorkItem.status == Status.OPEN.value, Status.IN_PROGRESS.value),
                else_=WorkItem.status,
            ),
            version=WorkItem.version + 1,
            updated_at=func.now(),
        )
        .returning(WorkItem.id)
    )
    result = await db.execute(stmt)
    row = result.fetchone()

    if row is None:
        current_item = await _get_item_fresh(db, item_id)
        if current_item is None:
            raise HTTPException(status_code=404, detail="Work item not found")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "ITEM_ALREADY_CLAIMED",
                "message": f"Item already claimed by user {current_item.assignee_id}",
                "current_item": _item_to_dict(current_item),
            },
        )

    # Write audit event in the SAME transaction
    event = ActivityEvent(
        work_item_id=item_id,
        actor_id=user.id,
        event_type=EventType.ITEM_CLAIMED,
        old_value={"assignee_id": None},
        new_value={"assignee_id": user.id},
    )
    db.add(event)

    # Outbox job in the SAME transaction
    outbox = OutboxJob(
        event_type=OutboxEventType.NOTIFY_ASSIGNEE,
        dedupe_key=f"claim-{item_id}-{user.id}-{uuid.uuid4().hex[:8]}",
        payload={"work_item_id": item_id, "assignee_id": user.id, "action": "claimed"},
        status=OutboxStatus.PENDING,
    )
    db.add(outbox)

    await db.commit()

    fresh = await _get_item_fresh(db, item_id)
    return _item_to_dict(fresh)


# ═══════════════════════════════════════════════════════════════════════════
# Optimistic-Locked Update
# ═══════════════════════════════════════════════════════════════════════════

async def optimistic_update_item(
    db: AsyncSession,
    item_id: int,
    user: User,
    updates: dict,
    client_version: int,
) -> dict:
    """
    Update fields on a work item with optimistic locking via `version`.
    Records field diffs in activity_events in the same transaction.
    """
    item = await _get_item_fresh(db, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Work item not found")

    # Build SET clause
    set_values: dict[str, Any] = {
        "version": WorkItem.version + 1,
        "updated_at": func.now(),
    }
    diffs_old = {}
    diffs_new = {}

    for field, new_val in updates.items():
        if new_val is None and field != "assignee_id":
            continue
        old_val = getattr(item, field)
        if isinstance(old_val, (ItemType, Priority, Status)):
            old_val = old_val.value
        if old_val != new_val:
            set_values[field] = new_val
            diffs_old[field] = old_val
            diffs_new[field] = new_val

    # Check if reassigning an already-claimed item
    if "assignee_id" in diffs_new and item.assignee_id is not None:
        membership = await require_team_role(db, user, item.team_id, TeamRole.LEAD)

    stmt = (
        update(WorkItem)
        .where(WorkItem.id == item_id, WorkItem.version == client_version)
        .values(**set_values)
        .returning(WorkItem.id)
    )
    result = await db.execute(stmt)
    row = result.fetchone()

    if row is None:
        await db.rollback()
        current = await _get_item_fresh(db, item_id)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "VERSION_CONFLICT",
                "message": "Item was modified by another user",
                "current_item": _item_to_dict(current) if current else None,
            },
        )

    # Determine event types from diffs
    if "priority" in diffs_new:
        db.add(ActivityEvent(
            work_item_id=item_id,
            actor_id=user.id,
            event_type=EventType.PRIORITY_CHANGED,
            old_value={"priority": diffs_old.get("priority")},
            new_value={"priority": diffs_new.get("priority")},
        ))

    if "assignee_id" in diffs_new:
        db.add(ActivityEvent(
            work_item_id=item_id,
            actor_id=user.id,
            event_type=EventType.ITEM_ASSIGNED,
            old_value={"assignee_id": diffs_old.get("assignee_id")},
            new_value={"assignee_id": diffs_new.get("assignee_id")},
        ))
        # Outbox: notify newly assigned user
        if diffs_new["assignee_id"] is not None:
            db.add(OutboxJob(
                event_type=OutboxEventType.NOTIFY_ASSIGNEE,
                dedupe_key=f"assign-{item_id}-{diffs_new['assignee_id']}-{uuid.uuid4().hex[:8]}",
                payload={"work_item_id": item_id, "assignee_id": diffs_new["assignee_id"], "action": "assigned"},
                status=OutboxStatus.PENDING,
            ))

    remaining_fields = {k for k in diffs_new if k not in ("priority", "assignee_id")}
    if remaining_fields:
        db.add(ActivityEvent(
            work_item_id=item_id,
            actor_id=user.id,
            event_type=EventType.DETAILS_UPDATED,
            old_value={k: diffs_old.get(k) for k in remaining_fields},
            new_value={k: diffs_new.get(k) for k in remaining_fields},
        ))

    await db.commit()
    fresh = await _get_item_fresh(db, item_id)
    return _item_to_dict(fresh)


# ═══════════════════════════════════════════════════════════════════════════
# Workflow Transition
# ═══════════════════════════════════════════════════════════════════════════

async def perform_transition(
    db: AsyncSession,
    item_id: int,
    user: User,
    target_status_str: str,
    client_version: int,
    reason: Optional[str] = None,
) -> dict:
    """Execute a workflow transition with all validations."""
    item = await _get_item_fresh(db, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Work item not found")

    target = Status(target_status_str)
    current = Status(item.status) if isinstance(item.status, str) else item.status

    # Get user's role in this team
    membership = await require_team_role(db, user, item.team_id, TeamRole.MEMBER)
    validate_transition(item, target, membership.role)

    # Optimistic locking
    set_values: dict[str, Any] = {
        "status": target.value,
        "version": WorkItem.version + 1,
        "updated_at": func.now(),
    }

    # Set approved_by if approving
    if current == Status.AWAITING_APPROVAL and target == Status.RESOLVED:
        set_values["approved_by_id"] = user.id

    stmt = (
        update(WorkItem)
        .where(WorkItem.id == item_id, WorkItem.version == client_version)
        .values(**set_values)
        .returning(WorkItem.id)
    )
    result = await db.execute(stmt)
    row = result.fetchone()

    if row is None:
        await db.rollback()
        current_item = await _get_item_fresh(db, item_id)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "VERSION_CONFLICT",
                "message": "Item was modified by another user",
                "current_item": _item_to_dict(current_item) if current_item else None,
            },
        )

    # Determine event type
    if current == Status.AWAITING_APPROVAL and target == Status.RESOLVED:
        evt_type = EventType.APPROVAL_GRANTED
    elif current == Status.AWAITING_APPROVAL and target == Status.IN_PROGRESS:
        evt_type = EventType.APPROVAL_REJECTED
    else:
        evt_type = EventType.STATUS_CHANGED

    db.add(ActivityEvent(
        work_item_id=item_id,
        actor_id=user.id,
        event_type=evt_type,
        old_value={"status": current.value},
        new_value={"status": target.value},
        comment_text=reason,
    ))

    # Outbox: notify lead if awaiting approval
    if target == Status.AWAITING_APPROVAL:
        db.add(OutboxJob(
            event_type=OutboxEventType.NOTIFY_LEAD_APPROVAL,
            dedupe_key=f"approval-{item_id}-{uuid.uuid4().hex[:8]}",
            payload={"work_item_id": item_id, "team_id": item.team_id, "requested_by": user.id},
            status=OutboxStatus.PENDING,
        ))

    await db.commit()
    fresh = await _get_item_fresh(db, item_id)
    return _item_to_dict(fresh)


# ═══════════════════════════════════════════════════════════════════════════
# Outbox Worker
# ═══════════════════════════════════════════════════════════════════════════

async def process_pending_outbox_jobs(db: AsyncSession) -> int:
    """
    Poll and process pending outbox jobs.
    Uses FOR UPDATE SKIP LOCKED for concurrency safety.
    Returns the number of jobs processed.
    """
    now = datetime.now(timezone.utc)

    # Select pending jobs ready to run
    stmt = (
        select(OutboxJob)
        .where(
            OutboxJob.status == OutboxStatus.PENDING,
            OutboxJob.next_run_at <= now,
        )
        .order_by(OutboxJob.next_run_at)
        .limit(20)
        .with_for_update(skip_locked=True)
    )
    result = await db.execute(stmt)
    jobs = result.scalars().all()

    processed = 0
    for job in jobs:
        job.status = OutboxStatus.PROCESSING
        job.attempts += 1
        await db.flush()

        try:
            await _execute_outbox_job(db, job)
            job.status = OutboxStatus.COMPLETED
            processed += 1
        except Exception as e:
            job.last_error = str(e)
            if job.attempts >= job.max_attempts:
                job.status = OutboxStatus.FAILED
            else:
                job.status = OutboxStatus.PENDING
                # Exponential backoff: 30s, 120s, 270s …
                backoff_seconds = 30 * (job.attempts ** 2)
                job.next_run_at = now + timedelta(seconds=backoff_seconds)

    await db.commit()
    return processed


async def _execute_outbox_job(db: AsyncSession, job: OutboxJob):
    """Route an outbox job to its handler and create notifications."""
    payload = job.payload
    work_item_id = payload.get("work_item_id")

    if job.event_type == OutboxEventType.NOTIFY_ASSIGNEE:
        assignee_id = payload.get("assignee_id")
        action = payload.get("action", "assigned")
        dedupe = f"notif-assign-{work_item_id}-{assignee_id}-{job.id}"
        stmt = pg_insert(Notification).values(
            user_id=assignee_id,
            work_item_id=work_item_id,
            dedupe_key=dedupe,
            title=f"Work Item #{work_item_id} {action}",
            message=f"You have been {action} to work item #{work_item_id}.",
        ).on_conflict_do_nothing(index_elements=["dedupe_key"])
        await db.execute(stmt)

    elif job.event_type == OutboxEventType.NOTIFY_LEAD_APPROVAL:
        team_id = payload.get("team_id")
        # Find all LEADs and ADMINs in this team
        lead_result = await db.execute(
            select(Membership.user_id).where(
                Membership.team_id == team_id,
                Membership.role.in_([TeamRole.LEAD, TeamRole.ADMIN]),
            )
        )
        lead_ids = [r[0] for r in lead_result.fetchall()]
        for lid in lead_ids:
            dedupe = f"notif-approval-{work_item_id}-{lid}-{job.id}"
            stmt = pg_insert(Notification).values(
                user_id=lid,
                work_item_id=work_item_id,
                dedupe_key=dedupe,
                title=f"Approval Required: Item #{work_item_id}",
                message=f"Work item #{work_item_id} requires your approval.",
            ).on_conflict_do_nothing(index_elements=["dedupe_key"])
            await db.execute(stmt)

    elif job.event_type == OutboxEventType.AUDIT_ENRICHMENT:
        pass  # Future: enrich audit data
