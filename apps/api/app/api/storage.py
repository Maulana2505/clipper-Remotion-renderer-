from __future__ import annotations

import shutil
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException

from ..core.config import DATA_DIR, JOBS_DIR, MIN_FREE_DISK_BYTES
from ..db import get_conn
from ..services.media import human_size

router = APIRouter(prefix="/api/storage", tags=["storage"])


def _dir_size(path: Path) -> int:
    if not path.exists():
        return 0
    total = 0
    for item in path.rglob("*"):
        if item.is_file():
            try:
                total += item.stat().st_size
            except OSError:
                pass
    return total


@router.get("")
def storage_overview():
    usage = shutil.disk_usage(DATA_DIR)
    data_size = _dir_size(DATA_DIR)
    with get_conn() as conn:
        jobs = conn.execute("SELECT id, title, status, created_at FROM jobs ORDER BY created_at DESC").fetchall()
        render_rows = conn.execute("SELECT id, clip_id, canvas, output_path, created_at FROM renders").fetchall()

    job_items = []
    oldest_days = 0
    now = datetime.now(timezone.utc)
    for row in jobs:
        size = _dir_size(JOBS_DIR / row["id"])
        job_items.append(
            {
                "id": row["id"],
                "title": row["title"],
                "status": row["status"],
                "created_at": row["created_at"],
                "size": size,
                "size_label": human_size(size),
            }
        )
        try:
            created = datetime.fromisoformat(row["created_at"])
            oldest_days = max(oldest_days, (now - created).days)
        except ValueError:
            pass

    render_items = []
    for row in render_rows:
        size = 0
        if row["output_path"] and Path(row["output_path"]).exists():
            size = Path(row["output_path"]).stat().st_size
        render_items.append(
            {
                "id": row["id"],
                "clip_id": row["clip_id"],
                "canvas": row["canvas"],
                "size": size,
                "size_label": human_size(size),
                "created_at": row["created_at"],
            }
        )

    warning = usage.free < MIN_FREE_DISK_BYTES
    reminder = oldest_days >= 14 or data_size > usage.total * 0.5
    return {
        "disk_total": usage.total,
        "disk_total_label": human_size(usage.total),
        "disk_free": usage.free,
        "disk_free_label": human_size(usage.free),
        "data_size": data_size,
        "data_size_label": human_size(data_size),
        "warning": warning,
        "reminder": reminder,
        "oldest_days": oldest_days,
        "jobs": job_items,
        "renders": render_items,
    }


@router.delete("/jobs/{job_id}")
def delete_job_storage(job_id: str):
    job_dir = JOBS_DIR / job_id
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Job not found.")
        conn.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        conn.commit()
    shutil.rmtree(job_dir, ignore_errors=True)
    return {"ok": True}


@router.delete("/renders/{render_id}")
def delete_render_storage(render_id: str):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM renders WHERE id = ?", (render_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Render not found.")
        if row["output_path"]:
            Path(row["output_path"]).unlink(missing_ok=True)
        conn.execute("DELETE FROM renders WHERE id = ?", (render_id,))
        conn.commit()
    return {"ok": True}
