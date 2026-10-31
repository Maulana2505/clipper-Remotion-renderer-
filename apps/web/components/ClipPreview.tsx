"use client";

import { useEffect, useMemo, useState } from "react";
import { Player } from "@remotion/player";
import {
  ClipComposition,
  type CaptionId,
  type ClipMeta,
  type ClipProps,
  type FontId,
  type LayoutId,
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
}: Props) {
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [faceTrack, setFaceTrack] = useState<FaceTrack | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  }, [job.id, clip.id]);

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
    ],
  );

  const duration = Math.max(1, Math.round((clip.end_time - clip.start_time) * 30));

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
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
        <Player
          component={ClipComposition}
          durationInFrames={duration}
          compositionWidth={canvas.width}
          compositionHeight={canvas.height}
          fps={30}
          inputProps={inputProps}
          style={{ width: "100%" }}
          controls
          loop
          doubleClickToFullscreen
          acknowledgeRemotionLicense
        />
      </div>
    </div>
  );
}
