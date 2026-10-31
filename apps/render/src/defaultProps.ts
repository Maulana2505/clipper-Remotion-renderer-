import type {ClipProps} from '@clipper/video';

/** Defaults used by Remotion Studio; real renders always pass props.json. */
export const defaultClipProps: ClipProps = {
  canvas: {width: 1080, height: 1920, fps: 30},
  clip: {start: 0, end: 10},
  source: {url: '', width: 1920, height: 1080},
  layout: 'gaming_hud',
  caption: {enabled: true, template: 'accent_highlight', font: 'anton', accent: '#CCFF00'},
  words: [],
  face: {keyframes: [{t: 0, x: 0.5, y: 0.5}]},
  meta: {title: 'Clip', badge: 'CLUTCH'},
};
