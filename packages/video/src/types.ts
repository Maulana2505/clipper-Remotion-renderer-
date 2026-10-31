export type SafeArea = {top: number; right: number; bottom: number; left: number};

export type CanvasSpec = {
  id?: string;
  width: number;
  height: number;
  fps: number;
  safe_area?: SafeArea;
};

export type Word = {word: string; start: number; end: number};

export type FaceKeyframe = {t: number; x: number; y: number};

export type LayoutId =
  // Legacy templates
  | 'auto_crop'
  | 'center_crop'
  | 'blur_bg'
  | 'framed'
  | 'split_top_bottom'
  | 'cam_overlay'
  | 'letterbox_title'
  | 'hook_intro'
  | 'progress_bar'
  | 'minimal_frame'
  // Niche layouts
  | 'gaming_hud'
  | 'football_scoreboard'
  | 'duo_split'
  | 'lower_third';

export type CaptionId =
  | 'none'
  | 'plain_white'
  | 'glow_neon'
  | 'subtract_box'
  | 'karaoke_highlight'
  | 'bold_outline'
  | 'minimal_lower'
  | 'gradient_pop'
  | 'typewriter'
  | 'bounce_word'
  | 'neon_blue'
  | 'yellow_highlight'
  | 'accent_pop'
  | 'accent_highlight';

export type FontId =
  | 'anton'
  | 'oswald'
  | 'inter'
  | 'montserrat'
  | 'pinyon'
  | 'eb_garamond'
  | 'bebas_neue'
  | 'archivo_black';

export type Niche = 'gaming' | 'football' | 'podcast' | 'education' | 'generic';

/** Frame-sequence mode: video frames are pre-extracted by FFmpeg. */
export type FrameSequence = {
  /** Prefix without the numeric suffix, e.g. "frames/main-". */
  mainPrefix: string;
  /** Optional pre-cropped face region, e.g. "frames/face-". */
  facePrefix?: string;
  /** File extension including dot. Defaults to ".jpg". */
  extension?: string;
  /** Zero padding for the frame number. Defaults to 4. */
  digits?: number;
};

export type MediaSpec = {
  mode: 'video' | 'frames';
  frames?: FrameSequence;
};

export type ClipMeta = {
  title?: string | null;
  badge?: string | null;
  /** Football */
  teams?: {home: string; away: string};
  score?: {home: number; away: number};
  minute?: string;
  competition?: string;
  /** Podcast / education */
  speaker?: string;
  topic?: string;
};

export type ClipProps = {
  canvas: CanvasSpec;
  clip: {start: number; end: number};
  source: {url: string; width: number; height: number};
  media?: MediaSpec;
  layout: LayoutId;
  caption: {template: CaptionId; font: FontId; accent: string; enabled: boolean};
  words: Word[];
  face?: {keyframes: FaceKeyframe[]};
  meta?: ClipMeta;
};

export const DEFAULT_SAFE_AREA: SafeArea = {top: 0.08, right: 0.12, bottom: 0.15, left: 0.05};

export function safeAreaOf(canvas: CanvasSpec): SafeArea {
  return canvas.safe_area ?? DEFAULT_SAFE_AREA;
}

export function clipDurationSeconds(props: Pick<ClipProps, 'clip'>): number {
  return Math.max(0.1, props.clip.end - props.clip.start);
}
