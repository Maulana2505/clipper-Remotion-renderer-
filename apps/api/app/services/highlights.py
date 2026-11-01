"""Transcript-free clip detection.

The default pipeline no longer transcribes the source, so clip detection works
from the audio loudness curve instead: FFmpeg reports the RMS level every
500 ms, the curve is bucketed per second and the busiest non-overlapping
windows become the candidate clips. No model, no Whisper, a few seconds for a
one hour VOD.

Transcription (and the LLM clip picker) stays available on demand from the
Studio, but it is no longer part of building a job.
"""

from __future__ import annotations

from pathlib import Path

from ..core.config import FFMPEG
from ..templates import NICHE_BY_ID
from .llm import get_llm_settings, heuristic_clips
from .media import run

# RMS levels are mapped from this dB window onto 0..1.
_MIN_DB = -50.0
_MAX_DB = -10.0
_CELL_SECONDS = 1.0


def _weight(db: float) -> float:
    return max(0.0, min(1.0, (db - _MIN_DB) / (_MAX_DB - _MIN_DB)))


def _loudness_cells(source: Path, duration: float) -> list[float]:
    """One loudness weight per second, or an empty list when audio is missing."""
    cmd = [
        FFMPEG,
        "-hide_banner",
        "-nostats",
        "-i",
        str(source),
        "-vn",
        "-af",
        "astats=metadata=1:reset=1:length=0.5,ametadata=print:file=-",
        "-f",
        "null",
        "-",
    ]
    result = run(cmd, timeout=60 * 15)
    if result.returncode != 0:
        return []

    cells = [0.0] * max(1, int(duration) + 1)
    current_t: float | None = None
    for line in (result.stdout or "").splitlines():
        if "pts_time:" in line:
            try:
                current_t = float(line.rsplit("pts_time:", 1)[1].strip())
            except ValueError:
                current_t = None
            continue
        if "RMS_level=" not in line or current_t is None:
            continue
        raw = line.rsplit("RMS_level=", 1)[1].strip()
        try:
            db = float(raw)
        except ValueError:
            db = -60.0
        if db != db:  # NaN
            db = -60.0
        index = max(0, min(len(cells) - 1, int(current_t / _CELL_SECONDS)))
        cells[index] = max(cells[index], _weight(db))
    return cells


def _pick_windows(cells: list[float], duration: float, length: float, max_clips: int) -> list[dict]:
    """Greedily pick the busiest non-overlapping windows."""
    if not cells or duration <= 0:
        return []

    prefix = [0.0]
    for value in cells:
        prefix.append(prefix[-1] + value)

    def mean_at(start: float, end: float) -> tuple[float, float]:
        a = max(0, int(start / _CELL_SECONDS))
        b = min(len(cells) - 1, int(end / _CELL_SECONDS) - 1)
        if b < a:
            return 0.0, 0.0
        span = b - a + 1
        mean = (prefix[b + 1] - prefix[a]) / span
        peak = max(cells[a : b + 1])
        return mean, peak

    step = 2.0 if duration > 300 else 1.0
    candidates: list[tuple[float, float]] = []
    cursor = 0.0
    while cursor + length <= duration + 0.01:
        mean, peak = mean_at(cursor, cursor + length)
        # Loud peaks matter more than a steady wall of noise, so bias the score
        # towards the loudest part of the window.
        candidates.append((mean + 0.35 * (peak - mean), cursor))
        cursor += step
    if not candidates:
        mean, peak = mean_at(0.0, duration)
        candidates = [(mean + 0.35 * (peak - mean), 0.0)]

    candidates.sort(reverse=True)
    chosen: list[float] = []
    for _score, start in candidates:
        if len(chosen) >= max_clips:
            break
        end = start + length
        if any(start < other + length - 0.05 and end > other + 0.05 for other in chosen):
            continue
        chosen.append(start)

    if not chosen:
        chosen = [0.0]
    chosen.sort()
    return [{"start": start, "end": min(duration, start + length)} for start in chosen]


def detect_clips_from_audio(
    source: Path, duration: float, niche: str | None = None
) -> tuple[list[dict], str]:
    """Return ``(clips, source_label)`` without touching a transcript."""
    settings = get_llm_settings()
    max_clips = max(1, int(settings.get("max_clips") or 20))
    badge = (NICHE_BY_ID.get((niche or "generic").lower()) or NICHE_BY_ID["generic"])["badges"][0]

    cells = _loudness_cells(source, duration)
    if not cells or sum(cells) <= 0.0:
        return heuristic_clips({}, duration, max_clips, niche), "audio:fallback"

    # Aim for roughly one clip per 30 s, never shorter than 12 s or longer than
    # 45 s, so short sources still produce one usable clip.
    planned = max(1, min(max_clips, int(duration // 30) or 1))
    length = min(45.0, max(12.0, duration / planned))
    windows = _pick_windows(cells, duration, length, max_clips)
    if not windows:
        return heuristic_clips({}, duration, max_clips, niche), "audio:fallback"

    scored: list[tuple[float, dict]] = []
    for index, window in enumerate(windows, start=1):
        start = round(max(0.0, window["start"]), 3)
        end = round(window["end"], 3)
        if end - start < 1.5:
            continue
        samples = [
            cells[i]
            for i in range(
                max(0, int(start)),
                min(len(cells), max(int(end), int(start) + 1)),
            )
        ]
        score = sum(samples) / max(1, len(samples))
        scored.append(
            (
                score,
                {
                    "start": start,
                    "end": end,
                    "score": round(min(0.99, 0.4 + score * 0.6), 3),
                    "is_hot": score >= 0.55,
                    "hook": "",
                    "reason": "Audio energy peak",
                    "title": f"Clip {index}",
                    "badge": badge,
                    "hashtags": ["#shorts", "#clip"],
                },
            )
        )

    if not scored:
        return heuristic_clips({}, duration, max_clips, niche), "audio:fallback"
    scored.sort(key=lambda item: item[1]["start"])
    return [clip for _score, clip in scored], "audio:energy"
