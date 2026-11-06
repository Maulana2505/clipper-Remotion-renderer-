from __future__ import annotations

from typing import Optional

TRANSCRIBE_MODELS: dict[str, dict[str, str]] = {
    "base": {"label": "Base", "hint": "Tercepat, kualitas dasar"},
    "small": {"label": "Small", "hint": "Seimbang"},
    "large-v3-turbo": {"label": "Turbo", "hint": "Paling akurat, butuh GPU"},
}


def normalize_model(name: str | None) -> str | None:
    if name in TRANSCRIBE_MODELS:
        return str(name)
    return None


def is_valid_model(name: str | None) -> bool:
    return name in TRANSCRIBE_MODELS


class WhisperModelNotSelected(Exception):
    """Raised when transcription is requested without a chosen Whisper model."""