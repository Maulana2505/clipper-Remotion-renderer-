from __future__ import annotations

from pathlib import Path

from ..core.config import WHISPER_MODEL
from .media import parse_vtt

_MODEL = None


def _load_model():
    global _MODEL
    if _MODEL is not None:
        return _MODEL
    from faster_whisper import WhisperModel  # type: ignore

    _MODEL = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    return _MODEL


def _segment_words(start: float, end: float, text: str) -> list[dict]:
    words = text.split()
    if not words:
        return []
    step = (end - start) / len(words)
    return [
        {"word": word, "start": start + idx * step, "end": start + (idx + 1) * step}
        for idx, word in enumerate(words)
    ]


def transcribe_audio(audio_path: Path, duration: float) -> dict | None:
    """Transcribe with faster-whisper. Returns None when the optional package is absent."""
    try:
        model = _load_model()
    except Exception:
        return None

    try:
        segments_iter, info = model.transcribe(
            str(audio_path),
            word_timestamps=True,
            vad_filter=True,
            beam_size=5,
        )
        segments: list[dict] = []
        for segment in segments_iter:
            text = (segment.text or "").strip()
            if not text:
                continue
            words = []
            if getattr(segment, "words", None):
                for word in segment.words:
                    token = (word.word or "").strip()
                    if token:
                        words.append(
                            {
                                "word": token,
                                "start": float(word.start),
                                "end": float(word.end),
                            }
                        )
            if not words:
                words = _segment_words(float(segment.start), float(segment.end), text)
            segments.append(
                {
                    "start": float(segment.start),
                    "end": float(segment.end),
                    "text": text,
                    "words": words,
                }
            )
        return {
            "language": getattr(info, "language", "unknown"),
            "duration": duration,
            "segments": segments,
            "source": "whisper",
        }
    except Exception as exc:  # noqa: BLE001
        print(f"[transcribe] Whisper failed: {exc}")
        return None


def transcribe_from_vtt(vtt_path: Path, duration: float) -> dict | None:
    try:
        segments = parse_vtt(vtt_path)
    except Exception as exc:  # noqa: BLE001
        print(f"[transcribe] VTT parse failed: {exc}")
        return None
    if not segments:
        return None
    return {
        "language": "unknown",
        "duration": duration,
        "segments": segments,
        "source": "subtitles",
    }


def fallback_transcript(duration: float) -> dict:
    """Last-resort transcript. Keeps the pipeline usable without Whisper/subtitles."""
    duration = max(1.0, float(duration or 1.0))
    windows: list[dict] = []
    cursor = 0.0
    index = 1
    while cursor < duration:
        end = min(duration, cursor + 30.0)
        text = f"Audio segment {index}"
        windows.append(
            {
                "start": cursor,
                "end": end,
                "text": text,
                "words": _segment_words(cursor, end, text),
            }
        )
        cursor = end
        index += 1
    return {
        "language": "unknown",
        "duration": duration,
        "segments": windows,
        "source": "fallback",
    }
