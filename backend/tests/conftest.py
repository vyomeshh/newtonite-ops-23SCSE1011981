"""
Shared test fixtures: async client, database setup, and helper functions.

Requires a running PostgreSQL instance (the docker-compose `db` service).
Tests use the same DATABASE_URL as the app.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_access_token, hash_password
from app.database import AsyncSessionLocal, Base, async_engine
from app.main import app
from app.models import (
    ItemType,
    Membership,
    Priority,
    Status,
    Team,
    TeamRole,
    User,
    WorkItem,
)


@pytest_asyncio.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_database():
    """Create all tables once per test session."""
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture()
async def db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


@pytest_asyncio.fixture()
async def client() -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


@pytest_asyncio.fixture()
async def seed_data(db: AsyncSession):
    """
    Create a minimal reproducible dataset for testing:
    - 2 teams: "Alpha" and "Beta"
    - 5 users with various roles
    - A few work items in specific states

    Returns a dict with references to the created entities and JWT tokens.
    """
    # Teams
    alpha = Team(name=_unique("Alpha"), slug=_unique("alpha"), description="Alpha team")
    beta = Team(name=_unique("Beta"), slug=_unique("beta"), description="Beta team")
    db.add_all([alpha, beta])
    await db.flush()

    hashed = hash_password("test123")

    # Users
    admin_user = User(email=_unique("admin") + "@test.io", full_name="Test Admin", password_hash=hashed)
    lead_user = User(email=_unique("lead") + "@test.io", full_name="Test Lead", password_hash=hashed)
    member_user = User(email=_unique("member") + "@test.io", full_name="Test Member", password_hash=hashed)
    viewer_user = User(email=_unique("viewer") + "@test.io", full_name="Test Viewer", password_hash=hashed)
    external_user = User(email=_unique("external") + "@test.io", full_name="Test External", password_hash=hashed)

    db.add_all([admin_user, lead_user, member_user, viewer_user, external_user])
    await db.flush()

    # Memberships: admin & lead & member & viewer in Alpha; external only in Beta
    db.add_all([
        Membership(user_id=admin_user.id, team_id=alpha.id, role=TeamRole.ADMIN),
        Membership(user_id=lead_user.id, team_id=alpha.id, role=TeamRole.LEAD),
        Membership(user_id=member_user.id, team_id=alpha.id, role=TeamRole.MEMBER),
        Membership(user_id=viewer_user.id, team_id=alpha.id, role=TeamRole.VIEWER),
        Membership(user_id=external_user.id, team_id=beta.id, role=TeamRole.MEMBER),
    ])
    await db.flush()

    # Work items
    open_item = WorkItem(
        title="Open item for testing",
        item_type=ItemType.TASK,
        priority=Priority.MEDIUM,
        status=Status.OPEN,
        team_id=alpha.id,
        created_by_id=member_user.id,
    )
    in_progress_item = WorkItem(
        title="In-progress item",
        item_type=ItemType.TASK,
        priority=Priority.HIGH,
        status=Status.IN_PROGRESS,
        team_id=alpha.id,
        assignee_id=member_user.id,
        created_by_id=member_user.id,
    )
    compliance_in_progress = WorkItem(
        title="Compliance item needing approval",
        item_type=ItemType.COMPLIANCE,
        priority=Priority.HIGH,
        status=Status.IN_PROGRESS,
        team_id=alpha.id,
        assignee_id=member_user.id,
        created_by_id=member_user.id,
    )
    urgent_in_progress = WorkItem(
        title="Urgent item needing approval",
        item_type=ItemType.TASK,
        priority=Priority.URGENT,
        status=Status.IN_PROGRESS,
        team_id=alpha.id,
        assignee_id=member_user.id,
        created_by_id=member_user.id,
    )
    awaiting_approval = WorkItem(
        title="Awaiting approval item",
        item_type=ItemType.COMPLIANCE,
        priority=Priority.HIGH,
        status=Status.AWAITING_APPROVAL,
        team_id=alpha.id,
        assignee_id=member_user.id,
        created_by_id=member_user.id,
    )
    beta_item = WorkItem(
        title="Beta team item",
        item_type=ItemType.TASK,
        priority=Priority.LOW,
        status=Status.OPEN,
        team_id=beta.id,
        created_by_id=external_user.id,
    )

    db.add_all([open_item, in_progress_item, compliance_in_progress, urgent_in_progress, awaiting_approval, beta_item])
    await db.commit()

    # Generate tokens
    def _token(user_id: int) -> str:
        return create_access_token({"sub": str(user_id)})

    return {
        "alpha": alpha,
        "beta": beta,
        "admin": admin_user,
        "lead": lead_user,
        "member": member_user,
        "viewer": viewer_user,
        "external": external_user,
        "open_item": open_item,
        "in_progress_item": in_progress_item,
        "compliance_in_progress": compliance_in_progress,
        "urgent_in_progress": urgent_in_progress,
        "awaiting_approval": awaiting_approval,
        "beta_item": beta_item,
        "admin_token": _token(admin_user.id),
        "lead_token": _token(lead_user.id),
        "member_token": _token(member_user.id),
        "viewer_token": _token(viewer_user.id),
        "external_token": _token(external_user.id),
    }


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
