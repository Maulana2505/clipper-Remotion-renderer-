# Clipper — Smart Auto-Clipping (Local Engine)

Local-first web app that turns long videos into short, captioned, platform-ready clips for niche channels (gaming, football, podcast/reaction, education).

- **Frontend:** Next.js 16 + React 19 + Tailwind + Remotion Player preview
- **API:** FastAPI + SQLite
- **Media prep:** `yt-dlp`, FFmpeg, optional `faster-whisper` and OpenCV face tracking (both on demand only)
- **Rendering:** Remotion only — the preview and the final file use the same React composition (`packages/video`)
- **Fonts:** open-source fonts bundled locally (no Google Fonts request at runtime)
- **No cloud rendering, no AWS Lambda, no auth, no watermark** — personal use, localhost

## What is implemented

- Import page for URL or local upload
- Automatic range import for videos longer than 30 minutes (`yt-dlp --download-sections` for URLs, FFmpeg trim for uploads); gaming processes the full VOD by default
- Fast job pipeline: download → audio scan → highlight detection → clip build (no transcription, no face tracking)
- Manual crop on every clip: pan/zoom (`x`, `y`, `zoom`) shared by preview and render
- On-demand extras while editing: generate a transcript (for captions), re-detect clips from that transcript, or track a face per clip
- Channel profiles: store layout, caption style, font, accent and language once per niche, reuse on every job
- 4 niche presets (gaming, football, podcast/reaction, education) plus a generic fallback
- Per-job football scoreboard data (teams, score, minute, competition)
- Editable moment badges, with niche defaults (and LLM suggestions once a transcript exists)
- LLM settings drawer with encrypted API key storage
- LLM providers: OpenAI-compatible (OpenAI, DeepSeek, custom) and Gemini
- 40 video layouts across all niches
- 14 caption templates + `none` to disable captions
- 8 canvases at 1080p
- Per-clip canvas, layout, caption style, font, accent, badge and metadata
- Render one canvas, or export all 8 one by one
- ZIP download for completed renders
- Storage page with manual cleanup and disk reminders

## Quick start (Windows)

After the one-time setup below, double-click a file in the project root:

| File | What it does |
| --- | --- |
| `start-clipper.bat` | Starts API + web in two windows, waits until both respond, then opens <http://localhost:3000> |
| `stop-clipper.bat` | Stops both services and frees ports 8000 and 3000 |
| `restart-clipper.bat` | Runs stop, then start |

The start script checks for the virtualenv and `node_modules`, and warns if a port is already busy.

## Requirements

- Node.js 20+ (tested on Node 24)
- Python 3.12+
- FFmpeg + FFprobe on `PATH`
- yt-dlp on `PATH`
- Optional: `faster-whisper` for local speech-to-text (only used when you press *Generate transcript*)
- Optional: `opencv-python-headless` for face tracking (only used when you press *Auto-detect face*)

> Both extras are off by default. The build pipeline never transcribes or tracks faces, so a job finishes after the audio scan.

> `faster-whisper` is optional but needs `requests` and `av==12.3.0` (newer PyAV builds break it). The first transcription downloads the `small` model (~460 MB) to `%USERPROFILE%\.cache\huggingface\hub`. On Windows without Developer Mode, Hugging Face prints a harmless symlink warning.

## Setup

### 1. Backend

```powershell
cd apps/api
py -3.12 -m venv .venv
.\.venv\Scripts\pip.exe install -r requirements.txt
# optional:
# .\.venv\Scripts\pip.exe install -r requirements-optional.txt
copy .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

API docs: <http://127.0.0.1:8000/docs>

### 2. Frontend

```powershell
cd apps/web
npm install
npm run dev
```

Open <http://localhost:3000>.

### 3. Optional environment

`apps/web/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

## How it works

1. Pick a channel (or a niche) and paste a supported URL or upload a video.
2. The API downloads the video and runs an FFmpeg loudness scan (RMS every 500 ms). The busiest non-overlapping windows become the candidate clips — no Whisper, no face tracking, no model download.
3. Each clip gets the niche/channel defaults: layout, canvas, captions, font, accent, and a default moment badge. Titles and badges stay editable.
4. In the Studio you can:
   - open the **Crop** tab to pan/zoom every clip (drag inside the preview, or use the sliders); the crop is stored per clip and used by both preview and render
   - press **Generate transcript** in the Caption tab if you want captions (runs `faster-whisper` locally, on demand)
   - after a transcript exists, **Add clips** re-detects moments from the transcript and appends only non-overlapping windows, while **Replace all** rebuilds the clip list (both use the configured LLM, or the local heuristic when no key is set)
   - press **Auto-detect face** in the Crop tab if a layout's face bubble/PiP should follow a face (OpenCV, on demand)
5. Rendering runs Remotion:
   - FFmpeg extracts the clip's audio and a full-frame JPEG sequence of the clip window
   - Remotion renders `<Img>` + vector text at the canvas resolution (frames are not pre-cropped; crop and layout stay in React)
   - FFmpeg muxes the audio back (`-c:v copy -c:a aac`)
   - Renders run one at a time behind a lock; failures surface the error and can be retried

## Notes & limits

- Personal use only. Remotion is used under its free/personal license. Do not redistribute this app commercially without reviewing licenses.
- Fonts are bundled in `apps/api/assets/fonts`, `apps/render/public/fonts` and `apps/web/public/fonts`, so preview and render match without network access.
- The preview and the render import the same components from `packages/video`; a layout is never duplicated in FFmpeg.
- URL jobs fetch the real video title with `yt-dlp --get-title`, so the library shows the source name instead of a generic label.
- Provider/LLM errors are redacted (`?key=***`, `Bearer ***`) before they reach logs or the UI.
- Render speed depends on the machine; a 2-core laptop renders a 20-second 1080×1920 clip in roughly a minute.
- `Download ZIP` keeps only the newest completed render per canvas, so archives never contain duplicate file names.
- No automatic file deletion. Use the Storage page.
- The backend binds to `127.0.0.1` by default.

## Project layout

```text
apps/
  api/       FastAPI + SQLite + pipeline + Remotion render driver
  web/       Next.js app router UI + Remotion Player preview
  render/    Remotion entry point (render.mjs) used by the API
packages/
  video/     Shared React compositions: layouts, captions, media, presets
```
