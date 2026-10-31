import React from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {ClipMeta, ClipProps, CanvasSpec} from '../types';
import {safeAreaOf} from '../types';
import {fontFamilyOf} from '../fonts';
import {FocusMedia, MainMedia, faceAt} from '../media';

type LayoutProps = {
  props: ClipProps;
  /** Clip-relative time in seconds. */
  time: number;
};

const Badge: React.FC<{
  text?: string | null;
  accent: string;
  canvas: CanvasSpec;
  top: number;
  left?: number;
  right?: number;
  align?: 'left' | 'center';
  scale?: number;
}> = ({text, accent, canvas, top, left, right, align = 'left', scale = 1}) => {
  const label = text?.trim();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pop = spring({frame, fps, config: {damping: 14, stiffness: 190}});
  if (!label) {
    return null;
  }
  const fontSize = Math.round(Math.min(canvas.width, canvas.height) * 0.052 * scale);
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        right,
        display: 'flex',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        transform: `scale(${pop}) rotate(-2deg)`,
        transformOrigin: align === 'center' ? 'center top' : 'left top',
      }}
    >
      <div
        style={{
          fontFamily: fontFamilyOf('anton'),
          fontSize,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '#0b0b0b',
          backgroundColor: accent,
          padding: `${Math.round(fontSize * 0.22)}px ${Math.round(fontSize * 0.72)}px`,
          borderRadius: 999,
          boxShadow: '0 14px 34px rgba(0,0,0,0.5)',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
    </div>
  );
};

const ProgressBar: React.FC<{accent: string; canvas: CanvasSpec; heightScale?: number}> = ({
  accent,
  canvas,
  heightScale = 0.006,
}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const progress = Math.min(1, frame / Math.max(1, durationInFrames - 1));
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        bottom: 0,
        right: 0,
        height: Math.max(4, Math.round(canvas.height * heightScale)),
        background: 'rgba(255,255,255,0.14)',
      }}
    >
      <div style={{width: `${progress * 100}%`, height: '100%', background: accent}} />
    </div>
  );
};

const TopScrim: React.FC<{strength?: number}> = ({strength = 0.55}) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background: `linear-gradient(180deg, rgba(0,0,0,${strength}) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.55) 100%)`,
    }}
  />
);

const TitleText: React.FC<{
  title?: string | null;
  canvas: CanvasSpec;
  font: string;
  top: number;
  sizeScale: number;
}> = ({title, canvas, font, top, sizeScale}) => {
  if (!title) {
    return null;
  }
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: canvas.width * 0.07,
        right: canvas.width * 0.07,
        textAlign: 'center',
        color: '#ffffff',
        fontFamily: fontFamilyOf(font),
        fontSize: canvas.height * sizeScale,
        fontWeight: 800,
        textTransform: 'uppercase',
        textShadow: '0 6px 26px rgba(0,0,0,0.9)',
        lineHeight: 1.1,
      }}
    >
      {title}
    </div>
  );
};

/** Face bubble with accent ring, used by gaming/podcast layouts. */
const FaceBubble: React.FC<{
  props: ClipProps;
  time: number;
  accent: string;
  sizeScale: number;
  zoom: number;
  top: number;
  left: number;
}> = ({props, time, accent, sizeScale, zoom, top, left}) => {
  const {canvas} = props;
  const width = Math.round(canvas.width * sizeScale);
  const height = Math.round(width * 0.75);
  const face = faceAt(props.face?.keyframes, time);
  return (
    <FocusMedia
      props={props}
      focus={face}
      zoom={zoom}
      width={width}
      height={height}
      rounded={width * 0.09}
      style={{
        position: 'absolute',
        top,
        left,
        border: `6px solid ${accent}`,
        boxShadow: '0 16px 44px rgba(0,0,0,0.55)',
        backgroundColor: '#000',
      }}
    />
  );
};

const GamingHud: React.FC<LayoutProps> = ({props, time}) => {
  const {canvas, caption, meta} = props;
  const safe = safeAreaOf(canvas);
  const bubbleWidth = Math.round(canvas.width * 0.3);
  const margin = Math.round(canvas.width * 0.045);

  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <TopScrim />
      <FaceBubble
        props={props}
        time={time}
        accent={caption.accent}
        sizeScale={0.3}
        zoom={4}
        top={margin}
        left={margin}
      />
      <Badge
        text={meta?.badge}
        accent={caption.accent}
        canvas={canvas}
        top={margin + bubbleWidth * 0.15}
        left={margin + bubbleWidth + canvas.width * 0.02}
        right={margin}
      />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const scoreText = (meta: ClipMeta | undefined): string => {
  const home = meta?.score?.home ?? 0;
  const away = meta?.score?.away ?? 0;
  return `${home} - ${away}`;
};

const FootballScoreboard: React.FC<LayoutProps> = ({props}) => {
  const {canvas, caption, meta} = props;
  const width = Math.round(canvas.width * 0.88);
  const fontSize = Math.round(Math.min(canvas.width, canvas.height) * 0.05);
  const home = (meta?.teams?.home ?? 'HOME').toUpperCase();
  const away = (meta?.teams?.away ?? 'AWAY').toUpperCase();
  const competition = meta?.competition?.toUpperCase();
  const minute = meta?.minute;

  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <TopScrim strength={0.45} />
      <div
        style={{
          position: 'absolute',
          top: Math.round(canvas.height * 0.05),
          left: Math.round((canvas.width - width) / 2),
          width,
          borderRadius: Math.round(fontSize * 0.28),
          overflow: 'hidden',
          boxShadow: '0 18px 44px rgba(0,0,0,0.55)',
          fontFamily: fontFamilyOf('archivo_black'),
        }}
      >
        {competition ? (
          <div
            style={{
              background: caption.accent,
              color: '#0b0b0b',
              fontSize: Math.round(fontSize * 0.42),
              letterSpacing: '0.14em',
              textAlign: 'center',
              padding: `${Math.round(fontSize * 0.14)}px 0`,
            }}
          >
            {competition}
          </div>
        ) : null}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: Math.round(fontSize * 0.3),
            background: 'rgba(8,9,11,0.86)',
            padding: `${Math.round(fontSize * 0.34)}px ${Math.round(fontSize * 0.55)}px`,
          }}
        >
          <div style={{flex: 1, color: '#fff', fontSize, textAlign: 'left'}}>{home}</div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: Math.round(fontSize * 0.25),
            }}
          >
            <div style={{color: '#fff', fontSize: Math.round(fontSize * 1.25), letterSpacing: '0.02em'}}>
              {scoreText(meta)}
            </div>
            {minute ? (
              <div
                style={{
                  background: caption.accent,
                  color: '#0b0b0b',
                  fontSize: Math.round(fontSize * 0.5),
                  padding: `${Math.round(fontSize * 0.1)}px ${Math.round(fontSize * 0.28)}px`,
                  borderRadius: 999,
                }}
              >
                {minute}
              </div>
            ) : null}
          </div>
          <div style={{flex: 1, color: '#fff', fontSize, textAlign: 'right'}}>{away}</div>
        </div>
      </div>
      <Badge
        text={meta?.badge}
        accent={caption.accent}
        canvas={canvas}
        top={Math.round(canvas.height * 0.185)}
        align="center"
      />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const DuoSplit: React.FC<LayoutProps> = ({props}) => {
  const {canvas, caption, meta} = props;
  const paneHeight = Math.round(canvas.height * 0.5);
  const labelSize = Math.round(Math.min(canvas.width, canvas.height) * 0.038);

  const labels = [meta?.teams?.home, meta?.teams?.away];
  const showLabels = labels.some(Boolean);

  const pane = (position: '0% 50%' | '100% 50%', top: number) => (
    <div style={{position: 'absolute', left: 0, right: 0, top, height: paneHeight, overflow: 'hidden'}}>
      <MainMedia props={props} muted style={{objectFit: 'cover', objectPosition: position}} />
    </div>
  );

  return (
    <>
      {pane('0% 50%', 0)}
      {pane('100% 50%', paneHeight)}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: paneHeight - Math.max(3, Math.round(canvas.height * 0.004)),
          height: Math.max(6, Math.round(canvas.height * 0.008)),
          background: caption.accent,
        }}
      />
      {showLabels ? (
        <>
          {labels.map((label, index) =>
            label ? (
              <div
                key={`${label}-${index}`}
                style={{
                  position: 'absolute',
                  top: index === 0 ? Math.round(canvas.height * 0.04) : paneHeight + Math.round(canvas.height * 0.04),
                  left: Math.round(canvas.width * 0.05),
                  fontFamily: fontFamilyOf('archivo_black'),
                  fontSize: labelSize,
                  color: '#0b0b0b',
                  background: caption.accent,
                  padding: `${Math.round(labelSize * 0.22)}px ${Math.round(labelSize * 0.6)}px`,
                  borderRadius: 10,
                  textTransform: 'uppercase',
                }}
              >
                {label}
              </div>
            ) : null,
          )}
        </>
      ) : null}
      <Badge
        text={meta?.badge}
        accent={caption.accent}
        canvas={canvas}
        top={Math.round(canvas.height * 0.04)}
        right={Math.round(canvas.width * 0.05)}
      />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const LowerThird: React.FC<LayoutProps> = ({props}) => {
  const {canvas, caption, meta} = props;
  const width = Math.round(canvas.width * 0.8);
  const nameSize = Math.round(Math.min(canvas.width, canvas.height) * 0.055);
  const topicSize = Math.round(nameSize * 0.55);
  const hasSpeaker = Boolean(meta?.speaker || meta?.topic);

  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <TopScrim strength={0.4} />
      {hasSpeaker ? (
        <div
          style={{
            position: 'absolute',
            left: Math.round(canvas.width * 0.06),
            bottom: Math.round(canvas.height * 0.32),
            width,
            display: 'flex',
            overflow: 'hidden',
            borderRadius: Math.round(nameSize * 0.18),
            boxShadow: '0 18px 44px rgba(0,0,0,0.55)',
            fontFamily: fontFamilyOf('archivo_black'),
          }}
        >
          <div style={{width: Math.round(nameSize * 0.32), background: caption.accent}} />
          <div
            style={{
              flex: 1,
              background: 'rgba(8,9,11,0.88)',
              padding: `${Math.round(topicSize * 0.55)}px ${Math.round(topicSize * 0.9)}px`,
            }}
          >
            {meta?.speaker ? (
              <div
                style={{
                  color: '#ffffff',
                  fontSize: nameSize,
                  lineHeight: 1.1,
                  textTransform: 'uppercase',
                }}
              >
                {meta.speaker}
              </div>
            ) : null}
            {meta?.topic ? (
              <div
                style={{
                  color: caption.accent,
                  fontSize: topicSize,
                  lineHeight: 1.3,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {meta.topic}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <Badge
        text={meta?.badge}
        accent={caption.accent}
        canvas={canvas}
        top={Math.round(canvas.height * 0.05)}
        align="center"
      />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const LegacyLayout: React.FC<LayoutProps> = ({props, time}) => {
  const {canvas, layout, meta, caption} = props;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const face = faceAt(props.face?.keyframes, time);
  const objectPosition = `${face.x * 100}% ${face.y * 100}%`;
  const titleTop = canvas.height * 0.06;

  switch (layout) {
    case 'blur_bg':
      return (
        <>
          <MainMedia
            props={props}
            muted
            style={{objectFit: 'cover', filter: 'blur(28px) brightness(0.55)', transform: 'scale(1.1)'}}
          />
          <MainMedia props={props} style={{objectFit: 'contain'}} />
        </>
      );
    case 'framed':
      return (
        <>
          <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(135deg,#16161a,#0c0c0e)'}} />
          <MainMedia props={props} style={{objectFit: 'contain', inset: 24}} />
          <div
            style={{
              position: 'absolute',
              inset: 16,
              border: `2px solid ${caption.accent}8c`,
              pointerEvents: 'none',
            }}
          />
        </>
      );
    case 'split_top_bottom': {
      const half = Math.round(canvas.height / 2);
      return (
        <>
          <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: half, overflow: 'hidden'}}>
            <MainMedia props={props} style={{objectFit: 'cover', objectPosition: `50% 0%`}} />
          </div>
          <div style={{position: 'absolute', left: 0, right: 0, top: half, height: canvas.height - half, overflow: 'hidden'}}>
            <MainMedia props={props} muted style={{objectFit: 'cover', objectPosition: `50% 100%`}} />
          </div>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: half - 2,
              height: 4,
              background: caption.accent,
            }}
          />
        </>
      );
    }
    case 'cam_overlay': {
      const width = Math.round(canvas.width * 0.32);
      const height = Math.round(width * 0.75);
      return (
        <>
          <MainMedia props={props} style={{objectFit: 'cover', objectPosition}} />
          <FocusMedia
            props={props}
            focus={face}
            zoom={2.6}
            width={width}
            height={height}
            rounded={width * 0.08}
            style={{
              position: 'absolute',
              left: Math.round(canvas.width * 0.05),
              bottom: Math.round(canvas.height * 0.24),
              border: `5px solid ${caption.accent}`,
              boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
              backgroundColor: '#000',
            }}
          />
        </>
      );
    }
    case 'letterbox_title':
      return (
        <>
          <MainMedia props={props} style={{objectFit: 'contain'}} />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(180deg,rgba(0,0,0,0.92),transparent 22%,transparent 78%,rgba(0,0,0,0.9))',
            }}
          />
          <TitleText title={meta?.title} canvas={canvas} font={props.caption.font} top={titleTop} sizeScale={0.052} />
        </>
      );
    case 'hook_intro': {
      const isIntro = frame < fps * 1.5;
      return (
        <>
          <MainMedia props={props} style={{objectFit: 'cover', objectPosition}} />
          {isIntro ? (
            <>
              <div style={{position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.58)'}} />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: canvas.width * 0.09,
                }}
              >
                <div
                  style={{
                    textAlign: 'center',
                    color: '#ffffff',
                    fontFamily: fontFamilyOf(props.caption.font),
                    fontSize: canvas.height * 0.06,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    textShadow: '0 8px 28px rgba(0,0,0,0.9)',
                    lineHeight: 1.12,
                  }}
                >
                  {meta?.title}
                </div>
              </div>
            </>
          ) : null}
        </>
      );
    }
    case 'progress_bar':
      return (
        <>
          <MainMedia props={props} style={{objectFit: 'cover', objectPosition}} />
          <ProgressBar accent={caption.accent} canvas={canvas} heightScale={0.005} />
        </>
      );
    case 'minimal_frame':
      return (
        <>
          <MainMedia props={props} style={{objectFit: 'cover'}} />
          <div
            style={{
              position: 'absolute',
              inset: 12,
              border: '2px solid rgba(255,255,255,0.35)',
              pointerEvents: 'none',
            }}
          />
        </>
      );
    case 'auto_crop':
      return <MainMedia props={props} style={{objectFit: 'cover', objectPosition}} />;
    case 'center_crop':
    default:
      return <MainMedia props={props} style={{objectFit: 'cover'}} />;
  }
};

export const ClipLayout: React.FC<LayoutProps> = ({props, time}) => {
  switch (props.layout) {
    case 'gaming_hud':
      return <GamingHud props={props} time={time} />;
    case 'football_scoreboard':
      return <FootballScoreboard props={props} time={time} />;
    case 'duo_split':
      return <DuoSplit props={props} time={time} />;
    case 'lower_third':
      return <LowerThird props={props} time={time} />;
    default:
      return <LegacyLayout props={props} time={time} />;
  }
};
