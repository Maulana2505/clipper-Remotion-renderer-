from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

from ..db import get_conn, row_to_dict
from ..services.activity import snapshot as activity_snapshot

router = APIRouter(prefix="/api", tags=["activity"])


@router.get("/activity")
def get_activity():
    items: list[dict] = []

    # Active jobs
    with get_conn() as conn:
        job_rows = conn.execute(
            "SELECT id, title, status, stage, progress FROM jobs WHERE status IN ('queued','processing') ORDER BY updated_at DESC"
        ).fetchall()
        render_rows = conn.execute(
            """
            SELECT r.id, r.clip_id, r.status, r.progress, j.id AS job_id
            FROM renders r
            LEFT JOIN clips c ON c.id = r.clip_id
            LEFT JOIN jobs j ON j.id = c.job_id
            WHERE r.status IN ('queued','rendering')
            ORDER BY r.updated_at DESC
            """
        ).fetchall()

    job_map = {r["id"]: dict(r) for r in (row_to_dict(x) for x in job_rows)}
    registry = activity_snapshot()

    # Merge registry into jobs when they refer to the same job.
    registry_by_job: dict[str, dict] = {}
    for task in registry:
        if task["kind"] in ("transcript", "face", "redetect"):
            registry_by_job.setdefault(task["ref_id"], task)

    for row in job_rows:
        data = dict(row)
        job_id = data["id"]
        task = registry_by_job.get(job_id)
        stage = data["stage"] or "queued"
        progress = int(data["progress"] or 0)
        label = "Job"
        if stage == "transcribe" and task is not None:
            label = task.get("label") or "Transkripsi"
            progress = task.get("progress", progress)
        elif stage == "detect":
            label = "Deteksi momen"
        elif stage == "download":
            label = "Mengunduh"
        elif stage == "clips":
            label = "Menyimpan klip"
        elif stage == "audio":
            label = "Analisis audio"
        elif stage == "trim":
            label = "Memotong"
        elif stage == "probe":
            label = "Memeriksa"
        elif stage == "queued":
            label = "Menunggu"
        items.append(
            {
                "id": f"job:{job_id}",
                "kind": "job",
                "ref_id": job_id,
                "label": label,
                "stage": stage,
                "progress": progress,
                "status": data["status"],
                "href": f"/studio/{job_id}",
            }
        )

    # Registry tasks that are not tied to an active job stage (e.g. face track).
    for task in registry:
        if task["kind"] == "face":
            items.append(
                {
                    "id": task["id"],
                    "kind": "face",
                    "ref_id": task["ref_id"],
                    "label": task.get("label") or "Face track",
                    "stage": "face",
                    "progress": task.get("progress", 0),
                    "status": task.get("status", "running"),
                    "href": None,
                }
            )
        elif task["kind"] == "redetect":
            items.append(
                {
                    "id": task["id"],
                    "kind": "redetect",
                    "ref_id": task["ref_id"],
                    "label": task.get("label") or "Re-detect",
                    "stage": "redetect",
                    "progress": task.get("progress", 0),
                    "status": task.get("status", "running"),
                    "href": f"/studio/{task['ref_id']}",
                }
            )

    for row in render_rows:
        data = dict(row)
        items.append(
            {
                "id": f"render:{data['id']}",
                "kind": "render",
                "ref_id": data["id"],
                "label": "Render clip",
                "stage": "rendering",
                "progress": int(data["progress"] or 0),
                "status": data["status"],
                "href": f"/studio/{data['job_id']}" if data.get("job_id") else None,
            }
        )

    return {
        "busy": len(items) > 0,
        "items": items,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
