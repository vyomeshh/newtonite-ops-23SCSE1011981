"""FastAPI application with background outbox worker."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import AsyncSessionLocal
from app.services import process_pending_outbox_jobs


async def _outbox_worker_loop():
    """Background loop: polls and processes outbox jobs every 5 seconds."""
    while True:
        try:
            async with AsyncSessionLocal() as session:
                processed = await process_pending_outbox_jobs(session)
                if processed > 0:
                    print(f"[OUTBOX] Processed {processed} jobs")
        except Exception as e:
            print(f"[OUTBOX] Worker error: {e}")
        await asyncio.sleep(5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the outbox background worker on app startup."""
    task = asyncio.create_task(_outbox_worker_loop())
    print("[APP] Outbox background worker started.")
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    print("[APP] Outbox background worker stopped.")


app = FastAPI(
    title="Newtonite Ops",
    description="Operations Under Pressure – Full-stack engineering challenge",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Idempotent-Replay"],
)

# Register routes
from app.routes.auth import router as auth_router
from app.routes.teams import router as teams_router
from app.routes.items import router as items_router
from app.routes.notifications import router as notifications_router

app.include_router(auth_router)
app.include_router(teams_router)
app.include_router(items_router)
app.include_router(notifications_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "newtonite-ops"}
