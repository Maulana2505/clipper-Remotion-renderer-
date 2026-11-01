"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import {
  ClipComposition,
  normalizeCrop,
  type CaptionId,
  type ClipMeta,
  type ClipProps,
  type CropSettings,
  type FontId,
  type LayoutId,
  type OverlaySettings,
  type Word,
} from "@clipper/video";
import { api, apiUrl, type CanvasPreset, type Clip, type Job } from "@/lib/api";

type TranscriptWord = { word: string; start: number; end: number };
type TranscriptSegment = { start: number; end: number; text: string; words?: TranscriptWord[] };
type Transcript = { segments?: TranscriptSegment[] };
type FaceTrack = { keyframes?: Array<{ t: number; x: number; y: number }> };

type Props = {
  job: Job;
  clip: Clip;
  canvas: CanvasPreset;
  videoTemplate: string;
  captionTemplate: string;
  captionEnabled: boolean;
  fontPreset: string;
  accent?: string;
  badge?: string | null;
  meta?: ClipMeta;
  crop?: CropSettings | null;
  overlays?: OverlaySettings[] | null;
  overlayMode?: "move" | "pan";
  selectedOverlayId?: string | null;
  onSelectOverlay?: (id: string | null) => void;
  onOverlayChange?: (id: string, patch: Partial<OverlaySettings>) => void;
  cropMode?: boolean;
  onCropChange?: (crop: CropSettings) => void;
  /** Re-fetch the transcript/face track after they are generated on demand. */
  analysisVersion?: number;
};

/**
 * Preview uses the exact same composition as the renderer (`@clipper/video`),
 * so what the user sees here is what Remotion writes to disk.
 */
export default function ClipPreview({
  job,
  clip,
  canvas,
  videoTemplate,
  captionTemplate,
  captionEnabled,
  fontPreset,
  accent = "#CCFF00",
  badge = null,
  meta,
  crop = null,
  overlays = null,
  overlayMode = "move",
  selectedOverlayId = null,
  onSelectOverlay,
  onOverlayChange,
  cropMode = false,
  onCropChange,
  analysisVersion = 0,
}: Props) {
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [faceTrack, setFaceTrack] = useState<FaceTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number; crop: CropSettings } | null>(null);
  const activeCrop = useMemo(() => normalizeCrop(crop), [crop]);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const overlayDragRef = useRef<{ id: string; startX: number; startY: number; startValue: { x: number; y: number; cropX: number; cropY: number } } | null>(null);

  const beginOverlayDrag = (event: React.PointerEvent<HTMLDivElement>, overlay: OverlaySettings) => {
    if (!onOverlayChange) return;
    event.preventDefault();
    event.stopPropagation();
    onSelectOverlay?.(overlay.id ?? null);
    const rect = layerRef.current?.getBoundingClientRect();
    if (!rect) return;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
    overlayDragRef.current = {
      id: overlay.id ?? "",
      startX: event.clientX,
      startY: event.clientY,
      startValue: { x: overlay.x, y: overlay.y, cropX: overlay.crop.x, cropY: overlay.crop.y },
    };
  };

  const moveOverlayDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = overlayDragRef.current;
    if (!drag || !onOverlayChange || !layerRef.current) return;
    const rect = layerRef.current.getBoundingClientRect();
    const dx = (event.clientX - drag.startX) / rect.width;
    const dy = (event.clientY - drag.startY) / rect.height;
    const overlay = (overlays || []).find((o) => o.id === drag.id);
    if (!overlay) return;
    if (overlayMode === "move") {
      onOverlayChange(drag.id, { x: Math.min(1, Math.max(0, drag.startValue.x + dx)), y: Math.min(1, Math.max(0, drag.startValue.y + dy)) });
    } else {
      const zoom = Math.max(1, overlay.crop.zoom);
      onOverlayChange(drag.id, { crop: { ...overlay.crop, x: Math.min(1, Math.max(0, drag.startValue.cropX - dx / zoom)), y: Math.min(1, Math.max(0, drag.startValue.cropY - dy / zoom)) } });
    }
  };

  const endOverlayDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!overlayDragRef.current) return;
    overlayDragRef.current = null;
    try { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
  };

  useEffect(() => {
    let active = true;
    setError(null);
    setTranscript(null);
    setFaceTrack(null);
    Promise.all([
      api<Transcript>(`/api/jobs/${job.id}/transcript`).catch(() => ({ segments: [] })),
      api<FaceTrack>(`/api/clips/${clip.id}/face-track`).catch(() => ({ keyframes: [] })),
    ])
      .then(([transcriptData, faceData]) => {
        if (!active) return;
        setTranscript(transcriptData);
        setFaceTrack(faceData);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Preview data unavailable.");
      });
    return () => {
      active = false;
    };
  }, [job.id, clip.id, analysisVersion]);

  const words = useMemo<Word[]>(() => {
    const all: Word[] = [];
    for (const segment of transcript?.segments || []) {
      for (const word of segment.words || []) {
        if (word.word && word.end > clip.start_time && word.start < clip.end_time) {
          all.push({
            word: word.word,
            start: Math.max(0, word.start - clip.start_time),
            end: Math.max(0, word.end - clip.start_time),
          });
        }
      }
    }
    return all.sort((a, b) => a.start - b.start);
  }, [transcript, clip.start_time, clip.end_time]);

  const faceKeyframes = useMemo(
    () =>
      (faceTrack?.keyframes || [])
        .filter((item) => item.t >= -0.05 && item.t <= clip.end_time - clip.start_time + 0.05)
        .map((item) => ({ t: item.t, x: item.x, y: item.y })),
    [faceTrack, clip.start_time, clip.end_time],
  );

  const inputProps: ClipProps = useMemo(
    () => ({
      canvas: {
        width: canvas.width,
        height: canvas.height,
        fps: 30,
        safe_area: canvas.safe_area,
      },
      clip: { start: clip.start_time, end: clip.end_time },
      source: {
        url: apiUrl(`/api/jobs/${job.id}/video`),
        width: job.width || 1920,
        height: job.height || 1080,
      },
      media: { mode: "video" },
      layout: videoTemplate as LayoutId,
      crop: activeCrop,
      overlays: overlays ?? [],
      caption: {
        template: (captionTemplate as CaptionId) || "plain_white",
        font: (fontPreset as FontId) || "anton",
        accent,
        enabled: captionEnabled,
      },
      words,
      face: { keyframes: faceKeyframes },
      meta: { ...meta, title: clip.title || meta?.title || "", badge: badge ?? meta?.badge ?? null },
    }),
    [
      canvas,
      clip.start_time,
      clip.end_time,
      clip.title,
      job.id,
      job.width,
      job.height,
      videoTemplate,
      captionTemplate,
      fontPreset,
      accent,
      captionEnabled,
      words,
      faceKeyframes,
      badge,
      meta,
      activeCrop,
      overlays,
    ],
  );

  const duration = Math.max(1, Math.round((clip.end_time - clip.start_time) * 30));

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!cropMode || !onCropChange) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Older browsers without pointer capture still pan through pointermove.
    }
    dragRef.current = { x: event.clientX, y: event.clientY, crop: activeCrop };
    setDragging(true);
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    if (!start || !onCropChange) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const zoom = Math.max(1, start.crop.zoom);
    onCropChange(
      normalizeCrop({
        ...start.crop,
        x: start.crop.x - (event.clientX - start.x) / (rect.width * zoom),
        y: start.crop.y - (event.clientY - start.y) / (rect.height * zoom),
      }),
    );
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // ignore
    }
  };

  if (error) {
    return (
      <div className="flex aspect-[9/16] w-full items-center justify-center rounded-2xl border border-white/10 bg-black px-6 text-center text-xs text-zinc-500">
        {error}
      </div>
    );
  }

  return (
    <div
      className="mx-auto w-full"
      style={{ maxWidth: `min(100%, calc(70vh * ${canvas.width / canvas.height}))` }}
    >
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
        <Player
          component={ClipComposition}
          durationInFrames={duration}
          compositionWidth={canvas.width}
          compositionHeight={canvas.height}
          fps={30}
          inputProps={inputProps}
          style={{ width: "100%" }}
          controls={!cropMode}
          loop
          doubleClickToFullscreen={!cropMode}
          acknowledgeRemotionLicense
        />
        {cropMode ? (
          <div
            onPointerDown={beginDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className={`absolute inset-0 z-10 cursor-move touch-none border-2 transition ${
              dragging ? "border-lime bg-lime/5" : "border-lime/40"
            }`}
          >
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-30">
              {Array.from({ length: 9 }).map((_, index) => (
                <div key={index} className="border border-white/30" />
              ))}
            </div>
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-lime/70" />
            <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-black/70 px-2 py-1 text-[10px] font-medium text-lime">
              Drag to pan · {Math.round(activeCrop.zoom * 100)}%
            </span>
          </div>
        ) : null}
        {cropMode && overlays && overlays.length ? (
          <div
            ref={layerRef}
            className="absolute inset-0 z-20 touch-none"
            onPointerMove={moveOverlayDrag}
            onPointerUp={endOverlayDrag}
            onPointerCancel={endOverlayDrag}
          >
            {overlays.map((overlay) => {
              const selected = selectedOverlayId === overlay.id;
              const radius =
                overlay.shape === "circle"
                  ? "50%"
                  : overlay.shape === "rounded"
                  ? "12%"
                  : "0";
              return (
                <div
                  key={overlay.id}
                  onPointerDown={(event) => beginOverlayDrag(event, overlay)}
                  className={`absolute cursor-grab active:cursor-grabbing ${selected ? "ring-2 ring-lime" : "ring-1 ring-white/40"}`}
                  style={{
                    left: `${overlay.x * 100}%`,
                    top: `${overlay.y * 100}%`,
                    width: `${overlay.size * 100}%`,
                    aspectRatio: "4 / 3",
                    transform: "translate(-50%, -50%)",
                    borderRadius: radius,
                    background: "rgba(0,0,0,0.25)",
                  }}
                >
                  <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-bold text-white drop-shadow">
                    {overlayMode === "move" ? "move" : "pan"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
