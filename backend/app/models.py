"""SQLAlchemy ORM models – full schema for Newtonite Ops."""

from __future__ import annotations

import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.database import Base


# ═══════════════════════════════════════════════════════════════════════════
# Enums
# ═══════════════════════════════════════════════════════════════════════════

class TeamRole(str, enum.Enum):
    VIEWER = "VIEWER"
    MEMBER = "MEMBER"
    LEAD = "LEAD"
    ADMIN = "ADMIN"


ROLE_HIERARCHY = {
    TeamRole.VIEWER: 0,
    TeamRole.MEMBER: 1,
    TeamRole.LEAD: 2,
    TeamRole.ADMIN: 3,
}


class ItemType(str, enum.Enum):
    INCIDENT = "INCIDENT"
    CUSTOMER_ISSUE = "CUSTOMER_ISSUE"
    PAYMENT = "PAYMENT"
    COMPLIANCE = "COMPLIANCE"
    TASK = "TASK"


class Priority(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    URGENT = "URGENT"


class Status(str, enum.Enum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"


class EventType(str, enum.Enum):
    ITEM_CREATED = "ITEM_CREATED"
    ITEM_CLAIMED = "ITEM_CLAIMED"
    ITEM_ASSIGNED = "ITEM_ASSIGNED"
    STATUS_CHANGED = "STATUS_CHANGED"
    PRIORITY_CHANGED = "PRIORITY_CHANGED"
    DETAILS_UPDATED = "DETAILS_UPDATED"
    COMMENT_ADDED = "COMMENT_ADDED"
    APPROVAL_GRANTED = "APPROVAL_GRANTED"
    APPROVAL_REJECTED = "APPROVAL_REJECTED"


class OutboxEventType(str, enum.Enum):
    NOTIFY_ASSIGNEE = "NOTIFY_ASSIGNEE"
    NOTIFY_LEAD_APPROVAL = "NOTIFY_LEAD_APPROVAL"
    AUDIT_ENRICHMENT = "AUDIT_ENRICHMENT"


class OutboxStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


# ═══════════════════════════════════════════════════════════════════════════
# Tables
# ═══════════════════════════════════════════════════════════════════════════

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    memberships = relationship("Membership", back_populates="user", lazy="selectin")


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), unique=True, nullable=False)
    slug = Column(String(255), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    memberships = relationship("Membership", back_populates="team", lazy="selectin")


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("user_id", "team_id", name="uq_membership_user_team"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    role = Column(Enum(TeamRole, name="team_role_enum", create_constraint=True), nullable=False, default=TeamRole.MEMBER)

    user = relationship("User", back_populates="memberships")
    team = relationship("Team", back_populates="memberships")


class WorkItem(Base):
    __tablename__ = "work_items"
    __table_args__ = (
        Index("ix_work_items_team_status_priority_created", "team_id", "status", "priority", "created_at"),
        Index("ix_work_items_assignee_status", "assignee_id", "status"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    item_type = Column(Enum(ItemType, name="item_type_enum", create_constraint=True), nullable=False)
    priority = Column(Enum(Priority, name="priority_enum", create_constraint=True), nullable=False, default=Priority.MEDIUM)
    status = Column(Enum(Status, name="status_enum", create_constraint=True), nullable=False, default=Status.OPEN)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    assignee_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    approved_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    due_date = Column(DateTime(timezone=True), nullable=True)
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    team = relationship("Team", foreign_keys=[team_id], lazy="selectin")
    assignee = relationship("User", foreign_keys=[assignee_id], lazy="selectin")
    created_by = relationship("User", foreign_keys=[created_by_id], lazy="selectin")
    approved_by = relationship("User", foreign_keys=[approved_by_id], lazy="selectin")


class ActivityEvent(Base):
    __tablename__ = "activity_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    work_item_id = Column(Integer, ForeignKey("work_items.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(Enum(EventType, name="event_type_enum", create_constraint=True), nullable=False)
    old_value = Column(JSONB, nullable=True)
    new_value = Column(JSONB, nullable=True)
    comment_text = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    work_item = relationship("WorkItem", foreign_keys=[work_item_id])
    actor = relationship("User", foreign_keys=[actor_id], lazy="selectin")


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"
    __table_args__ = (
        UniqueConstraint("key", "user_id", "endpoint", name="uq_idempotency_key_user_endpoint"),
    )

    key = Column(String(255), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    endpoint = Column(String(500), nullable=False)
    request_hash = Column(String(64), nullable=False)
    response_status = Column(Integer, nullable=False)
    response_body = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)


class OutboxJob(Base):
    __tablename__ = "outbox_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_type = Column(Enum(OutboxEventType, name="outbox_event_type_enum", create_constraint=True), nullable=False)
    dedupe_key = Column(String(500), unique=True, nullable=False)
    payload = Column(JSONB, nullable=False)
    status = Column(Enum(OutboxStatus, name="outbox_status_enum", create_constraint=True), nullable=False, default=OutboxStatus.PENDING)
    attempts = Column(Integer, nullable=False, default=0)
    max_attempts = Column(Integer, nullable=False, default=3)
    next_run_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    work_item_id = Column(Integer, ForeignKey("work_items.id", ondelete="CASCADE"), nullable=False)
    dedupe_key = Column(String(500), unique=True, nullable=False)
    title = Column(String(500), nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", foreign_keys=[user_id])
    work_item = relationship("WorkItem", foreign_keys=[work_item_id])
