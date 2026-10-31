import React, {useMemo} from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {CaptionId, CanvasSpec, FontId, Word} from '../types';
import {safeAreaOf} from '../types';
import {fontFamilyOf} from '../fonts';
import {activeCaption} from './lines';

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
}> = ({words, template, font, accent, canvas, time, enabled}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const current = useMemo(() => activeCaption(words, time), [words, time]);

  if (!enabled || template === 'none' || !current) {
    return null;
  }

  const safe = safeAreaOf(canvas);
  const fontSize = Math.max(28, Math.min(canvas.width, canvas.height) * 0.062);
  const spec = resolveSpec(template, accent, fontSize);
  const size = fontSize * spec.fontSizeScale;
  const startFrame = Math.round(current.start * fps);
  const linePop = spring({frame: frame - startFrame, fps, config: {damping: 12, stiffness: 220}});
  const wordPop = spring({frame: frame - startFrame, fps, config: {damping: 9, stiffness: 260}});
  const visible = spec.typewriter && current.active >= 0 ? current.line.slice(0, current.active + 1) : current.line;

  const containerStyle: React.CSSProperties = {
    fontFamily: fontFamilyOf(font),
    fontSize: size,
    fontWeight: 800,
    lineHeight: 1.06,
    textAlign: 'center',
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
        left: canvas.width * Math.max(safe.left, 0.04),
        right: canvas.width * Math.max(safe.right, 0.04),
        bottom: canvas.height * safe.bottom,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          ...containerStyle,
          transform: spec.linePop ? `scale(${0.9 + linePop * 0.1})` : undefined,
        }}
      >
        {visible.map((word, index) => {
          const isActive = index === current.active;
          const wordStyle: React.CSSProperties = {
            display: 'inline-block',
            marginRight: '0.24em',
            ...spec.word,
            ...(isActive ? spec.active : undefined),
          };
          if (spec.activePop && isActive) {
            wordStyle.transform = `scale(${1 + wordPop * 0.08})`;
          }
          return (
            <span key={`${word.word}-${index}`} style={wordStyle}>
              {word.word}
            </span>
          );
        })}
      </div>
    </div>
  );
};
