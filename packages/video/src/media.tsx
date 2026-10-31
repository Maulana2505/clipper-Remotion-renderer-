import React from 'react';
import {Img, Video, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {ClipProps, FaceKeyframe} from './types';

export function resolveSrc(url: string): string {
  if (/^(https?:|data:|blob:)/i.test(url)) {
    return url;
  }
  return staticFile(url);
}

function frameSrc(prefix: string, frame: number, extension = '.jpg', digits = 4): string {
  return staticFile(`${prefix}${String(frame + 1).padStart(digits, '0')}${extension}`);
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

  if (framesMode && frames) {
    return (
      <Img
        src={frameSrc(frames.mainPrefix, frame, frames.extension, frames.digits)}
        style={{position: 'absolute', inset: 0, width: '100%', height: '100%', ...style}}
      />
    );
  }

  return (
    <Video
      src={resolveSrc(props.source.url)}
      startFrom={Math.round(props.clip.start * fps)}
      endAt={Math.round(props.clip.end * fps)}
      muted={muted}
      style={{position: 'absolute', inset: 0, width: '100%', height: '100%', ...style}}
    />
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
  const displayWidth = props.source.width * coverScale * zoom;
  const displayHeight = props.source.height * coverScale * zoom;
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
