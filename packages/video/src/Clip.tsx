import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {ClipProps} from './types';
import {CaptionLayer} from './captions/CaptionLayer';
import {ClipLayout} from './layouts/Layouts';
import {OverlayBubble} from './media';

/**
 * Single composition used by both the in-app preview (`@remotion/player`)
 * and the renderer (Remotion CLI/renderer). Captions, layouts and timing must
 * stay identical between the two, so nothing here is environment specific.
 */
export const ClipComposition: React.FC<ClipProps> = (props) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const time = frame / fps;

  return (
    <AbsoluteFill style={{backgroundColor: '#08090b', overflow: 'hidden'}}>
      <ClipLayout props={props} time={time} />
      {(props.overlays || []).map((overlay) => (
        <OverlayBubble key={overlay.id || `${overlay.x}-${overlay.y}`} props={props} overlay={overlay} />
      ))}
      <CaptionLayer
        words={props.words}
        template={props.caption.template}
        font={props.caption.font}
        accent={props.caption.accent}
        canvas={props.canvas}
        time={time}
        enabled={props.caption.enabled}
      />
    </AbsoluteFill>
  );
};

export function clipDurationInFrames(props: ClipProps): number {
  const fps = props.canvas.fps || 30;
  const seconds = Math.max(0.5, props.clip.end - props.clip.start);
  return Math.max(1, Math.round(seconds * fps));
}
