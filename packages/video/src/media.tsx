import React from 'react';
import {Img, Video, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {ClipProps, CropSettings, FaceKeyframe, OverlaySettings} from './types';

const MAX_ZOOM = 4;

export function resolveSrc(url: string): string {
  if (/^(https?:|data:|blob:)/i.test(url)) {
    return url;
  }
  return staticFile(url);
}

function frameSrc(prefix: string, frame: number, extension = '.jpg', digits = 4): string {
  return staticFile(`${prefix}${String(frame + 1).padStart(digits, '0')}${extension}`);
}

/** How far the frame can be panned at a given zoom without exposing an edge. */
export function cropRoom(zoom: number): number {
  const safe = Math.max(1, Math.min(MAX_ZOOM, zoom || 1));
  return (safe - 1) / (2 * safe);
}

export function normalizeCrop(crop?: Partial<CropSettings> | null): CropSettings {
  const rawZoom = Number(crop?.zoom ?? 1);
  const zoom = Math.max(1, Math.min(MAX_ZOOM, Number.isFinite(rawZoom) ? rawZoom : 1));
  const room = cropRoom(zoom);
  const clamp = (value: number) => {
    const safe = Number.isFinite(value) ? value : 0.5;
    return Math.min(0.5 + room, Math.max(0.5 - room, safe));
  };
  return {
    x: clamp(Number(crop?.x ?? 0.5)),
    y: clamp(Number(crop?.y ?? 0.5)),
    zoom,
  };
}

/** CSS transform that centres the crop point and keeps the frame edge-to-edge. */
export function cropTransform(crop?: Partial<CropSettings> | null): React.CSSProperties {
  const normalized = normalizeCrop(crop);
  if (normalized.zoom <= 1.0001) {
    return {};
  }
  const tx = (0.5 - normalized.x) * 100;
  const ty = (0.5 - normalized.y) * 100;
  return {
    transform: `scale(${normalized.zoom}) translate(${tx.toFixed(3)}%, ${ty.toFixed(3)}%)`,
    transformOrigin: '50% 50%',
  };
}

/** Focus point for layout bubbles: tracked face when available, else the crop. */
export function focusAt(props: ClipProps, time: number): {x: number; y: number} {
  const keyframes = props.face?.keyframes;
  if (keyframes && keyframes.length > 0) {
    return faceAt(keyframes, time);
  }
  const crop = normalizeCrop(props.crop);
  return {x: crop.x, y: crop.y};
}

export function useIsFramesMode(props: ClipProps): boolean {
  return props.media?.mode === 'frames' && Boolean(props.media.frames?.mainPrefix);
}

/** Interpolates the tracked face position at a clip-relative time. */
export function faceAt(keyframes: FaceKeyframe[] | undefined, time: number): {x: number; y: number} {
  if (!keyframes || keyframes.length === 0) {
    return {x: 0.5, y: 0.5};
  }
  if (time <= keyframes[0].t) {
    return {x: keyframes[0].x, y: keyframes[0].y};
  }
  const last = keyframes[keyframes.length - 1];
  if (time >= last.t) {
    return {x: last.x, y: last.y};
  }
  for (let index = 0; index < keyframes.length - 1; index++) {
    const current = keyframes[index];
    const next = keyframes[index + 1];
    if (time >= current.t && time <= next.t) {
      const progress = (time - current.t) / Math.max(0.0001, next.t - current.t);
      return {
        x: current.x + (next.x - current.x) * progress,
        y: current.y + (next.y - current.y) * progress,
      };
    }
  }
  return {x: 0.5, y: 0.5};
}

/**
 * The unmodified source frame, letterboxed by CSS. Layout decides cropping,
 * so preview and render share the exact same geometry.
 */
export const MainMedia: React.FC<{
  props: ClipProps;
  style?: React.CSSProperties;
  muted?: boolean;
}> = ({props, style, muted}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const framesMode = useIsFramesMode(props);
  const frames = props.media?.frames;
  const crop = cropTransform(props.crop);
  const inner: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    ...style,
    ...crop,
  };

  return (
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>
      {framesMode && frames ? (
        <Img src={frameSrc(frames.mainPrefix, frame, frames.extension, frames.digits)} style={inner} />
      ) : (
        <Video
          src={resolveSrc(props.source.url)}
          startFrom={Math.round(props.clip.start * fps)}
          endAt={Math.round(props.clip.end * fps)}
          muted={muted}
          style={inner}
        />
      )}
    </div>
  );
};

/**
 * A zoomed crop of the source around `focus` (0..1). Used for facecam bubbles
 * and cam overlays. The crop is computed from the real source aspect ratio, so
 * preview and render frame the same pixels. In frames mode the face region is
 * pre-cropped by FFmpeg, so no zoom math is needed.
 */
export const FocusMedia: React.FC<{
  props: ClipProps;
  focus: {x: number; y: number};
  zoom?: number;
  width: number;
  height: number;
  style?: React.CSSProperties;
  rounded?: number;
}> = ({props, focus, zoom = 2.4, width, height, style, rounded = 0}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const frames = props.media?.frames;
  const framesMode = useIsFramesMode(props);
  const crop = normalizeCrop(props.crop);
  // The bubble already zooms in, so only follow a little of the manual crop
  // zoom. Otherwise a 180% crop turns the bubble into a tiny patch of skin.
  const cropBoost = 1 + (crop.zoom - 1) * 0.4;
  const totalZoom = Math.max(1, zoom * cropBoost);

  const shell: React.CSSProperties = {
    position: 'relative',
    width,
    height,
    overflow: 'hidden',
    borderRadius: rounded,
    ...style,
  };

  if (framesMode && frames?.facePrefix) {
    return (
      <div style={shell}>
        <Img
          src={frameSrc(frames.facePrefix, frame, frames.extension, frames.digits)}
          style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}}
        />
      </div>
    );
  }

  // Cover-fit the source inside the bubble, then zoom around the focus point.
  const coverScale = Math.max(width / props.source.width, height / props.source.height);
  const displayWidth = props.source.width * coverScale * totalZoom;
  const displayHeight = props.source.height * coverScale * totalZoom;
  const left = Math.min(0, Math.max(width - displayWidth, -(focus.x * displayWidth - width / 2)));
  const top = Math.min(0, Math.max(height - displayHeight, -(focus.y * displayHeight - height / 2)));

  const inner: React.CSSProperties = {
    position: 'absolute',
    left,
    top,
    width: displayWidth,
    height: displayHeight,
    maxWidth: 'none',
  };

  return (
    <div style={shell}>
      {framesMode && frames ? (
        <Img src={frameSrc(frames.mainPrefix, frame, frames.extension, frames.digits)} style={inner} />
      ) : (
        <Video
          src={resolveSrc(props.source.url)}
          startFrom={Math.round(props.clip.start * fps)}
          endAt={Math.round(props.clip.end * fps)}
          muted
          style={inner}
        />
      )}
    </div>
  );
};

/**
 * OverlayBubble for custom_overlay layout: a single facecam box/circle with its
 * own crop and size.
 */
export const OverlayBubble: React.FC<{
  props: ClipProps;
  overlay: OverlaySettings;
}> = ({props, overlay}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const frames = props.media?.frames;
  const framesMode = useIsFramesMode(props);
  const crop = normalizeCrop(overlay.crop);
  const width = Math.round(props.canvas.width * overlay.size);
  const height = Math.round(width * 0.75);
  const left = Math.round(props.canvas.width * overlay.x - width / 2);
  const top = Math.round(props.canvas.height * overlay.y - height / 2);
  const radius =
    overlay.shape === 'circle'
      ? width / 2
      : overlay.shape === 'rounded'
      ? Math.round(width * 0.12)
      : 0;

  const shell: React.CSSProperties = {
    position: 'absolute',
    left,
    top,
    width,
    height,
    overflow: 'hidden',
    borderRadius: radius,
    border: '2px solid rgba(255,255,255,0.6)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    backgroundColor: '#000',
  };

  const sourceUrl = overlay.source_url || props.source.url;
  const framePrefix = overlay.framePrefix;

  const coverScale = Math.max(width / props.source.width, height / props.source.height);
  const totalZoom = Math.max(1, crop.zoom);
  const displayWidth = props.source.width * coverScale * totalZoom;
  const displayHeight = props.source.height * coverScale * totalZoom;
  const inner: React.CSSProperties = {
    position: 'absolute',
    left: Math.min(0, Math.max(width - displayWidth, -(crop.x * displayWidth - width / 2))),
    top: Math.min(0, Math.max(height - displayHeight, -(crop.y * displayHeight - height / 2))),
    width: displayWidth,
    height: displayHeight,
  };

  return (
    <div style={shell}>
      {framesMode && (framePrefix || frames) ? (
        <Img
          src={frameSrc((framePrefix || frames!.mainPrefix), frame, (frames?.extension || '.jpg'), (frames?.digits || 4))}
          style={inner}
        />
      ) : (
        <Video
          src={resolveSrc(sourceUrl)}
          startFrom={Math.round(props.clip.start * fps)}
          endAt={Math.round(props.clip.end * fps)}
          muted
          style={inner}
        />
      )}
    </div>
  );
};
