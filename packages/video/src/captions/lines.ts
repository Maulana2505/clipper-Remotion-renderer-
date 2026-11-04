import type {Word} from '../types';

const MAX_WORDS_PER_LINE = 4;
const MAX_GAP_SECONDS = 0.55;

/**
 * Groups words into caption lines that respect speech rhythm.
 * Index chunking (every N words) breaks sentences apart, so lines also
 * break on long pauses and sentence/clause punctuation.
 */
export function buildLines(words: Word[]): Word[][] {
  const lines: Word[][] = [];
  let current: Word[] = [];
  const hasLineIds = words.some((word) => typeof word.line === "number");

  const flush = () => {
    if (current.length > 0) {
      lines.push(current);
      current = [];
    }
  };

  for (const word of words) {
    if (hasLineIds) {
      if (current.length > 0 && current[0].line !== word.line) {
        flush();
      }
      current.push(word);
      continue;
    }
    if (current.length > 0) {
      const previous = current[current.length - 1];
      const gap = word.start - previous.end;
      const endsSentence = /[.!?]$/.test(previous.word);
      const endsClause = /[,;:]$/.test(previous.word) && current.length >= 3;
      if (current.length >= MAX_WORDS_PER_LINE || gap > MAX_GAP_SECONDS || endsSentence || endsClause) {
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

export type ActiveCaption = {
  line: Word[];
  /** Index of the currently spoken word inside `line`, or -1. */
  active: number;
  /** Start time of the line, in clip-relative seconds. */
  start: number;
};

export function activeCaption(words: Word[], time: number): ActiveCaption | null {
  if (!words.length) {
    return null;
  }
  for (const line of buildLines(words)) {
    const start = line[0].start - 0.12;
    const end = line[line.length - 1].end + 0.35;
    if (time < start || time > end) {
      continue;
    }
    let active = -1;
    for (let index = 0; index < line.length; index++) {
      if (time >= line[index].start - 0.02 && time <= line[index].end + 0.02) {
        active = index;
        break;
      }
    }
    return {line, active, start: line[0].start};
  }
  return null;
}
