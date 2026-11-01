"""Moment detection for the default (transcript-free) pipeline.

Delegates to ``services.moments`` which decodes the audio stream, builds a
robust per-source activity curve, picks peaks + sustained segments, snaps
boundaries to pauses / scene cuts and scores candidates. ``is_hot`` is assigned
as the top 30 % of the job's clips, not an absolute threshold.
"""

from __future__ import annotations

import json
from pathlib import Path

from ..core.config import MAX_CLIPS
from ..templates import NICHE_BY_ID
from .llm import get_llm_settings, heuristic_clips
from .moments import detect_moments


def detect_clips_from_audio(
    source: Path, duration: float, niche: str | None = None
) -> tuple[list[dict], str]:
    """Return ``(clips, source_label)`` without touching a transcript."""
    settings = get_llm_settings()
    max_clips = max(1, int(settings.get("max_clips") or MAX_CLIPS))
    badge = (NICHE_BY_ID.get((niche or "generic").lower()) or NICHE_BY_ID["generic"])["badges"][0]

    result = detect_moments(source, duration, niche, max_clips=max_clips, visual=True)
    clips = result.get("clips") or []
    if not clips:
        return heuristic_clips({}, duration, max_clips, niche), "audio:fallback"

    # normalize badge + persist signals
    for clip in clips:
        clip["badge"] = clip.get("badge") or badge
        signals = clip.pop("signals", None)
        clip["signals_json"] = json.dumps(signals, ensure_ascii=False) if signals else None
        clip.setdefault("reason", "Audio energy peak")
        clip.setdefault("hook", "")
        clip.setdefault("title", clip.get("title") or "Clip")
        clip.setdefault("hashtags", ["#shorts", "#clip"])

    visual_tag = "visual" if result.get("visual") else "audio"
    return clips, f"moments:{visual_tag}"