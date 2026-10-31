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

// ---------- Gaming variants ----------

const GamingHudLeft: React.FC<LayoutProps> = ({props, time}) => {
  const {canvas, caption, meta} = props;
  const margin = Math.round(canvas.width * 0.045);
  const bubbleWidth = Math.round(canvas.width * 0.3);
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <TopScrim />
      <FaceBubble props={props} time={time} accent={caption.accent} sizeScale={0.3} zoom={4} top={margin} left={canvas.width - bubbleWidth - margin} />
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={margin + bubbleWidth * 0.15} right={margin + bubbleWidth + canvas.width * 0.02} />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const GamingHudTop: React.FC<LayoutProps> = ({props, time}) => {
  const {canvas, caption, meta} = props;
  const margin = Math.round(canvas.width * 0.045);
  const bubbleWidth = Math.round(canvas.width * 0.26);
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <TopScrim />
      <FaceBubble props={props} time={time} accent={caption.accent} sizeScale={0.26} zoom={4} top={margin} left={Math.round((canvas.width - bubbleWidth) / 2)} />
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={margin + bubbleWidth + canvas.height * 0.02} align="center" />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const GamingMinimal: React.FC<LayoutProps> = ({props}) => {
  const {canvas, caption, meta} = props;
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <TopScrim strength={0.35} />
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={canvas.height * 0.06} align="center" />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const GamingNeon: React.FC<LayoutProps> = ({props, time}) => {
  const {canvas, caption, meta} = props;
  const margin = Math.round(canvas.width * 0.06);
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <div style={{position: 'absolute', inset: margin, border: `3px solid ${caption.accent}`, boxShadow: `0 0 24px ${caption.accent}66, inset 0 0 24px ${caption.accent}33`, pointerEvents: 'none'}} />
      <FaceBubble props={props} time={time} accent={caption.accent} sizeScale={0.24} zoom={4} top={margin * 1.5} left={margin * 1.5} />
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={margin * 1.5} right={margin * 1.5} />
      <ProgressBar accent={caption.accent} canvas={canvas} heightScale={0.008} />
    </>
  );
};

const GamingReaction: React.FC<LayoutProps> = ({props, time}) => {
  const {canvas, caption, meta} = props;
  const margin = Math.round(canvas.width * 0.04);
  const big = Math.round(canvas.width * 0.42);
  const small = Math.round(canvas.width * 0.22);
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <TopScrim />
      <FaceBubble props={props} time={time} accent={caption.accent} sizeScale={0.42} zoom={2.6} top={margin} left={margin} />
      <div style={{position: 'absolute', bottom: margin, right: margin, width: small, height: Math.round(small * 0.75), borderRadius: small * 0.08, overflow: 'hidden', border: `3px solid ${caption.accent}`, boxShadow: '0 12px 30px rgba(0,0,0,0.5)'}}>
        <FocusMedia props={props} focus={faceAt(props.face?.keyframes, time)} zoom={1.4} width={small} height={Math.round(small * 0.75)} style={{position: 'absolute', inset: 0}} />
      </div>
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={margin + big * 0.05} right={margin} />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const GamingSplit: React.FC<LayoutProps> = ({props, time}) => {
  const {canvas, caption, meta} = props;
  const half = Math.round(canvas.height * 0.5);
  const face = faceAt(props.face?.keyframes, time);
  return (
    <>
      <div style={{position: 'absolute', top: 0, left: 0, right: 0, height: half, overflow: 'hidden'}}>
        <MainMedia props={props} style={{objectFit: 'cover'}} />
      </div>
      <div style={{position: 'absolute', top: half, left: 0, right: 0, height: canvas.height - half, overflow: 'hidden', background: '#08090b'}}>
        <FocusMedia props={props} focus={face} zoom={2.2} width={canvas.width} height={canvas.height - half} style={{position: 'absolute', inset: 0}} />
      </div>
      <div style={{position: 'absolute', top: half - 2, left: 0, right: 0, height: 4, background: caption.accent, boxShadow: `0 0 16px ${caption.accent}`}} />
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={canvas.height * 0.04} align="center" />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

// ---------- Football variants ----------

const FootballScoreboardBottom: React.FC<LayoutProps> = ({props}) => {
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
      <div style={{position: 'absolute', bottom: Math.round(canvas.height * 0.12), left: Math.round((canvas.width - width) / 2), width, borderRadius: Math.round(fontSize * 0.28), overflow: 'hidden', boxShadow: '0 18px 44px rgba(0,0,0,0.55)', fontFamily: fontFamilyOf('archivo_black')}}>
        {competition ? (<div style={{background: caption.accent, color: '#0b0b0b', fontSize: Math.round(fontSize * 0.42), letterSpacing: '0.14em', textAlign: 'center', padding: `${Math.round(fontSize * 0.14)}px 0`}}>{competition}</div>) : null}
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: Math.round(fontSize * 0.3), background: 'rgba(8,9,11,0.86)', padding: `${Math.round(fontSize * 0.34)}px ${Math.round(fontSize * 0.55)}px`}}>
          <div style={{flex: 1, color: '#fff', fontSize, textAlign: 'left'}}>{home}</div>
          <div style={{display: 'flex', alignItems: 'center', gap: Math.round(fontSize * 0.25)}}>
            <div style={{color: '#fff', fontSize: Math.round(fontSize * 1.25)}}>{scoreText(meta)}</div>
            {minute ? (<div style={{background: caption.accent, color: '#0b0b0b', fontSize: Math.round(fontSize * 0.5), padding: `${Math.round(fontSize * 0.1)}px ${Math.round(fontSize * 0.28)}px`, borderRadius: 999}}>{minute}</div>) : null}
          </div>
          <div style={{flex: 1, color: '#fff', fontSize, textAlign: 'right'}}>{away}</div>
        </div>
      </div>
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={canvas.height * 0.06} align="center" />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const FootballMinimal: React.FC<LayoutProps> = ({props}) => {
  const {canvas, caption, meta} = props;
  const fontSize = Math.round(Math.min(canvas.width, canvas.height) * 0.09);
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <TopScrim strength={0.4} />
      <div style={{position: 'absolute', top: canvas.height * 0.06, left: 0, right: 0, textAlign: 'center', fontFamily: fontFamilyOf('archivo_black'), fontSize, color: '#fff', textShadow: '0 6px 24px rgba(0,0,0,0.9)'}}>{scoreText(meta)}</div>
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={canvas.height * 0.16} align="center" />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const FootballBroadcast: React.FC<LayoutProps> = ({props}) => {
  const {canvas, caption, meta} = props;
  const home = (meta?.teams?.home ?? 'HOME').toUpperCase();
  const away = (meta?.teams?.away ?? 'AWAY').toUpperCase();
  const competition = meta?.competition?.toUpperCase();
  const minute = meta?.minute;
  const barH = Math.round(canvas.height * 0.11);
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <div style={{position: 'absolute', top: 0, left: 0, right: 0, height: barH, background: 'rgba(8,9,11,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${Math.round(canvas.width * 0.05)}px`, fontFamily: fontFamilyOf('archivo_black')}}>
        <div style={{color: '#fff', fontSize: Math.round(barH * 0.45), flex: 1, textAlign: 'left'}}>{home}</div>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2}}>
          <div style={{color: caption.accent, fontSize: Math.round(barH * 0.6), letterSpacing: '0.05em'}}>{scoreText(meta)}</div>
          {competition ? (<div style={{color: '#aaa', fontSize: Math.round(barH * 0.22), letterSpacing: '0.12em'}}>{competition}{minute ? ` · ${minute}` : ''}</div>) : null}
        </div>
        <div style={{color: '#fff', fontSize: Math.round(barH * 0.45), flex: 1, textAlign: 'right'}}>{away}</div>
      </div>
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={barH + canvas.height * 0.04} align="center" />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const FootballHighlight: React.FC<LayoutProps> = ({props}) => {
  const {canvas, caption, meta} = props;
  const home = (meta?.teams?.home ?? 'HOME').toUpperCase();
  const away = (meta?.teams?.away ?? 'AWAY').toUpperCase();
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <TopScrim strength={0.6} />
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={canvas.height * 0.06} align="center" scale={1.3} />
      <div style={{position: 'absolute', top: canvas.height * 0.22, left: 0, right: 0, textAlign: 'center', fontFamily: fontFamilyOf('archivo_black')}}>
        <div style={{color: '#fff', fontSize: Math.round(canvas.height * 0.05), letterSpacing: '0.08em'}}>{home} vs {away}</div>
        <div style={{color: caption.accent, fontSize: Math.round(canvas.height * 0.13), marginTop: canvas.height * 0.02}}>{scoreText(meta)}</div>
        {meta?.minute ? (<div style={{color: '#fff', fontSize: Math.round(canvas.height * 0.04), marginTop: canvas.height * 0.01}}>{meta.minute}</div>) : null}
      </div>
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const FootballClean: React.FC<LayoutProps> = ({props}) => {
  const {canvas, caption, meta} = props;
  const home = (meta?.teams?.home ?? 'HOME').toUpperCase();
  const away = (meta?.teams?.away ?? 'AWAY').toUpperCase();
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <div style={{position: 'absolute', top: canvas.height * 0.06, left: 0, right: 0, textAlign: 'center', fontFamily: fontFamilyOf('archivo_black'), fontSize: Math.round(canvas.height * 0.05), color: '#fff', textShadow: '0 4px 18px rgba(0,0,0,0.8)'}}>
        {home} <span style={{color: caption.accent}}>{scoreText(meta)}</span> {away}
      </div>
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={canvas.height * 0.13} align="center" />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const FootballVerticalStack: React.FC<LayoutProps> = ({props}) => {
  const {canvas, caption, meta} = props;
  const home = (meta?.teams?.home ?? 'HOME').toUpperCase();
  const away = (meta?.teams?.away ?? 'AWAY').toUpperCase();
  const fs = Math.round(canvas.height * 0.06);
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <TopScrim strength={0.5} />
      <div style={{position: 'absolute', top: canvas.height * 0.06, left: canvas.width * 0.06, fontFamily: fontFamilyOf('archivo_black'), fontSize: fs, color: '#fff', textAlign: 'left', lineHeight: 1.1}}>
        <div>{home}</div>
        <div style={{color: caption.accent, fontSize: fs * 1.4}}>{meta?.score?.home ?? 0}</div>
      </div>
      <div style={{position: 'absolute', bottom: canvas.height * 0.16, right: canvas.width * 0.06, fontFamily: fontFamilyOf('archivo_black'), fontSize: fs, color: '#fff', textAlign: 'right', lineHeight: 1.1}}>
        <div>{away}</div>
        <div style={{color: caption.accent, fontSize: fs * 1.4}}>{meta?.score?.away ?? 0}</div>
      </div>
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={canvas.height * 0.45} align="center" />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

// ---------- Podcast variants ----------

const DuoSplitHorizontal: React.FC<LayoutProps> = ({props, time}) => {
  const {canvas, caption, meta} = props;
  const half = Math.round(canvas.width * 0.5);
  const face = faceAt(props.face?.keyframes, time);
  return (
    <>
      <div style={{position: 'absolute', top: 0, left: 0, width: half, height: canvas.height, overflow: 'hidden'}}>
        <MainMedia props={props} style={{objectFit: 'cover'}} />
      </div>
      <div style={{position: 'absolute', top: 0, left: half, width: canvas.width - half, height: canvas.height, overflow: 'hidden', background: '#08090b'}}>
        <FocusMedia props={props} focus={face} zoom={2.4} width={canvas.width - half} height={canvas.height} style={{position: 'absolute', inset: 0}} />
      </div>
      <div style={{position: 'absolute', top: 0, left: half - 2, width: 4, height: canvas.height, background: caption.accent}} />
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={canvas.height * 0.06} left={canvas.width * 0.04} />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const SoloPodcast: React.FC<LayoutProps> = ({props}) => {
  const {canvas, caption, meta} = props;
  const name = meta?.speaker || 'SPEAKER';
  const topic = meta?.topic;
  const cardW = Math.round(canvas.width * 0.88);
  const cardH = Math.round(canvas.height * 0.12);
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <TopScrim strength={0.5} />
      <div style={{position: 'absolute', bottom: canvas.height * 0.14, left: Math.round((canvas.width - cardW) / 2), width: cardW, height: cardH, background: 'rgba(8,9,11,0.82)', borderRadius: Math.round(cardH * 0.18), display: 'flex', alignItems: 'center', padding: `0 ${Math.round(cardW * 0.05)}px`, gap: Math.round(cardW * 0.03), boxShadow: '0 14px 40px rgba(0,0,0,0.5)'}}>
        <div style={{width: Math.round(cardH * 0.7), height: Math.round(cardH * 0.7), borderRadius: '50%', background: caption.accent}} />
        <div style={{flex: 1, fontFamily: fontFamilyOf('archivo_black')}}>
          <div style={{color: '#fff', fontSize: Math.round(cardH * 0.34)}}>{String(name).toUpperCase()}</div>
          {topic ? (<div style={{color: caption.accent, fontSize: Math.round(cardH * 0.26), marginTop: 2}}>{topic}</div>) : null}
        </div>
      </div>
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={canvas.height * 0.06} align="center" />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const PodcastQuote: React.FC<LayoutProps> = ({props}) => {
  const {canvas, caption, meta} = props;
  const quote = meta?.title || meta?.title || '';
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <div style={{position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)'}} />
      <div style={{position: 'absolute', top: '35%', left: canvas.width * 0.08, right: canvas.width * 0.08, textAlign: 'center', fontFamily: fontFamilyOf('archivo_black'), fontSize: Math.round(canvas.height * 0.06), color: '#fff', lineHeight: 1.2, textShadow: '0 8px 30px rgba(0,0,0,0.9)'}}>
        {quote ? `"${quote}"` : ''}
      </div>
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={canvas.height * 0.06} align="center" />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const PodcastChat: React.FC<LayoutProps> = ({props}) => {
  const {canvas, caption, meta} = props;
  const hook = meta?.title || '';
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <TopScrim />
      <div style={{position: 'absolute', bottom: canvas.height * 0.16, left: canvas.width * 0.06, right: canvas.width * 0.06}}>
        <div style={{background: caption.accent, color: '#0b0b0b', fontFamily: fontFamilyOf('archivo_black'), fontSize: Math.round(canvas.height * 0.04), padding: `${Math.round(canvas.height * 0.015)}px ${Math.round(canvas.width * 0.04)}px`, borderRadius: Math.round(canvas.height * 0.02), display: 'inline-block', maxWidth: '88%', boxShadow: '0 12px 30px rgba(0,0,0,0.5)'}}>
          {hook || '...'}
        </div>
      </div>
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={canvas.height * 0.06} align="left" left={canvas.width * 0.06} />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const PodcastMinimal: React.FC<LayoutProps> = ({props, time}) => {
  const {canvas, caption, meta} = props;
  const margin = Math.round(canvas.width * 0.04);
  const bw = Math.round(canvas.width * 0.34);
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <FaceBubble props={props} time={time} accent={caption.accent} sizeScale={0.34} zoom={3} top={margin} left={Math.round((canvas.width - bw) / 2)} />
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={margin + bw + canvas.height * 0.02} align="center" />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

// ---------- Education variants ----------

const LowerThirdTop: React.FC<LayoutProps> = ({props}) => {
  const {canvas, caption, meta} = props;
  const title = meta?.title || meta?.topic || '';
  const cardW = Math.round(canvas.width * 0.86);
  const cardH = Math.round(canvas.height * 0.11);
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <div style={{position: 'absolute', top: canvas.height * 0.06, left: Math.round((canvas.width - cardW) / 2), width: cardW, height: cardH, background: caption.accent, borderRadius: Math.round(cardH * 0.18), display: 'flex', alignItems: 'center', padding: `0 ${Math.round(cardW * 0.05)}px`, boxShadow: '0 14px 40px rgba(0,0,0,0.5)'}}>
        <div style={{fontFamily: fontFamilyOf('inter'), fontSize: Math.round(cardH * 0.4), color: '#0b0b0b', fontWeight: 700}}>{title}</div>
      </div>
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={canvas.height * 0.2} align="center" />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const EducationStep: React.FC<LayoutProps> = ({props}) => {
  const {canvas, caption, meta} = props;
  const title = meta?.title || meta?.topic || '';
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <TopScrim strength={0.5} />
      <div style={{position: 'absolute', bottom: canvas.height * 0.18, left: canvas.width * 0.06, right: canvas.width * 0.06, display: 'flex', alignItems: 'center', gap: canvas.width * 0.03}}>
        <div style={{width: Math.round(canvas.height * 0.09), height: Math.round(canvas.height * 0.09), borderRadius: '50%', background: caption.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fontFamilyOf('inter'), fontSize: Math.round(canvas.height * 0.05), color: '#0b0b0b', fontWeight: 800}}>1</div>
        <div style={{flex: 1, fontFamily: fontFamilyOf('inter'), fontSize: Math.round(canvas.height * 0.04), color: '#fff', fontWeight: 600, lineHeight: 1.2}}>{title}</div>
      </div>
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={canvas.height * 0.06} align="left" left={canvas.width * 0.06} />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const EducationFact: React.FC<LayoutProps> = ({props}) => {
  const {canvas, caption, meta} = props;
  const title = meta?.title || meta?.topic || '';
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <div style={{position: 'absolute', top: canvas.height * 0.12, left: canvas.width * 0.06, right: canvas.width * 0.06, background: 'rgba(8,9,11,0.82)', borderRadius: Math.round(canvas.height * 0.02), padding: `${Math.round(canvas.height * 0.025)}px ${Math.round(canvas.width * 0.04)}px`, borderLeft: `6px solid ${caption.accent}`}}>
        <div style={{fontFamily: fontFamilyOf('inter'), fontSize: Math.round(canvas.height * 0.022), color: caption.accent, fontWeight: 700, letterSpacing: '0.12em', marginBottom: 6}}>FAKTA</div>
        <div style={{fontFamily: fontFamilyOf('inter'), fontSize: Math.round(canvas.height * 0.038), color: '#fff', fontWeight: 600, lineHeight: 1.3}}>{title}</div>
      </div>
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={canvas.height * 0.06} right={canvas.width * 0.06} />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const EducationMinimal: React.FC<LayoutProps> = ({props}) => {
  const {canvas, caption, meta} = props;
  const title = meta?.title || meta?.topic || '';
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <div style={{position: 'absolute', bottom: canvas.height * 0.16, left: canvas.width * 0.06, right: canvas.width * 0.06, fontFamily: fontFamilyOf('inter'), fontSize: Math.round(canvas.height * 0.04), color: '#fff', fontWeight: 600, textShadow: '0 4px 18px rgba(0,0,0,0.9)', lineHeight: 1.2}}>
        {title}
      </div>
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const EducationSplit: React.FC<LayoutProps> = ({props}) => {
  const {canvas, caption, meta} = props;
  const topH = Math.round(canvas.height * 0.55);
  const title = meta?.title || meta?.topic || '';
  return (
    <>
      <div style={{position: 'absolute', top: 0, left: 0, right: 0, height: topH, overflow: 'hidden'}}>
        <MainMedia props={props} style={{objectFit: 'cover'}} />
      </div>
      <div style={{position: 'absolute', top: topH, left: 0, right: 0, height: canvas.height - topH, background: 'rgba(8,9,11,0.92)', padding: `${Math.round(canvas.height * 0.03)}px ${Math.round(canvas.width * 0.06)}px`}}>
        <div style={{fontFamily: fontFamilyOf('inter'), fontSize: Math.round(canvas.height * 0.04), color: '#fff', fontWeight: 700, lineHeight: 1.2}}>{title}</div>
        {meta?.title ? (<div style={{fontFamily: fontFamilyOf('inter'), fontSize: Math.round(canvas.height * 0.03), color: caption.accent, marginTop: canvas.height * 0.015}}>{meta.hook}</div>) : null}
      </div>
      <div style={{position: 'absolute', top: topH - 2, left: 0, right: 0, height: 4, background: caption.accent}} />
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={canvas.height * 0.04} right={canvas.width * 0.06} />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

// ---------- Generic / Common ----------

const CenterFocus: React.FC<LayoutProps> = ({props, time}) => {
  const {canvas, caption, meta} = props;
  const face = faceAt(props.face?.keyframes, time);
  const size = Math.round(canvas.width * 0.5);
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover', filter: 'brightness(0.55)'}} />
      <div style={{position: 'absolute', top: Math.round((canvas.height - size) / 2), left: Math.round((canvas.width - size) / 2), width: size, height: size, borderRadius: '50%', overflow: 'hidden', border: `6px solid ${caption.accent}`, boxShadow: `0 0 40px ${caption.accent}55`}}>
        <FocusMedia props={props} focus={face} zoom={2.2} width={size} height={size} style={{position: 'absolute', inset: 0}} />
      </div>
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={canvas.height * 0.06} align="center" />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const FullBleedText: React.FC<LayoutProps> = ({props}) => {
  const {canvas, caption, meta} = props;
  const title = meta?.title || meta?.title || '';
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.85) 100%)'}} />
      <div style={{position: 'absolute', bottom: canvas.height * 0.16, left: canvas.width * 0.06, right: canvas.width * 0.06, fontFamily: fontFamilyOf(caption.font), fontSize: Math.round(canvas.height * 0.05), color: '#fff', fontWeight: 800, lineHeight: 1.15, textShadow: '0 6px 24px rgba(0,0,0,0.9)'}}>
        {title}
      </div>
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={canvas.height * 0.06} align="left" left={canvas.width * 0.06} />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const FramedMinimal: React.FC<LayoutProps> = ({props}) => {
  const {canvas} = props;
  const inset = Math.round(canvas.width * 0.05);
  return (
    <>
      <div style={{position: 'absolute', inset: 0, background: '#08090b'}} />
      <div style={{position: 'absolute', top: inset, left: inset, right: inset, bottom: inset, borderRadius: Math.round(canvas.width * 0.02), overflow: 'hidden', border: '1px solid rgba(255,255,255,0.18)'}}>
        <MainMedia props={props} style={{objectFit: 'cover'}} />
      </div>
      <ProgressBar accent={props.caption.accent} canvas={canvas} />
    </>
  );
};

const CinematicBars: React.FC<LayoutProps> = ({props}) => {
  const {canvas, caption, meta} = props;
  const bar = Math.round(canvas.height * 0.12);
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <div style={{position: 'absolute', top: 0, left: 0, right: 0, height: bar, background: '#000'}} />
      <div style={{position: 'absolute', bottom: 0, left: 0, right: 0, height: bar, background: '#000'}} />
      <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)', pointerEvents: 'none'}} />
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={bar + canvas.height * 0.04} align="center" />
      <ProgressBar accent={caption.accent} canvas={canvas} heightScale={0.004} />
    </>
  );
};

export const ClipLayout: React.FC<LayoutProps> = ({props, time}) => {
  switch (props.layout) {
    case 'gaming_hud':
      return <GamingHud props={props} time={time} />;
    case 'gaming_hud_left':
      return <GamingHudLeft props={props} time={time} />;
    case 'gaming_hud_top':
      return <GamingHudTop props={props} time={time} />;
    case 'gaming_minimal':
      return <GamingMinimal props={props} time={time} />;
    case 'gaming_neon':
      return <GamingNeon props={props} time={time} />;
    case 'gaming_reaction':
      return <GamingReaction props={props} time={time} />;
    case 'gaming_split':
      return <GamingSplit props={props} time={time} />;
    case 'football_scoreboard':
      return <FootballScoreboard props={props} time={time} />;
    case 'football_scoreboard_bottom':
      return <FootballScoreboardBottom props={props} time={time} />;
    case 'football_minimal':
      return <FootballMinimal props={props} time={time} />;
    case 'football_broadcast':
      return <FootballBroadcast props={props} time={time} />;
    case 'football_highlight':
      return <FootballHighlight props={props} time={time} />;
    case 'football_clean':
      return <FootballClean props={props} time={time} />;
    case 'football_vertical_stack':
      return <FootballVerticalStack props={props} time={time} />;
    case 'duo_split':
      return <DuoSplit props={props} time={time} />;
    case 'duo_split_horizontal':
      return <DuoSplitHorizontal props={props} time={time} />;
    case 'solo_podcast':
      return <SoloPodcast props={props} time={time} />;
    case 'podcast_quote':
      return <PodcastQuote props={props} time={time} />;
    case 'podcast_chat':
      return <PodcastChat props={props} time={time} />;
    case 'podcast_minimal':
      return <PodcastMinimal props={props} time={time} />;
    case 'lower_third':
      return <LowerThird props={props} time={time} />;
    case 'lower_third_top':
      return <LowerThirdTop props={props} time={time} />;
    case 'education_step':
      return <EducationStep props={props} time={time} />;
    case 'education_fact':
      return <EducationFact props={props} time={time} />;
    case 'education_minimal':
      return <EducationMinimal props={props} time={time} />;
    case 'education_split':
      return <EducationSplit props={props} time={time} />;
    case 'center_focus':
      return <CenterFocus props={props} time={time} />;
    case 'full_bleed_text':
      return <FullBleedText props={props} time={time} />;
    case 'framed_minimal':
      return <FramedMinimal props={props} time={time} />;
    case 'cinematic_bars':
      return <CinematicBars props={props} time={time} />;
    default:
      return <LegacyLayout props={props} time={time} />;
  }
};
