from __future__ import annotations

from pydantic import BaseModel, Field


class JobMeta(BaseModel):
    """Niche metadata entered per job. Football uses teams/score/minute,
    podcast and education use speaker/topic."""

    teams: dict[str, str] | None = None
    score: dict[str, int] | None = None
    minute: str | None = None
    competition: str | None = None
    speaker: str | None = None
    topic: str | None = None


class JobCreate(BaseModel):
    source_type: str = "url"
    url: str = ""
    niche: str | None = None
    channel_id: str | None = None
    # Optional import window for long VODs, in seconds from the source start.
    source_start: float | None = Field(default=None, ge=0)
    source_end: float | None = Field(default=None, ge=0)
    meta: JobMeta | None = None


class ChannelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    niche: str = "generic"
    canvas: str = "vertical_9x16"
    video_template: str | None = None
    caption_template: str | None = None
    font_preset: str | None = None
    accent: str | None = None
    caption_enabled: bool = True
    language: str | None = None
    notes: str | None = None


class ChannelUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    niche: str | None = None
    canvas: str | None = None
    video_template: str | None = None
    caption_template: str | None = None
    font_preset: str | None = None
    accent: str | None = None
    caption_enabled: bool | None = None
    language: str | None = None
    notes: str | None = None


class ClipPatch(BaseModel):
    title: str | None = None
    hashtags: list[str] | None = None
    canvas: str | None = None
    video_template: str | None = None
    caption_template: str | None = None
    caption_enabled: bool | None = None
    font_preset: str | None = None
    accent: str | None = None
    badge: str | None = None
    meta: JobMeta | None = None


class RenderRequest(BaseModel):
    canvas: str | None = None


class LlmSettingsUpdate(BaseModel):
    provider: str = "openai"
    model: str = "gpt-4o-mini"
    api_key: str | None = None
    base_url: str | None = None
    temperature: float = 0.3
    max_clips: int = Field(default=20, ge=1, le=50)


class LlmTestRequest(BaseModel):
    provider: str = "openai"
    model: str = "gpt-4o-mini"
    api_key: str
    base_url: str | None = None


__all__ = [
    "JobMeta",
    "JobCreate",
    "ChannelCreate",
    "ChannelUpdate",
    "ClipPatch",
    "RenderRequest",
    "LlmSettingsUpdate",
    "LlmTestRequest",
]
