"""SQLAlchemy engine, session factories, and Base for models."""

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy import create_engine
from app.config import settings


# ---------------------------------------------------------------------------
# Async engine & session (used by FastAPI at runtime)
# ---------------------------------------------------------------------------
async_engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ---------------------------------------------------------------------------
# Sync engine & session (used by seed script and schema creation)
# ---------------------------------------------------------------------------
sync_engine = create_engine(
    settings.DATABASE_URL_SYNC,
    echo=False,
    pool_size=5,
    pool_pre_ping=True,
)

SyncSessionLocal = sessionmaker(bind=sync_engine)


# ---------------------------------------------------------------------------
# Declarative Base
# ---------------------------------------------------------------------------
class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Schema creation helper (sync, called from entrypoint)
# ---------------------------------------------------------------------------
def run_sync_create_all():
    """Create all tables using the sync engine. Safe to call multiple times."""
    from app import models  # noqa: F401 – registers models with Base.metadata
    Base.metadata.create_all(bind=sync_engine)
    print("[DB] All tables created / verified.")


# ---------------------------------------------------------------------------
# Dependency for FastAPI routes
# ---------------------------------------------------------------------------
async def get_db() -> AsyncSession:  # type: ignore[misc]
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
