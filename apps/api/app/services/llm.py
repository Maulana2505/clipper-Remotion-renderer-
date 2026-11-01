from __future__ import annotations

import json
import re
from typing import Any

import httpx

from ..core.config import MAX_CLIPS
from ..core.security import decrypt_secret
from ..db import get_conn

SYSTEM_PROMPT = """You are a short-form video editor. Find the most engaging moments in a transcript.
Return ONLY valid JSON with this shape:
{
  "clips": [
    {
      "start": 12.3,
      "end": 45.6,
      "score": 0.92,
      "is_hot": true,
      "hook": "short opening line",
      "reason": "why this moment works",
      "title": "short viral title",
      "badge": "GOL",
      "hashtags": ["#tag1", "#tag2"]
    }
  ]
}
Rules:
- Clips must be 20-60 seconds long.
- Do not overlap clips.
- Return at most {max_clips} clips.
- Prefer strong hooks, conflict, punchlines, useful insights, emotional peaks.
- Titles must be short and platform-friendly.
- "badge" is a 1-3 word UPPERCASE moment label shown on screen (for example CLUTCH, GOL, HOT TAKE, TIP). Use the same language as the transcript.
- 3-6 hashtags per clip.
- Keep the language of the transcript for titles, hooks and badges.
"""

# Niche hints keep the clip picker focused on what actually performs for that
# channel instead of generic "engaging moments".
_NICHE_KEYWORDS: dict[str, list[str]] = {
    "gaming": ["clutch", "insane", "gg", "wtf", "no way", "let's go", "gacor", "buset", "anjir", "menang", "kalah"],
    "football": ["goal", "gol", "save", "penalti", "kartu", "offside", "var", "menang", "kalah", "gol!"],
    "podcast": ["hot take", "setuju", "gak setuju", "plot twist", "serius", "jujur", "rahasia", "fakta"],
    "education": ["tip", "cara", "langkah", "fakta", "mitos", "penting", "perhatikan", "ingat"],
    "generic": ["wow", "gila", "serius", "penting", "jangan"],
}
NICHE_FOCUS: dict[str, str] = {
    "gaming": "Focus on clutch plays, jumpscares, rage moments, funny fails and reaction peaks. Badges look like CLUTCH, JUMPSCARE, INSANE, GG.",
    "football": "Focus on goals, saves, fouls, referee controversy, crowd reactions and commentary peaks. Badges look like GOL, PENALTI, KARTU MERAH, SAVE.",
    "podcast": "Focus on hot takes, disagreements, funny stories and surprising admissions. Badges look like HOT TAKE, NGELAG, PLOT TWIST.",
    "education": "Focus on clear explanations, actionable tips, myth corrections and strong examples. Badges look like TIP, FAKTA, STEP 1.",
    "generic": "Focus on strong hooks, conflict, punchlines and emotional peaks.",
}


def build_system_prompt(niche: str | None = None, max_clips: int = 20) -> str:
    focus = NICHE_FOCUS.get((niche or "generic").lower(), NICHE_FOCUS["generic"])
    return SYSTEM_PROMPT.replace("{max_clips}", str(max_clips)) + f"\nNiche guidance: {focus}\n"


def _transcript_for_prompt(transcript: dict, limit_chars: int = 48_000) -> str:
    lines: list[str] = []
    for segment in transcript.get("segments", []):
        text = (segment.get("text") or "").strip()
        if not text:
            continue
        lines.append(f"[{float(segment['start']):.1f}-{float(segment['end']):.1f}] {text}")
        if sum(len(line) + 1 for line in lines) > limit_chars:
            break
    return "\n".join(lines)


def _extract_json(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found.")
    return json.loads(cleaned[start : end + 1])


def _normalize_clips(raw: dict, duration: float, max_clips: int) -> list[dict]:
    clips = raw.get("clips") if isinstance(raw, dict) else None
    if not isinstance(clips, list):
        raise ValueError("Missing clips array.")
    normalized: list[dict] = []
    for item in clips[:max_clips]:
        try:
            start = max(0.0, float(item.get("start", 0)))
            end = min(float(duration), float(item.get("end", 0)))
        except (TypeError, ValueError):
            continue
        if end - start < 8:
            continue
        if end - start > 90:
            end = start + 60
        hashtags = item.get("hashtags") or []
        if isinstance(hashtags, str):
            hashtags = re.findall(r"#\w+", hashtags)
        hashtags = [str(tag) if str(tag).startswith("#") else f"#{tag}" for tag in hashtags][:8]
        score = float(item.get("score", 0.7) or 0.7)
        normalized.append(
            {
                "start": round(start, 3),
                "end": round(end, 3),
                "score": max(0.0, min(1.0, score)),
                "is_hot": bool(item.get("is_hot", score >= 0.82)),
                "hook": str(item.get("hook") or "")[:240],
                "reason": str(item.get("reason") or "")[:500],
                "title": str(item.get("title") or "Untitled clip")[:160],
                "badge": str(item.get("badge") or "").strip().upper()[:24],
                "hashtags": hashtags,
            }
        )
    normalized.sort(key=lambda clip: clip["start"])
    # Remove overlapping clips, keeping the higher scoring one.
    result: list[dict] = []
    for clip in sorted(normalized, key=lambda item: item["score"], reverse=True):
        if any(not (clip["end"] <= existing["start"] or clip["start"] >= existing["end"]) for existing in result):
            continue
        result.append(clip)
    result.sort(key=lambda clip: clip["start"])
    return result


def get_llm_settings() -> dict[str, Any]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM app_settings WHERE id = 1").fetchone()
    data = dict(row) if row else {}
    data["api_key"] = decrypt_secret(data.get("encrypted_api_key"))
    return data


def _default_base_url(provider: str) -> str:
    if provider == "deepseek":
        return "https://api.deepseek.com/v1"
    if provider == "gemini":
        return "https://generativelanguage.googleapis.com/v1beta"
    return "https://api.openai.com/v1"


def _redact(message: object, api_key: str = "") -> str:
    """Strip API keys from provider errors before logging or returning them."""
    text = str(message)
    if api_key:
        text = text.replace(api_key, "***")
    text = re.sub(r"([?&]key=)[^&\s'\"]+", r"\1***", text)
    text = re.sub(r"(Bearer\s+)[A-Za-z0-9._\-]+", r"\1***", text)
    return text


def _call_openai_compatible(settings: dict, prompt: str) -> str:
    base_url = (settings.get("base_url") or _default_base_url(settings.get("provider", "openai"))).rstrip("/")
    url = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings['api_key']}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.get("model") or "gpt-4o-mini",
        "messages": [
            {
                "role": "system",
                "content": settings.get("system_prompt")
                or build_system_prompt(None, int(settings.get("max_clips", 20))),
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": float(settings.get("temperature", 0.3)),
        "response_format": {"type": "json_object"},
    }
    with httpx.Client(timeout=90) as client:
        response = client.post(url, headers=headers, json=payload)
        if response.status_code == 400:
            # Some OpenAI-compatible providers reject response_format.
            payload.pop("response_format", None)
            response = client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]


def _call_gemini(settings: dict, prompt: str) -> str:
    base_url = (settings.get("base_url") or _default_base_url("gemini")).rstrip("/")
    model = settings.get("model") or "gemini-1.5-flash"
    system = settings.get("system_prompt") or build_system_prompt(None, int(settings.get("max_clips", 20)))
    url = f"{base_url}/models/{model}:generateContent"
    payload = {
        "contents": [{"parts": [{"text": system + "\n\n" + prompt}]}],
        "generationConfig": {
            "temperature": float(settings.get("temperature", 0.3)),
            "responseMimeType": "application/json",
        },
    }
    with httpx.Client(timeout=90) as client:
        response = client.post(url, params={"key": settings["api_key"]}, json=payload)
        response.raise_for_status()
        data = response.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]


def _call_provider(settings: dict, prompt: str) -> str:
    provider = (settings.get("provider") or "openai").lower()
    if provider == "gemini":
        return _call_gemini(settings, prompt)
    return _call_openai_compatible(settings, prompt)


def heuristic_clips(
    transcript: dict,
    duration: float,
    max_clips: int = MAX_CLIPS,
    niche: str | None = None,
) -> list[dict]:
    """Fallback when no LLM key is configured or the provider fails."""
    from ..templates import NICHE_BY_ID

    badge = (NICHE_BY_ID.get((niche or "generic").lower()) or NICHE_BY_ID["generic"])["badges"][0]
    niche_key = (niche or "generic").lower()
    keywords = _NICHE_KEYWORDS.get(niche_key, _NICHE_KEYWORDS["generic"])
    segments = transcript.get("segments") or []
    if not segments:
        segments = [{"start": 0, "end": duration, "text": "Video segment"}]

    windows: list[dict] = []
    current_start = float(segments[0]["start"])
    current_text: list[str] = []
    current_end = current_start

    def flush() -> None:
        nonlocal current_start, current_text, current_end
        length = current_end - current_start
        text = " ".join(current_text).strip()
        if length >= 12 and text:
            punctuation = len(re.findall(r"[!?]", text))
            density = len(text.split()) / max(1.0, length)
            lowered = text.lower()
            kw_hits = sum(lowered.count(kw) for kw in keywords)
            score = min(1.0, 0.45 + punctuation * 0.08 + density * 0.25 + min(0.2, kw_hits * 0.05))
            title_words = re.sub(r"\s+", " ", text).strip().split()[:9]
            title = " ".join(title_words).strip(" ,.-") or "Highlight"
            windows.append(
                {
                    "start": round(current_start, 3),
                    "end": round(current_end, 3),
                    "score": round(score, 3),
                    "is_hot": score >= 0.68,
                    "hook": title,
                    "reason": "Heuristic transcript segment",
                    "title": title[:120],
                    "badge": badge,
                    "hashtags": ["#shorts", "#viral", "#clip"],
                }
            )
        current_start = current_end
        current_text = []

    for segment in segments:
        seg_start = float(segment.get("start", 0))
        seg_end = float(segment.get("end", 0))
        if not current_text:
            current_start = seg_start
        current_end = seg_end
        current_text.append(str(segment.get("text") or ""))
        if current_end - current_start >= 30:
            flush()

    if current_text:
        flush()

    if not windows:
        cursor = 0.0
        index = 1
        while cursor < duration and len(windows) < max_clips:
            end = min(duration, cursor + min(45.0, max(15.0, duration)))
            windows.append(
                {
                    "start": round(cursor, 3),
                    "end": round(end, 3),
                    "score": 0.55,
                    "is_hot": False,
                    "hook": f"Clip {index}",
                    "reason": "Automatic equal split",
                    "title": f"Clip {index}",
                    "badge": badge,
                    "hashtags": ["#shorts", "#clip"],
                }
            )
            cursor = end
            index += 1

    windows.sort(key=lambda clip: clip["score"], reverse=True)
    selected = windows[:max_clips]
    selected.sort(key=lambda clip: clip["start"])
    return selected


def detect_clips(
    transcript: dict,
    duration: float,
    niche: str | None = None,
) -> tuple[list[dict], str]:
    settings = get_llm_settings()
    max_clips = int(settings.get("max_clips") or MAX_CLIPS)
    settings["system_prompt"] = build_system_prompt(niche, max_clips)
    if not settings.get("api_key"):
        return heuristic_clips(transcript, duration, max_clips, niche), "heuristic"

    transcript_text = _transcript_for_prompt(transcript)
    if not transcript_text.strip():
        return heuristic_clips(transcript, duration, max_clips, niche), "heuristic"

    prompt = (
        f"Video duration: {duration:.1f} seconds.\n"
        f"Maximum clips: {max_clips}.\n\n"
        f"Transcript:\n{transcript_text}\n\n"
        "Return the JSON now."
    )
    last_error: Exception | None = None
    for _attempt in range(2):
        try:
            raw_text = _call_provider(settings, prompt)
            raw = _extract_json(raw_text)
            clips = _normalize_clips(raw, duration, max_clips)
            if clips:
                return clips, f"llm:{settings.get('provider')}"
        except Exception as exc:  # noqa: BLE001
            last_error = exc
    if last_error:
        print(f"[llm] falling back to heuristic: {_redact(last_error, str(settings.get('api_key') or ''))}")
    return heuristic_clips(transcript, duration, max_clips, niche), "heuristic"


def test_connection(provider: str, model: str, api_key: str, base_url: str | None = None) -> tuple[bool, str]:
    settings = {
        "provider": provider,
        "model": model,
        "api_key": api_key,
        "base_url": base_url,
        "temperature": 0.0,
        "max_clips": 1,
    }
    try:
        _call_provider(settings, "Return only this JSON: {\"clips\":[]}")
        return True, "Connection OK."
    except Exception as exc:  # noqa: BLE001
        return False, _redact(exc, api_key)
