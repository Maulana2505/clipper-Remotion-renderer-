import React, {useMemo} from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {CaptionId, CaptionLayout, CanvasSpec, FontId, Word} from '../types';
import {captionLayoutOf, safeAreaOf} from '../types';
import {fontFamilyOf} from '../fonts';
import {captionBlock} from './lines';

type Spec = {
  fontSizeScale: number;
  uppercase: boolean;
  word: React.CSSProperties;
  active?: React.CSSProperties;
  container?: React.CSSProperties;
  /** Reveal words only up to the active one. */
  typewriter?: boolean;
  /** Pop the whole line when it appears. */
  linePop?: boolean;
  /** Pop the active word. */
  activePop?: boolean;
};

function withStroke(color: string, widthPx: number, rest: React.CSSProperties = {}): React.CSSProperties {
  if (widthPx <= 0) {
    return rest;
  }
  return {
    ...rest,
    WebkitTextStroke: `${widthPx}px ${color}`,
    paintOrder: 'stroke fill',
  };
}

function resolveSpec(template: CaptionId, accent: string, fontSize: number): Spec {
  const stroke = Math.round(fontSize * 0.085);
  const shadow = `0 ${Math.round(fontSize * 0.06)}px ${Math.round(fontSize * 0.12)}px rgba(0,0,0,0.85)`;

  switch (template) {
    case 'plain_white':
      return {
        fontSizeScale: 1,
        uppercase: true,
        word: {...withStroke('#000', Math.round(fontSize * 0.05)), textShadow: shadow},
      };
    case 'glow_neon':
      return {
        fontSizeScale: 1,
        uppercase: true,
        word: {
          color: accent,
          textShadow: `0 0 ${fontSize * 0.18}px ${accent}, 0 0 ${fontSize * 0.5}px ${accent}88, ${shadow}`,
        },
      };
    case 'neon_blue':
      return {
        fontSizeScale: 1,
        uppercase: true,
        word: {
          color: '#00e5ff',
          textShadow: `0 0 ${fontSize * 0.18}px #00e5ff, 0 0 ${fontSize * 0.5}px #00e5ff77, ${shadow}`,
        },
      };
    case 'subtract_box':
      return {
        fontSizeScale: 1,
        uppercase: true,
        word: {color: '#ffffff', textShadow: shadow},
        container: {
          background: 'rgba(0,0,0,0.68)',
          borderRadius: Math.round(fontSize * 0.22),
          padding: `${fontSize * 0.16}px ${fontSize * 0.42}px`,
        },
      };
    case 'karaoke_highlight':
      return {
        fontSizeScale: 1,
        uppercase: true,
        word: {...withStroke('#000', stroke), textShadow: shadow},
        active: {color: accent},
      };
    case 'bold_outline':
      return {
        fontSizeScale: 1,
        uppercase: true,
        word: {...withStroke('#000', Math.round(fontSize * 0.14)), textShadow: shadow},
      };
    case 'minimal_lower':
      return {
        fontSizeScale: 0.66,
        uppercase: false,
        word: {fontWeight: 600, textShadow: `0 2px 12px rgba(0,0,0,0.95)`},
      };
    case 'gradient_pop':
      return {
        fontSizeScale: 1,
        uppercase: true,
        word: {textShadow: 'none'},
        container: {
          backgroundImage: 'linear-gradient(90deg,#ff7a00,#ffd400,#00e5ff)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.9))',
        },
        linePop: true,
      };
    case 'typewriter':
      return {
        fontSizeScale: 1,
        uppercase: true,
        word: {...withStroke('#000', Math.round(fontSize * 0.06)), textShadow: shadow},
        typewriter: true,
      };
    case 'bounce_word':
      return {
        fontSizeScale: 1,
        uppercase: true,
        word: {...withStroke('#000', stroke), textShadow: shadow},
        activePop: true,
      };
    case 'yellow_highlight':
      return {
        fontSizeScale: 1,
        uppercase: true,
        word: {color: '#111111'},
        container: {
          background: '#ffff00',
          borderRadius: Math.round(fontSize * 0.12),
          padding: `${fontSize * 0.1}px ${fontSize * 0.34}px`,
        },
      };
    case 'accent_pop':
      return {
        fontSizeScale: 1.04,
        uppercase: true,
        word: {...withStroke('#000', stroke), textShadow: shadow},
        active: {
          color: accent,
          textShadow: `0 0 ${fontSize * 0.6}px ${accent}66, ${shadow}`,
        },
        activePop: true,
        linePop: true,
      };
    case 'accent_highlight':
      return {
        fontSizeScale: 1,
        uppercase: true,
        word: {...withStroke('#000', stroke), textShadow: shadow},
        active: {
          color: accent,
          textShadow: `0 0 ${fontSize * 0.5}px ${accent}55, ${shadow}`,
        },
        activePop: true,
        linePop: true,
      };
    case 'none':
    default:
      return {fontSizeScale: 1, uppercase: true, word: {}};
  }
}

export const CaptionLayer: React.FC<{
  words: Word[];
  template: CaptionId;
  font: FontId;
  accent: string;
  canvas: CanvasSpec;
  /** Clip-relative time in seconds. */
  time: number;
  enabled: boolean;
  layout?: Partial<CaptionLayout>;
}> = ({words, template, font, accent, canvas, time, enabled, layout}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const block = useMemo(() => captionBlock(words, time, layout), [words, time, layout]);

  if (!enabled || template === 'none' || !block) {
    return null;
  }

  const safe = safeAreaOf(canvas);
  const fontSize = Math.max(28, Math.min(canvas.width, canvas.height) * 0.062);
  const spec = resolveSpec(template, accent, fontSize);
  const startFrame = Math.round(block.start * fps);
  const linePop = spring({frame: frame - startFrame, fps, config: {damping: 12, stiffness: 220}});
  const wordPop = spring({frame: frame - startFrame, fps, config: {damping: 9, stiffness: 260}});
  const visibleLines = block.lines;

  const lay = captionLayoutOf(layout);
  const size = fontSize * spec.fontSizeScale * lay.font_scale;
  const maxWFrac = 1 - safe.left - safe.right;
  const wFrac = Math.min(lay.width, maxWFrac);
  const leftFrac =
    lay.align === 'left' ? safe.left :
    lay.align === 'right' ? 1 - safe.right - wFrac :
    (1 - wFrac) / 2;
  const alignItems =
    lay.align === 'left' ? 'flex-start' :
    lay.align === 'right' ? 'flex-end' : 'center';
  const textAlign = lay.align;

  const containerStyle: React.CSSProperties = {
    fontFamily: fontFamilyOf(font),
    fontSize: size,
    fontWeight: 800,
    lineHeight: 1.06,
    textAlign,
    color: '#ffffff',
    textTransform: spec.uppercase ? 'uppercase' : 'none',
    letterSpacing: '0.01em',
    padding: `${size * 0.06}px ${size * 0.18}px`,
    ...spec.container,
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: canvas.width * leftFrac,
        width: canvas.width * wFrac,
        top: canvas.height * lay.y,
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems,
        gap: size * lay.line_gap,
        pointerEvents: 'none',
      }}
    >
      {visibleLines.map((line, li) => {
        const isLineActive = li === block.activeLine;
        let visibleWords = line;
        if (spec.typewriter) {
          if (li < block.activeLine) visibleWords = line;
          else if (li === block.activeLine) {
            visibleWords = block.activeWord >= 0 ? line.slice(0, block.activeWord + 1) : [];
          } else {
            visibleWords = [];
          }
        }
        if (visibleWords.length === 0) return null;
        const lineStartFrame = Math.round(line[0].start * fps);
        const pop = spec.linePop ? spring({frame: frame - lineStartFrame, fps, config: {damping: 12, stiffness: 220}}) : 1;
        return (
          <div
            key={li}
            style={{
              ...containerStyle,
              transform: spec.linePop ? `scale(${0.9 + pop * 0.1})` : undefined,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: lay.align === 'left' ? 'flex-start' : lay.align === 'right' ? 'flex-end' : 'center',
            }}
          >
            {visibleWords.map((word, index) => {
              const isActive = isLineActive && index === block.activeWord;
              const wordStyle: React.CSSProperties = {
                display: 'inline-block',
                marginRight: '0.24em',
                ...spec.word,
                ...(isActive ? spec.active : undefined),
              };
              if (spec.activePop && isActive) {
                const wp = spring({frame: frame - startFrame, fps, config: {damping: 9, stiffness: 260}});
                wordStyle.transform = `scale(${1 + wp * 0.08})`;
              }
              return (
                <span key={`${word.word}-${index}`} style={wordStyle}>
                  {word.word}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
