from __future__ import annotations

from fastapi import APIRouter

from ..templates import (
    CANVAS_PRESETS,
    CAPTION_TEMPLATES,
    FONT_PRESETS,
    NICHE_PRESETS,
    PRESETS,
    VIDEO_TEMPLATES,
)

router = APIRouter(prefix="/api", tags=["templates"])


@router.get("/niches")
def niches():
    return NICHE_PRESETS


@router.get("/canvas-presets")
def canvas_presets():
    return CANVAS_PRESETS


@router.get("/video-templates")
def video_templates(include_hidden: bool = False):
    from ..templates import visible_video_templates

    return visible_video_templates(include_hidden)


@router.get("/caption-templates")
def caption_templates():
    return CAPTION_TEMPLATES


@router.get("/font-presets")
def font_presets():
    return FONT_PRESETS


@router.get("/presets")
def presets():
    return PRESETS
