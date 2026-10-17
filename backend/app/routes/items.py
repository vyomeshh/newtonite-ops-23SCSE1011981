"""Work item routes: CRUD, claim, transition, activity, comments, simulate."""

from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy import and_, case, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models import (
    ActivityEvent,
    EventType,
    ItemType,
    Membership,
    OutboxEventType,
    OutboxJob,
    OutboxStatus,
    Priority,
    Status,
    TeamRole,
    User,
    WorkItem,
)
from app.schemas import (
    ActivityEventResponse,
    CommentCreate,
    ConflictResponse,
    SummaryResponse,
    TransitionRequest,
    WorkItemBrief,
    WorkItemCreate,
    WorkItemDetail,
    WorkItemListResponse,
    WorkItemUpdate,
)
from app.services import (
    _get_item_fresh,
    _item_to_dict,
    atomic_claim_item,
    check_idempotency,
    compute_request_hash,
    optimistic_update_item,
    perform_transition,
    require_team_role,
    store_idempotency,
)

router = APIRouter(prefix="/api/items", tags=["items"])


# ═══════════════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/summary", response_model=SummaryResponse)
async def get_summary(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Dashboard summary counts for the current user."""
    now = datetime.now(timezone.utc)

    # Get teams the user belongs to
    user_team_ids = [m.team_id for m in user.memberships]

    if not user_team_ids:
        return SummaryResponse(
            assigned_to_me=0, unassigned_urgent=0,
            awaiting_my_approval=0, overdue=0,
        )

    # Assigned to me
    r1 = await db.execute(
        select(func.count(WorkItem.id)).where(
            WorkItem.assignee_id == user.id,
            WorkItem.status.in_([Status.OPEN, Status.IN_PROGRESS, Status.AWAITING_APPROVAL]),
        )
    )
    assigned_to_me = r1.scalar() or 0

    # Unassigned urgent (in user's teams)
    r2 = await db.execute(
        select(func.count(WorkItem.id)).where(
            WorkItem.team_id.in_(user_team_ids),
            WorkItem.assignee_id.is_(None),
            WorkItem.priority == Priority.URGENT,
            WorkItem.status.in_([Status.OPEN, Status.IN_PROGRESS]),
        )
    )
    unassigned_urgent = r2.scalar() or 0

    # Awaiting my approval (user is LEAD/ADMIN in item's team)
    lead_team_ids = [
        m.team_id for m in user.memberships
        if m.role in (TeamRole.LEAD, TeamRole.ADMIN)
    ]
    if lead_team_ids:
        r3 = await db.execute(
            select(func.count(WorkItem.id)).where(
                WorkItem.team_id.in_(lead_team_ids),
                WorkItem.status == Status.AWAITING_APPROVAL,
            )
        )
        awaiting_my_approval = r3.scalar() or 0
    else:
        awaiting_my_approval = 0

    # Overdue (in user's teams)
    r4 = await db.execute(
        select(func.count(WorkItem.id)).where(
            WorkItem.team_id.in_(user_team_ids),
            WorkItem.due_date < now,
            WorkItem.status.notin_([Status.RESOLVED, Status.CLOSED]),
        )
    )
    overdue = r4.scalar() or 0

    return SummaryResponse(
        assigned_to_me=assigned_to_me,
        unassigned_urgent=unassigned_urgent,
        awaiting_my_approval=awaiting_my_approval,
        overdue=overdue,
    )


# ═══════════════════════════════════════════════════════════════════════════
# List Items (server-side filter, search, pagination)
# ═══════════════════════════════════════════════════════════════════════════

@router.get("", response_model=WorkItemListResponse)
async def list_items(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    team_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    priority: Optional[str] = Query(None),
    item_type: Optional[str] = Query(None),
    assignee_id: Optional[int] = Query(None),
    attention_filter: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
):
    """List work items with server-side filtering and pagination."""
    user_team_ids = [m.team_id for m in user.memberships]
    if not user_team_ids:
        return WorkItemListResponse(items=[], total=0, page=page, limit=limit, pages=0)

    conditions = [WorkItem.team_id.in_(user_team_ids)]

    if team_id is not None:
        if team_id not in user_team_ids:
            raise HTTPException(status_code=403, detail="Not a member of this team")
        conditions.append(WorkItem.team_id == team_id)

    if status_filter:
        conditions.append(WorkItem.status == status_filter)

    if priority:
        conditions.append(WorkItem.priority == priority)

    if item_type:
        conditions.append(WorkItem.item_type == item_type)

    if assignee_id is not None:
        conditions.append(WorkItem.assignee_id == assignee_id)

    now = datetime.now(timezone.utc)
    if attention_filter == "assigned_to_me":
        conditions.append(WorkItem.assignee_id == user.id)
        conditions.append(WorkItem.status.notin_([Status.RESOLVED, Status.CLOSED]))
    elif attention_filter == "unassigned_urgent":
        conditions.append(WorkItem.assignee_id.is_(None))
        conditions.append(WorkItem.priority == Priority.URGENT)
        conditions.append(WorkItem.status.in_([Status.OPEN, Status.IN_PROGRESS]))
    elif attention_filter == "awaiting_my_approval":
        lead_team_ids = [
            m.team_id for m in user.memberships
            if m.role in (TeamRole.LEAD, TeamRole.ADMIN)
        ]
        if lead_team_ids:
            conditions.append(WorkItem.team_id.in_(lead_team_ids))
        conditions.append(WorkItem.status == Status.AWAITING_APPROVAL)
    elif attention_filter == "overdue":
        conditions.append(WorkItem.due_date < now)
        conditions.append(WorkItem.status.notin_([Status.RESOLVED, Status.CLOSED]))

    if q:
        search_term = f"%{q}%"
        conditions.append(
            or_(
                WorkItem.title.ilike(search_term),
                WorkItem.description.ilike(search_term),
            )
        )

    where_clause = and_(*conditions)

    # Count
    count_result = await db.execute(select(func.count(WorkItem.id)).where(where_clause))
    total = count_result.scalar() or 0
    pages = math.ceil(total / limit) if total > 0 else 0

    # Fetch page
    offset = (page - 1) * limit
    query = (
        select(WorkItem)
        .options(
            selectinload(WorkItem.team),
            selectinload(WorkItem.assignee),
            selectinload(WorkItem.created_by),
        )
        .where(where_clause)
        .order_by(WorkItem.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(query)
    items = result.scalars().all()

    brief_items = []
    for it in items:
        brief_items.append(WorkItemBrief(
            id=it.id,
            title=it.title,
            item_type=it.item_type.value if isinstance(it.item_type, ItemType) else it.item_type,
            priority=it.priority.value if isinstance(it.priority, Priority) else it.priority,
            status=it.status.value if isinstance(it.status, Status) else it.status,
            team_id=it.team_id,
            team_name=it.team.name if it.team else None,
            assignee_id=it.assignee_id,
            assignee_name=it.assignee.full_name if it.assignee else None,
            created_by_name=it.created_by.full_name if it.created_by else None,
            due_date=it.due_date,
            version=it.version,
            created_at=it.created_at,
            updated_at=it.updated_at,
        ))

    return WorkItemListResponse(
        items=brief_items,
        total=total,
        page=page,
        limit=limit,
        pages=pages,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Create Item
# ═══════════════════════════════════════════════════════════════════════════

@router.post("", status_code=201)
async def create_item(
    body: WorkItemCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    await require_team_role(db, user, body.team_id, TeamRole.MEMBER)

    request_body = body.model_dump(mode="json")
    endpoint = "POST /api/items"

    # Idempotency check
    if idempotency_key:
        req_hash = compute_request_hash(request_body)
        existing = await check_idempotency(db, idempotency_key, user.id, endpoint, req_hash)
        if existing:
            return JSONResponse(
                status_code=existing.response_status,
                content=existing.response_body,
                headers={"X-Idempotent-Replay": "true"},
            )

    item = WorkItem(
        title=body.title,
        description=body.description,
        item_type=ItemType(body.item_type),
        priority=Priority(body.priority),
        status=Status.OPEN,
        team_id=body.team_id,
        assignee_id=body.assignee_id,
        created_by_id=user.id,
        due_date=body.due_date,
    )
    db.add(item)
    await db.flush()

    # Activity event in the same transaction
    db.add(ActivityEvent(
        work_item_id=item.id,
        actor_id=user.id,
        event_type=EventType.ITEM_CREATED,
        new_value={"title": body.title, "item_type": body.item_type, "priority": body.priority},
    ))

    # Store idempotency
    await db.flush()  # ensure item.id is set
    fresh = await _get_item_fresh(db, item.id)
    response_body = _item_to_dict(fresh)

    if idempotency_key:
        await store_idempotency(
            db, idempotency_key, user.id, endpoint,
            compute_request_hash(request_body), 201, response_body,
        )

    await db.commit()
    return JSONResponse(status_code=201, content=response_body)


# ═══════════════════════════════════════════════════════════════════════════
# Get Item Detail
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/{item_id}")
async def get_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = await _get_item_fresh(db, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Work item not found")
    await require_team_role(db, user, item.team_id, TeamRole.VIEWER)
    return _item_to_dict(item)


# ═══════════════════════════════════════════════════════════════════════════
# Update Item (Optimistic Locking)
# ═══════════════════════════════════════════════════════════════════════════

@router.patch("/{item_id}")
async def update_item(
    item_id: int,
    body: WorkItemUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = await _get_item_fresh(db, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Work item not found")
    await require_team_role(db, user, item.team_id, TeamRole.MEMBER)

    updates = {}
    if body.title is not None:
        updates["title"] = body.title
    if body.description is not None:
        updates["description"] = body.description
    if body.priority is not None:
        updates["priority"] = body.priority
    if body.due_date is not None:
        updates["due_date"] = body.due_date
    if body.assignee_id is not None or "assignee_id" in body.model_fields_set:
        updates["assignee_id"] = body.assignee_id

    if not updates:
        return _item_to_dict(item)

    result = await optimistic_update_item(db, item_id, user, updates, body.version)
    return result


# ═══════════════════════════════════════════════════════════════════════════
# Claim Item
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/{item_id}/claim")
async def claim_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = await _get_item_fresh(db, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Work item not found")
    await require_team_role(db, user, item.team_id, TeamRole.MEMBER)
    result = await atomic_claim_item(db, item_id, user)
    return result


# ═══════════════════════════════════════════════════════════════════════════
# Transition
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/{item_id}/transition")
async def transition_item(
    item_id: int,
    body: TransitionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    item = await _get_item_fresh(db, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Work item not found")

    request_body = body.model_dump(mode="json")
    endpoint = f"POST /api/items/{item_id}/transition"

    if idempotency_key:
        req_hash = compute_request_hash(request_body)
        existing = await check_idempotency(db, idempotency_key, user.id, endpoint, req_hash)
        if existing:
            return JSONResponse(
                status_code=existing.response_status,
                content=existing.response_body,
                headers={"X-Idempotent-Replay": "true"},
            )

    result = await perform_transition(
        db, item_id, user, body.target_status, body.version, body.reason,
    )

    if idempotency_key:
        # Re-open session for idempotency storage
        async with db.begin():
            await store_idempotency(
                db, idempotency_key, user.id, endpoint,
                compute_request_hash(request_body), 200, result,
            )

    return result


# ═══════════════════════════════════════════════════════════════════════════
# Activity & Comments
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/{item_id}/activity", response_model=list[ActivityEventResponse])
async def get_activity(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = await _get_item_fresh(db, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Work item not found")
    await require_team_role(db, user, item.team_id, TeamRole.VIEWER)

    result = await db.execute(
        select(ActivityEvent)
        .options(selectinload(ActivityEvent.actor))
        .where(ActivityEvent.work_item_id == item_id)
        .order_by(ActivityEvent.created_at.desc())
    )
    events = result.scalars().all()

    return [
        ActivityEventResponse(
            id=e.id,
            work_item_id=e.work_item_id,
            actor_id=e.actor_id,
            actor_name=e.actor.full_name if e.actor else None,
            event_type=e.event_type.value if isinstance(e.event_type, EventType) else e.event_type,
            old_value=e.old_value,
            new_value=e.new_value,
            comment_text=e.comment_text,
            created_at=e.created_at,
        )
        for e in events
    ]


@router.post("/{item_id}/comments", status_code=201)
async def add_comment(
    item_id: int,
    body: CommentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    item = await _get_item_fresh(db, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Work item not found")
    await require_team_role(db, user, item.team_id, TeamRole.MEMBER)

    request_body = body.model_dump(mode="json")
    endpoint = f"POST /api/items/{item_id}/comments"

    if idempotency_key:
        req_hash = compute_request_hash(request_body)
        existing = await check_idempotency(db, idempotency_key, user.id, endpoint, req_hash)
        if existing:
            return JSONResponse(
                status_code=existing.response_status,
                content=existing.response_body,
                headers={"X-Idempotent-Replay": "true"},
            )

    event = ActivityEvent(
        work_item_id=item_id,
        actor_id=user.id,
        event_type=EventType.COMMENT_ADDED,
        comment_text=body.text,
    )
    db.add(event)
    await db.flush()

    response_body = {
        "id": event.id,
        "work_item_id": item_id,
        "actor_id": user.id,
        "actor_name": user.full_name,
        "event_type": "COMMENT_ADDED",
        "comment_text": body.text,
        "created_at": event.created_at.isoformat() if event.created_at else datetime.now(timezone.utc).isoformat(),
    }

    if idempotency_key:
        await store_idempotency(
            db, idempotency_key, user.id, endpoint,
            compute_request_hash(request_body), 201, response_body,
        )

    await db.commit()
    return JSONResponse(status_code=201, content=response_body)


# ═══════════════════════════════════════════════════════════════════════════
# Simulate Concurrent Edit (for demo / testing)
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/{item_id}/simulate-concurrent-edit")
async def simulate_concurrent_edit(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Increment the item's version to simulate another user editing it."""
    item = await _get_item_fresh(db, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Work item not found")

    stmt = (
        update(WorkItem)
        .where(WorkItem.id == item_id)
        .values(version=WorkItem.version + 1, updated_at=func.now())
    )
    await db.execute(stmt)

    db.add(ActivityEvent(
        work_item_id=item_id,
        actor_id=user.id,
        event_type=EventType.DETAILS_UPDATED,
        old_value={"version": item.version},
        new_value={"version": item.version + 1, "_simulated": True},
        comment_text="Simulated concurrent edit for conflict testing",
    ))

    await db.commit()
    fresh = await _get_item_fresh(db, item_id)
    return _item_to_dict(fresh)
