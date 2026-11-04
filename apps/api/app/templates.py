from __future__ import annotations

CANVAS_PRESETS: list[dict] = [
    {
        "id": "vertical_9x16",
        "name": "9:16 Vertical",
        "width": 1080,
        "height": 1920,
        "platform": "TikTok / Reels / Shorts",
        "safe_area": {"top": 0.08, "bottom": 0.15, "left": 0.05, "right": 0.12},
    },
    {
        "id": "portrait_4x5",
        "name": "4:5 Portrait",
        "width": 1080,
        "height": 1350,
        "platform": "Instagram Feed",
        "safe_area": {"top": 0.06, "bottom": 0.12, "left": 0.06, "right": 0.06},
    },
    {
        "id": "square_1x1",
        "name": "1:1 Square",
        "width": 1080,
        "height": 1080,
        "platform": "Universal Feed",
        "safe_area": {"top": 0.06, "bottom": 0.10, "left": 0.06, "right": 0.06},
    },
    {
        "id": "landscape_16x9",
        "name": "16:9 Landscape",
        "width": 1920,
        "height": 1080,
        "platform": "YouTube",
        "safe_area": {"top": 0.05, "bottom": 0.10, "left": 0.05, "right": 0.05},
    },
    {
        "id": "portrait_3x4",
        "name": "3:4 Portrait",
        "width": 1080,
        "height": 1440,
        "platform": "Portrait",
        "safe_area": {"top": 0.06, "bottom": 0.12, "left": 0.06, "right": 0.06},
    },
    {
        "id": "portrait_2x3",
        "name": "2:3 Portrait",
        "width": 1080,
        "height": 1620,
        "platform": "Pinterest",
        "safe_area": {"top": 0.08, "bottom": 0.12, "left": 0.06, "right": 0.06},
    },
    {
        "id": "landscape_4x3",
        "name": "4:3 Landscape",
        "width": 1440,
        "height": 1080,
        "platform": "Presentation",
        "safe_area": {"top": 0.05, "bottom": 0.10, "left": 0.05, "right": 0.05},
    },
    {
        "id": "cinema_21x9",
        "name": "21:9 Cinematic",
        "width": 2560,
        "height": 1080,
        "platform": "Cinematic",
        "safe_area": {"top": 0.05, "bottom": 0.08, "left": 0.05, "right": 0.05},
    },
]

VIDEO_TEMPLATES: list[dict] = [
    {"id": "auto_crop", "name": "Auto Face Crop", "description": "Face tracking crop", "requires_face_track": True},
    {"id": "center_crop", "name": "Center Crop", "description": "Center crop without face tracking", "requires_face_track": False},
    {"id": "blur_bg", "name": "Blurred Background", "description": "Full video with blurred fill", "requires_face_track": False},
    {"id": "framed", "name": "Framed", "description": "Video with padding and border", "requires_face_track": False},
    {"id": "split_top_bottom", "name": "Split Screen", "description": "Two stacked crops", "requires_face_track": True},
    {"id": "cam_overlay", "name": "Cam Overlay", "description": "Speaker overlay", "requires_face_track": True},
    {"id": "letterbox_title", "name": "Letterbox Title", "description": "Cinematic bars with title", "requires_face_track": False},
    {"id": "hook_intro", "name": "Hook Intro", "description": "Opening title card", "requires_face_track": False},
    {"id": "progress_bar", "name": "Progress Bar", "description": "Thin animated progress bar", "requires_face_track": False},
    {"id": "minimal_frame", "name": "Minimal Frame", "description": "Clean border and padding", "requires_face_track": False},
    {"id": "football_scoreboard", "name": "Football Scoreboard", "description": "Action focus, no scoreboard", "requires_face_track": False, "niche": "football"},
    {"id": "football_scoreboard_bottom", "name": "Football Scoreboard Bottom", "description": "Action focus, badge at bottom", "requires_face_track": False, "niche": "football"},
    {"id": "football_minimal", "name": "Football Minimal", "description": "Badge and progress only", "requires_face_track": False, "niche": "football"},
    {"id": "football_broadcast", "name": "Football Broadcast", "description": "Broadcast-style, no scoreboard", "requires_face_track": False, "niche": "football"},
    {"id": "football_highlight", "name": "Football Highlight", "description": "Big badge highlight", "requires_face_track": False, "niche": "football"},
    {"id": "football_clean", "name": "Football Clean", "description": "Clean action layout", "requires_face_track": False, "niche": "football"},
    {"id": "football_vertical_stack", "name": "Football Vertical Stack", "description": "Vertical action layout", "requires_face_track": False, "niche": "football"},
    {"id": "duo_split", "name": "Duo Split", "description": "Two speakers stacked with name tags", "requires_face_track": False, "niche": "podcast"},
    {"id": "lower_third", "name": "Lower Third", "description": "Speaker and topic card", "requires_face_track": False, "niche": "education"},
    {"id": "gaming_classic_split", "name": "Gaming Classic Split", "description": "Facecam 34% top, gameplay 54% below", "requires_face_track": True, "niche": "gaming", "visible_by_default": True},
    {"id": "gaming_pip_overlay", "name": "Gaming PiP Overlay", "description": "Full-bleed gameplay with circular facecam", "requires_face_track": True, "niche": "gaming", "visible_by_default": True},
    {"id": "gaming_tri_zone", "name": "Gaming Tri Zone", "description": "Facecam, crosshair gameplay and killfeed HUD", "requires_face_track": True, "niche": "gaming", "visible_by_default": True},
    {"id": "gaming_cinematic_blur", "name": "Gaming Cinematic Blur", "description": "16:9 gameplay over a blurred backdrop", "requires_face_track": False, "niche": "gaming", "visible_by_default": True},
    {"id": "gaming_duo_versus", "name": "Gaming Duo Versus", "description": "Two facecams P1 vs P2 above the gameplay", "requires_face_track": True, "niche": "gaming", "visible_by_default": True},
    {"id": "duo_split_horizontal", "name": "Duo Split Horizontal", "description": "Two speakers side by side", "requires_face_track": False, "niche": "podcast"},
    {"id": "solo_podcast", "name": "Solo Podcast", "description": "Single speaker lower third", "requires_face_track": False, "niche": "podcast"},
    {"id": "podcast_quote", "name": "Podcast Quote", "description": "Big quote card", "requires_face_track": False, "niche": "podcast"},
    {"id": "podcast_chat", "name": "Podcast Chat", "description": "Chat bubble style", "requires_face_track": False, "niche": "podcast"},
    {"id": "podcast_minimal", "name": "Podcast Minimal", "description": "Facecam + progress", "requires_face_track": False, "niche": "podcast"},
    {"id": "lower_third_top", "name": "Lower Third Top", "description": "Card at the top", "requires_face_track": False, "niche": "education"},
    {"id": "education_step", "name": "Education Step", "description": "Step number card", "requires_face_track": False, "niche": "education"},
    {"id": "education_fact", "name": "Education Fact", "description": "Fact card with accent", "requires_face_track": False, "niche": "education"},
    {"id": "education_minimal", "name": "Education Minimal", "description": "Clean lower third", "requires_face_track": False, "niche": "education"},
    {"id": "education_split", "name": "Education Split", "description": "Video top, points bottom", "requires_face_track": False, "niche": "education"},
    {"id": "center_focus", "name": "Center Focus", "description": "Face centered with vignette", "requires_face_track": True, "niche": "generic"},
    {"id": "full_bleed_text", "name": "Full Bleed Text", "description": "Text overlay on full video", "requires_face_track": False, "niche": "generic"},
    {"id": "framed_minimal", "name": "Framed Minimal", "description": "Padded frame with border", "requires_face_track": False, "niche": "generic"},
    {"id": "cinematic_bars", "name": "Cinematic Bars", "description": "Letterbox + vignette", "requires_face_track": False, "niche": "generic"},
    {"id": "custom_overlay", "name": "Custom Overlay", "description": "Multiple facecam boxes/circles with per-overlay crop", "requires_face_track": False, "niche": "generic"},
]

CAPTION_TEMPLATES: list[dict] = [
    {"id": "none", "name": "None", "description": "No captions", "animation": "none"},
    {"id": "plain_white", "name": "Plain White", "description": "Clean white text", "animation": "fade"},
    {"id": "glow_neon", "name": "Glow Neon", "description": "Neon green glow", "animation": "pop"},
    {"id": "subtract_box", "name": "Subtract Box", "description": "Semi-transparent box", "animation": "fade"},
    {"id": "karaoke_highlight", "name": "Karaoke Highlight", "description": "Active word highlight", "animation": "highlight"},
    {"id": "bold_outline", "name": "Bold Outline", "description": "Heavy outline", "animation": "pop"},
    {"id": "minimal_lower", "name": "Minimal Lower Third", "description": "Small lower text", "animation": "fade"},
    {"id": "gradient_pop", "name": "Gradient Pop", "description": "Bright gradient", "animation": "pop"},
    {"id": "typewriter", "name": "Typewriter", "description": "Word-by-word reveal", "animation": "typewriter"},
    {"id": "bounce_word", "name": "Bounce Word", "description": "Bouncy words", "animation": "bounce"},
    {"id": "neon_blue", "name": "Neon Blue", "description": "Blue neon glow", "animation": "pop"},
    {"id": "yellow_highlight", "name": "Yellow Highlight", "description": "Yellow background", "animation": "highlight"},
    {"id": "accent_pop", "name": "Accent Pop", "description": "Line pop with accent word", "animation": "pop"},
    {"id": "accent_highlight", "name": "Accent Highlight", "description": "Stroke text with accent karaoke", "animation": "highlight"},
]

FONT_PRESETS: list[dict] = [
    {"id": "anton", "name": "Anton", "family": "Anton"},
    {"id": "oswald", "name": "Oswald", "family": "Oswald"},
    {"id": "inter", "name": "Inter", "family": "Inter"},
    {"id": "montserrat", "name": "Montserrat", "family": "Montserrat"},
    {"id": "pinyon", "name": "Pinyon Script", "family": "Pinyon Script"},
    {"id": "eb_garamond", "name": "EB Garamond", "family": "EB Garamond"},
    {"id": "bebas_neue", "name": "Bebas Neue", "family": "Bebas Neue"},
    {"id": "archivo_black", "name": "Archivo Black", "family": "Archivo Black"},
]

PRESETS: list[dict] = [
    {
        "id": "tiktok_viral",
        "name": "TikTok Viral",
        "canvas": "vertical_9x16",
        "video_template": "auto_crop",
        "caption_template": "glow_neon",
        "font_preset": "anton",
    },
    {
        "id": "reels_clean",
        "name": "Reels Clean",
        "canvas": "vertical_9x16",
        "video_template": "blur_bg",
        "caption_template": "plain_white",
        "font_preset": "oswald",
    },
    {
        "id": "ig_feed",
        "name": "IG Feed",
        "canvas": "square_1x1",
        "video_template": "framed",
        "caption_template": "subtract_box",
        "font_preset": "eb_garamond",
    },
    {
        "id": "ig_portrait",
        "name": "IG Portrait",
        "canvas": "portrait_4x5",
        "video_template": "auto_crop",
        "caption_template": "bold_outline",
        "font_preset": "anton",
    },
    {
        "id": "youtube_clip",
        "name": "YouTube Clip",
        "canvas": "landscape_16x9",
        "video_template": "center_crop",
        "caption_template": "minimal_lower",
        "font_preset": "inter",
    },
    {
        "id": "cinematic",
        "name": "Cinematic",
        "canvas": "cinema_21x9",
        "video_template": "letterbox_title",
        "caption_template": "subtract_box",
        "font_preset": "eb_garamond",
    },
]

CANVAS_BY_ID = {item["id"]: item for item in CANVAS_PRESETS}
CAPTION_BY_ID = {item["id"]: item for item in CAPTION_TEMPLATES}
FONT_BY_ID = {item["id"]: item for item in FONT_PRESETS}
VIDEO_BY_ID = {item["id"]: item for item in VIDEO_TEMPLATES}

# Starting presets per channel niche. Defaults only: every field can be
# overridden per channel and again per clip.
NICHE_PRESETS: list[dict] = [
    {
        "id": "gaming",
        "name": "Gaming",
        "canvas": "vertical_9x16",
        "video_template": "gaming_classic_split",
        "caption_template": "accent_highlight",
        "font_preset": "anton",
        "accent": "#CCFF00",
        "badges": ["CLUTCH", "JUMPSCARE", "INSANE", "GG"],
        "clip_focus": "clutch plays, jumpscares, rage moments, funny fails, reaction peaks",
    },
    {
        "id": "football",
        "name": "Football",
        "canvas": "vertical_9x16",
        "video_template": "football_scoreboard",
        "caption_template": "accent_pop",
        "font_preset": "archivo_black",
        "accent": "#FF4D00",
        "badges": ["GOL", "PENALTI", "KARTU MERAH", "SAVE"],
        "clip_focus": "goals, saves, fouls, referee controversy, crowd reactions, commentary peaks",
    },
    {
        "id": "podcast",
        "name": "Podcast / Reaction",
        "canvas": "vertical_9x16",
        "video_template": "duo_split",
        "caption_template": "accent_highlight",
        "font_preset": "archivo_black",
        "accent": "#FFD400",
        "badges": ["HOT TAKE", "NGELAG", "PLOT TWIST"],
        "clip_focus": "hot takes, disagreements, funny stories, surprising admissions",
    },
    {
        "id": "education",
        "name": "Education",
        "canvas": "vertical_9x16",
        "video_template": "lower_third",
        "caption_template": "plain_white",
        "font_preset": "inter",
        "accent": "#00E5FF",
        "badges": ["TIP", "FAKTA", "STEP"],
        "clip_focus": "clear explanations, actionable tips, myth corrections, strong examples",
    },
    {
        "id": "generic",
        "name": "Generic",
        "canvas": "vertical_9x16",
        "video_template": "auto_crop",
        "caption_template": "plain_white",
        "font_preset": "anton",
        "accent": "#CCFF00",
        "badges": ["HIGHLIGHT"],
        "clip_focus": "strong hooks, conflict, punchlines, emotional peaks",
    },
]

NICHE_BY_ID = {item["id"]: item for item in NICHE_PRESETS}

# Moment-detection tuning per niche. Consumed by services/moments.py.
DETECT_PROFILES: dict[str, dict] = {
    "gaming": {"min_len": 12, "max_len": 35, "target": 20, "peak_weight": 1.0, "sustained_weight": 0.5, "visual_weight": 0.9, "visual": True, "boundary": "scene_or_pause", "seconds_per_clip": 45, "pre_ratio": 0.42, "focus": "impact"},
    "football": {"min_len": 15, "max_len": 45, "target": 26, "peak_weight": 0.7, "sustained_weight": 1.0, "visual_weight": 0.8, "visual": True, "boundary": "scene_or_pause", "seconds_per_clip": 75, "pre_ratio": 0.46, "focus": "crowd"},
    "podcast": {"min_len": 20, "max_len": 50, "target": 32, "peak_weight": 0.4, "sustained_weight": 0.9, "visual_weight": 0.3, "visual": True, "boundary": "pause", "seconds_per_clip": 90, "pre_ratio": 0.5, "focus": "speech"},
    "education": {"min_len": 20, "max_len": 60, "target": 34, "peak_weight": 0.5, "sustained_weight": 0.8, "visual_weight": 0.3, "visual": True, "boundary": "pause", "seconds_per_clip": 100, "pre_ratio": 0.5, "focus": "speech"},
    "generic": {"min_len": 15, "max_len": 45, "target": 26, "peak_weight": 0.6, "sustained_weight": 0.7, "visual_weight": 0.5, "visual": True, "boundary": "pause_or_scene", "seconds_per_clip": 60, "pre_ratio": 0.46, "focus": "impact"},
}

# Templates hidden from the picker by default. Niche-specific layouts are kept
# for existing jobs but hidden so the UI focuses on the general ones while
# experimenting. Set INCLUDE_HIDDEN_TEMPLATES=1 (or pass include_hidden=true
# to /api/video-templates) to reveal them.
HIDDEN_TEMPLATE_IDS: set[str] = {
    t["id"]
    for t in VIDEO_TEMPLATES
    if t.get("niche") not in (None, "", "generic") and not t.get("visible_by_default")
}


def visible_video_templates(include_hidden: bool = False) -> list[dict]:
    if include_hidden:
        return VIDEO_TEMPLATES
    return [t for t in VIDEO_TEMPLATES if t["id"] not in HIDDEN_TEMPLATE_IDS]
