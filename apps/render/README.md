# Render service (reserved)

The active renderer lives in `apps/api/app/services/render_ffmpeg.py` and runs
FFmpeg on the local machine. `@remotion/player` is used in the web app for the
interactive preview only.

This folder is reserved for an optional dedicated Remotion render service if the
preview and final output ever need to become pixel-identical. Nothing here is
required to run Clipper today.

If a Remotion service is added later, set `RENDER_SERVICE_URL` in
`apps/api/.env` and switch `RENDER_ENGINE` to the new engine.
