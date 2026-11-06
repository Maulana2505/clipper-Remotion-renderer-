from __future__ import annotations

from typing import Literal

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


class CropSettings(BaseModel):
    """Manual pan/zoom crop of the cover-fitted frame.

    ``x``/``y`` is the normalised point that should sit in the middle of the
    output, ``zoom`` is how far the frame is scaled in (1 = plain cover fit).
    """

    x: float = Field(default=0.5, ge=0.0, le=1.0)
    y: float = Field(default=0.5, ge=0.0, le=1.0)
    zoom: float = Field(default=1.0, ge=1.0, le=4.0)


class OverlaySettings(BaseModel):
    """One facecam/overlay bubble in the custom_overlay layout."""

    id: str | None = None
    shape: Literal["circle", "rounded", "square"] = "circle"
    source_url: str | None = None
    x: float = Field(default=0.5, ge=0.0, le=1.0)
    y: float = Field(default=0.5, ge=0.0, le=1.0)
    size: float = Field(default=0.26, ge=0.05, le=0.8)
    crop: CropSettings = Field(default_factory=CropSettings)


class RedetectRequest(BaseModel):
    """How to apply transcript-aware clip detection to an existing job."""

    mode: Literal["merge", "replace"] = "merge"


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


class CaptionLayout(BaseModel):
    """Layout/arrangement of captions on the rendered clip."""

    lines_on_screen: int = Field(default=2, ge=1, le=3)
    words_per_line: int = Field(default=4, ge=2, le=6)
    y: float = Field(default=0.84, ge=0.05, le=0.95)
    align: Literal["left", "center", "right"] = "center"
    width: float = Field(default=0.86, ge=0.35, le=0.98)
    font_scale: float = Field(default=1.0, ge=0.6, le=1.6)
    line_gap: float = Field(default=0.18, ge=0.0, le=0.6)


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
    crop: CropSettings | None = None
    overlays: list[OverlaySettings] | None = None
    caption_layout: CaptionLayout | None = None


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


class WhisperSettingsUpdate(BaseModel):
    model: str = Field(default="small", min_length=1, max_length=40, pattern="^(base|small|large-v3-turbo)$")
    backend: str = Field(default="local", pattern="^(local|remote)$")
    language: str = Field(default="auto", max_length=12)
    mode: str = Field(default="balanced", pattern="^(fast|balanced|accurate)$")
    hotwords: str | None = Field(default=None, max_length=500)
    remote_url: str | None = Field(default=None, max_length=500)
    remote_token: str | None = Field(default=None, max_length=500)
    face_backend: str | None = Field(default=None, pattern="^(local|remote)$")
    auto_full_analysis: bool | None = None


__all__ = [
    "JobMeta",
    "JobCreate",
    "ChannelCreate",
    "ChannelUpdate",
    "ClipPatch",
    "RenderRequest",
    "LlmSettingsUpdate",
    "LlmTestRequest",
    "WhisperSettingsUpdate",
]
