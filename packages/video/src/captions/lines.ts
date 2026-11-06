import type {Word} from '../types';
import {DEFAULT_CAPTION_LAYOUT, type CaptionLayout} from '../types';

export function buildLines(words: Word[], wordsPerLine: number = 4): Word[][] {
  const maxWords = Math.max(2, Math.min(6, wordsPerLine || 4));
  const lines: Word[][] = [];
  let current: Word[] = [];

  for (const word of words) {
    if (current.length > 0) {
      const previous = current[current.length - 1];
      const gap = word.start - previous.end;
      const endsSentence = /[.!?]$/.test(previous.word);
      const endsClause = /[,;:]$/.test(previous.word) && current.length >= 3;
      if (current.length >= maxWords || gap > MAX_GAP_SECONDS || endsSentence || endsClause) {
        lines.push(current);
        current = [];
      }
    }
    current.push(word);
  }

  if (current.length > 0) {
    lines.push(current);
  }
  return lines;
}

const MAX_GAP_SECONDS = 0.55;

export type ActiveCaption = {
  lines: Word[][];
  /** Index of the active line within the page. */
  activeLine: number;
  /** Index of the active word within the active line, or -1. */
  activeWord: number;
  /** Start time of the page. */
  start: number;
};

export function captionBlock(words: Word[], time: number, layout?: Partial<CaptionLayout>): ActiveCaption | null {
  if (!words.length) return null;
  const l = { ...DEFAULT_CAPTION_LAYOUT, ...(layout || {}) };
  const allLines = buildLines(words, l.words_per_line);
  if (!allLines.length) return null;

  // find active word index across all words
  let activeLineIdx = -1;
  let activeWordIdx = -1;
  for (let li = 0; li < allLines.length; li++) {
    const line = allLines[li];
    const start = line[0].start - 0.12;
    const end = line[line.length - 1].end + 0.35;
    if (time < start || time > end) continue;
    activeLineIdx = li;
    for (let wi = 0; wi < line.length; wi++) {
      if (time >= line[wi].start - 0.02 && time <= line[wi].end + 0.02) {
        activeWordIdx = wi;
        break;
      }
    }
    break;
  }

  if (activeLineIdx < 0) {
    // keep last page if within trailing window
    const last = allLines[allLines.length - 1];
    if (time > last[last.length - 1].end + 0.35) return null;
    activeLineIdx = Math.max(0, allLines.length - 1);
  }

  const n = Math.max(1, Math.min(3, l.lines_on_screen));
  // page start: align to multiples so blocks don't overlap oddly
  const pageStart = Math.floor(activeLineIdx / n) * n;
  const pageLines = allLines.slice(pageStart, pageStart + n);
  if (!pageLines.length) return null;

  return {
    lines: pageLines,
    activeLine: activeLineIdx - pageStart,
    activeWord: activeWordIdx,
    start: pageLines[0][0].start,
  };
}

// backwards compat: activeCaption now uses captionBlock with default layout
export function activeCaption(words: Word[], time: number): ActiveCaption | null {
  return captionBlock(words, time, DEFAULT_CAPTION_LAYOUT);
}
