from __future__ import annotations

TRANSCRIBE_MODELS: dict[str, dict[str, str]] = {
    "base": {"label": "Base", "hint": "Tercepat, kualitas dasar"},
    "small": {"label": "Small", "hint": "Seimbang (default lokal)"},
    "large-v3-turbo": {"label": "Turbo", "hint": "Paling akurat, butuh GPU"},
}

DEFAULT_MODEL = "small"


def normalize_model(name: str | None) -> str:
    if name in TRANSCRIBE_MODELS:
        return str(name)
    return DEFAULT_MODEL


def is_valid_model(name: str | None) -> bool:
    return name in TRANSCRIBE_MODELS
