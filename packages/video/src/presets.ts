import type {CaptionId, FontId, LayoutId, Niche} from './types';

export type NichePreset = {
  label: string;
  layout: LayoutId;
  caption: CaptionId;
  font: FontId;
  accent: string;
  badgeExamples: string[];
};

/** Starting point per niche; every field stays overridable per clip. */
export const NICHE_PRESETS: Record<Niche, NichePreset> = {
  gaming: {
    label: 'Gaming',
    layout: 'gaming_hud',
    caption: 'accent_highlight',
    font: 'anton',
    accent: '#CCFF00',
    badgeExamples: ['CLUTCH', 'JUMPSCARE', 'INSANE', 'GG'],
  },
  football: {
    label: 'Football',
    layout: 'football_scoreboard',
    caption: 'accent_pop',
    font: 'archivo_black',
    accent: '#FF4D00',
    badgeExamples: ['GOL', 'PENALTI', 'KARTU MERAH', 'SAVE'],
  },
  podcast: {
    label: 'Podcast / Reaction',
    layout: 'duo_split',
    caption: 'accent_highlight',
    font: 'archivo_black',
    accent: '#FFD400',
    badgeExamples: ['HOT TAKE', 'NGELAG', 'PLOT TWIST'],
  },
  education: {
    label: 'Education',
    layout: 'lower_third',
    caption: 'plain_white',
    font: 'inter',
    accent: '#00E5FF',
    badgeExamples: ['TIP', 'FAKTA', 'STEP 1'],
  },
  generic: {
    label: 'Generic',
    layout: 'auto_crop',
    caption: 'plain_white',
    font: 'anton',
    accent: '#CCFF00',
    badgeExamples: ['HIGHLIGHT'],
  },
};

export const LAYOUT_IDS: LayoutId[] = [
  'auto_crop',
  'center_crop',
  'blur_bg',
  'framed',
  'split_top_bottom',
  'cam_overlay',
  'letterbox_title',
  'hook_intro',
  'progress_bar',
  'minimal_frame',
  'gaming_hud',
  'football_scoreboard',
  'duo_split',
  'lower_third',
];

export const CAPTION_IDS: CaptionId[] = [
  'none',
  'plain_white',
  'glow_neon',
  'subtract_box',
  'karaoke_highlight',
  'bold_outline',
  'minimal_lower',
  'gradient_pop',
  'typewriter',
  'bounce_word',
  'neon_blue',
  'yellow_highlight',
  'accent_pop',
  'accent_highlight',
];
