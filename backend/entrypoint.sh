#!/bin/bash
set -e

echo "=== Running schema creation ==="
python -c "from app.database import run_sync_create_all; run_sync_create_all()"

echo "=== Running seed script ==="
python -c "from app.seed import run_seed; run_seed()"

echo "=== Starting FastAPI with background outbox worker ==="
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --log-level info
