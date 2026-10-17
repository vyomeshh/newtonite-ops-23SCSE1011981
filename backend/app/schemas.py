"""Pydantic v2 schemas for request/response validation."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, EmailStr


# ═══════════════════════════════════════════════════════════════════════════
# Auth
# ═══════════════════════════════════════════════════════════════════════════

class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    is_active: bool
    created_at: datetime
    memberships: list[MembershipResponse] = []

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════════════════════
# Teams & Memberships
# ═══════════════════════════════════════════════════════════════════════════

class TeamResponse(BaseModel):
    id: int
    name: str
    slug: str
    description: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class MembershipResponse(BaseModel):
    id: int
    team_id: int
    role: str
    team: Optional[TeamResponse] = None

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════════════════════
# Work Items
# ═══════════════════════════════════════════════════════════════════════════

class WorkItemCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: Optional[str] = None
    item_type: str
    priority: str = "MEDIUM"
    team_id: int
    assignee_id: Optional[int] = None
    due_date: Optional[datetime] = None


class WorkItemUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    description: Optional[str] = None
    priority: Optional[str] = None
    assignee_id: Optional[int] = None
    due_date: Optional[datetime] = None
    version: int


class WorkItemBrief(BaseModel):
    id: int
    title: str
    item_type: str
    priority: str
    status: str
    team_id: int
    team_name: Optional[str] = None
    assignee_id: Optional[int] = None
    assignee_name: Optional[str] = None
    created_by_name: Optional[str] = None
    due_date: Optional[datetime] = None
    version: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WorkItemDetail(WorkItemBrief):
    description: Optional[str] = None
    created_by_id: int
    approved_by_id: Optional[int] = None
    approved_by_name: Optional[str] = None

    model_config = {"from_attributes": True}


class WorkItemListResponse(BaseModel):
    items: list[WorkItemBrief]
    total: int
    page: int
    limit: int
    pages: int


class SummaryResponse(BaseModel):
    assigned_to_me: int
    unassigned_urgent: int
    awaiting_my_approval: int
    overdue: int


# ═══════════════════════════════════════════════════════════════════════════
# Transitions
# ═══════════════════════════════════════════════════════════════════════════

class TransitionRequest(BaseModel):
    target_status: str
    version: int
    reason: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════════
# Activity & Comments
# ═══════════════════════════════════════════════════════════════════════════

class ActivityEventResponse(BaseModel):
    id: int
    work_item_id: int
    actor_id: int
    actor_name: Optional[str] = None
    event_type: str
    old_value: Optional[Any] = None
    new_value: Optional[Any] = None
    comment_text: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CommentCreate(BaseModel):
    text: str = Field(min_length=1, max_length=5000)


# ═══════════════════════════════════════════════════════════════════════════
# Notifications
# ═══════════════════════════════════════════════════════════════════════════

class NotificationResponse(BaseModel):
    id: int
    user_id: int
    work_item_id: int
    title: str
    message: str
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════════════════════
# Outbox Stats
# ═══════════════════════════════════════════════════════════════════════════

class OutboxStatsResponse(BaseModel):
    pending: int
    processing: int
    completed: int
    failed: int


# ═══════════════════════════════════════════════════════════════════════════
# Conflict responses
# ═══════════════════════════════════════════════════════════════════════════

class ConflictResponse(BaseModel):
    code: str
    message: str
    current_item: Optional[Any] = None


# Rebuild forward refs
UserResponse.model_rebuild()
