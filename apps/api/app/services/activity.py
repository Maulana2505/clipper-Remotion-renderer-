from __future__ import annotations

import threading
import time
from typing import Any

_LOCK = threading.Lock()
_TASKS: dict[str, dict[str, Any]] = {}
_TTL_SECONDS = 30 * 60


def _now() -> float:
    return time.time()


def start(task_id: str, kind: str, ref_id: str, label: str, total: int | None = None) -> None:
    with _LOCK:
        _TASKS[task_id] = {
            "id": task_id,
            "kind": kind,
            "ref_id": ref_id,
            "label": label,
            "stage": kind,
            "progress": 0,
            "done": 0,
            "total": total,
            "status": "running",
            "started_at": _now(),
            "updated_at": _now(),
        }


def update(
    task_id: str,
    *,
    done: int | None = None,
    total: int | None = None,
    progress: int | None = None,
    stage: str | None = None,
    label: str | None = None,
    status: str | None = None,
) -> None:
    with _LOCK:
        task = _TASKS.get(task_id)
        if task is None:
            return
        if total is not None:
            task["total"] = total
        if done is not None:
            task["done"] = done
        if task["total"]:
            task["progress"] = max(0, min(100, int(100 * task["done"] / task["total"])))
        if progress is not None:
            task["progress"] = max(0, min(100, int(progress)))
        if stage is not None:
            task["stage"] = stage
        if label is not None:
            task["label"] = label
        if status is not None:
            task["status"] = status
        task["updated_at"] = _now()


def finish(task_id: str, status: str = "done") -> None:
    with _LOCK:
        task = _TASKS.get(task_id)
        if task is None:
            return
        task["status"] = status
        task["progress"] = 100 if status == "done" else task["progress"]
        task["updated_at"] = _now()
        _TASKS.pop(task_id, None)


def get(task_id: str) -> dict | None:
    with _LOCK:
        task = _TASKS.get(task_id)
        return dict(task) if task else None


def snapshot() -> list[dict]:
    with _LOCK:
        now = _now()
        stale = [tid for tid, t in _TASKS.items() if now - t["updated_at"] > _TTL_SECONDS]
        for tid in stale:
            _TASKS.pop(tid, None)
        return [dict(t) for t in _TASKS.values()]
