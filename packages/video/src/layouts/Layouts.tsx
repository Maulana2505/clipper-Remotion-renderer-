import React from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {ClipMeta, ClipProps, CanvasSpec} from '../types';
import {fontFamilyOf} from '../fonts';
import {FocusMedia, MainMedia, OverlayBubble, focusAt} from '../media';

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
  const face = focusAt(props, time);
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

const FootballScoreboard: React.FC<LayoutProps> = ({props}) => {
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
  const face = focusAt(props, time);
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

// ---------- Gaming templates ----------

/** Small glass/neon label used across the gaming layouts. */
const Pill: React.FC<{
  text: string;
  accent: string;
  canvas: CanvasSpec;
  style?: React.CSSProperties;
  solid?: boolean;
}> = ({text, accent, canvas, style, solid = false}) => {
  const fontSize = Math.round(canvas.width * 0.026);
  return (
    <div
      style={{
        position: 'absolute',
        fontFamily: fontFamilyOf('inter'),
        fontWeight: 800,
        fontSize,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: solid ? '#06070a' : '#ffffff',
        background: solid ? accent : 'rgba(6,7,10,0.62)',
        border: `1px solid ${accent}88`,
        borderRadius: 999,
        padding: `${Math.round(fontSize * 0.32)}px ${Math.round(fontSize * 0.7)}px`,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {text}
    </div>
  );
};

/** Hairline accent divider with a neon glow. */
const NeonDivider: React.FC<{
  top: number;
  accent: string;
  height?: number;
  glow?: number;
}> = ({top, accent, height = 4, glow = 22}) => (
  <div
    style={{
      position: 'absolute',
      top: top - Math.round(height / 2),
      left: 0,
      right: 0,
      height,
      background: `linear-gradient(90deg, ${accent}00, ${accent}, ${accent}00)`,
      boxShadow: `0 0 ${glow}px ${accent}`,
    }}
  />
);

/** Tactical corner brackets that frame the gameplay area. */
const CornerBrackets: React.FC<{
  accent: string;
  inset: number;
  size: number;
  thickness?: number;
}> = ({accent, inset, size, thickness = 3}) => {
  const base: React.CSSProperties = {
    position: 'absolute',
    width: size,
    height: size,
    pointerEvents: 'none',
  };
  return (
    <>
      <div
        style={{
          ...base,
          top: inset,
          left: inset,
          borderTop: `${thickness}px solid ${accent}`,
          borderLeft: `${thickness}px solid ${accent}`,
        }}
      />
      <div
        style={{
          ...base,
          top: inset,
          right: inset,
          borderTop: `${thickness}px solid ${accent}`,
          borderRight: `${thickness}px solid ${accent}`,
        }}
      />
      <div
        style={{
          ...base,
          bottom: inset,
          left: inset,
          borderBottom: `${thickness}px solid ${accent}`,
          borderLeft: `${thickness}px solid ${accent}`,
        }}
      />
      <div
        style={{
          ...base,
          bottom: inset,
          right: inset,
          borderBottom: `${thickness}px solid ${accent}`,
          borderRight: `${thickness}px solid ${accent}`,
        }}
      />
    </>
  );
};

/** Facecam panel. A circle when `radius` is half the width. */
const CamPanel: React.FC<{
  props: ClipProps;
  focus: {x: number; y: number};
  zoom: number;
  width: number;
  height: number;
  radius: number;
  accent: string;
  style?: React.CSSProperties;
}> = ({props, focus, zoom, width, height, radius, accent, style}) => (
  <FocusMedia
    props={props}
    focus={focus}
    zoom={zoom}
    width={width}
    height={height}
    rounded={radius}
    style={{
      position: 'absolute',
      border: `4px solid ${accent}`,
      boxShadow: `0 18px 44px rgba(0,0,0,0.6), 0 0 24px ${accent}44`,
      backgroundColor: '#05060a',
      ...style,
    }}
  />
);

// CLASSIC_SPLIT: webcam 34% on top, gameplay 54% below, captions in the rest.
const GamingClassicSplit: React.FC<LayoutProps> = ({props, time}) => {
  const {canvas, caption, meta} = props;
  const faceH = Math.round(canvas.height * 0.34);
  const gameH = Math.round(canvas.height * 0.54);
  const hudTop = faceH + gameH;
  const face = focusAt(props, time);
  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: faceH,
          overflow: 'hidden',
          background: '#05060a',
        }}
      >
        <FocusMedia
          props={props}
          focus={face}
          zoom={2.2}
          width={canvas.width}
          height={faceH}
          style={{position: 'absolute', inset: 0}}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(6,7,10,0.55), rgba(6,7,10,0) 45%, rgba(6,7,10,0.6))',
          }}
        />
        <Pill
          text="Face cam"
          accent={caption.accent}
          canvas={canvas}
          style={{top: Math.round(faceH * 0.09), left: Math.round(canvas.width * 0.05)}}
        />
        <Badge
          text={meta?.badge}
          accent={caption.accent}
          canvas={canvas}
          top={Math.round(faceH * 0.16)}
          align="center"
          scale={0.9}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          top: faceH,
          left: 0,
          right: 0,
          height: gameH,
          overflow: 'hidden',
        }}
      >
        <MainMedia props={props} style={{objectFit: 'cover'}} />
        <CornerBrackets
          accent={`${caption.accent}cc`}
          inset={Math.round(canvas.width * 0.025)}
          size={Math.round(canvas.width * 0.06)}
        />
        <Pill
          text="Gameplay"
          accent={caption.accent}
          canvas={canvas}
          style={{top: Math.round(canvas.width * 0.05), right: Math.round(canvas.width * 0.05)}}
        />
      </div>
      <NeonDivider top={faceH} accent={caption.accent} />
      <div
        style={{
          position: 'absolute',
          top: hudTop,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'linear-gradient(180deg, rgba(6,7,10,0.94), #05060a)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: `linear-gradient(90deg, ${caption.accent}00, ${caption.accent}aa, ${caption.accent}00)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: Math.round(canvas.height * 0.015),
            left: canvas.width * 0.05,
            fontFamily: fontFamilyOf('inter'),
            fontSize: Math.round(canvas.width * 0.024),
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.45)',
          }}
        >
          Gameplay · 1080p
        </div>
        <div
          style={{
            position: 'absolute',
            top: Math.round(canvas.height * 0.015),
            right: canvas.width * 0.05,
            fontFamily: fontFamilyOf('inter'),
            fontSize: Math.round(canvas.width * 0.024),
            letterSpacing: '0.16em',
            color: 'rgba(255,255,255,0.45)',
          }}
        >
          REC ●
        </div>
      </div>
      <ProgressBar accent={caption.accent} canvas={canvas} heightScale={0.008} />
    </>
  );
};

// PIP_OVERLAY: full-bleed gameplay with a floating circular webcam.
const GamingPipOverlay: React.FC<LayoutProps> = ({props, time}) => {
  const {canvas, caption, meta} = props;
  const margin = Math.round(canvas.width * 0.045);
  const cam = Math.round(canvas.width * 0.3);
  const ring = Math.max(6, Math.round(canvas.width * 0.012));
  const face = focusAt(props, time);
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(6,7,10,0.5), rgba(6,7,10,0) 26%, rgba(6,7,10,0) 76%, rgba(6,7,10,0.6))',
        }}
      />
      <CornerBrackets
        accent={`${caption.accent}aa`}
        inset={margin}
        size={Math.round(canvas.width * 0.07)}
        thickness={4}
      />
      <Pill
        text={meta?.badge ?? 'Live'}
        accent={caption.accent}
        canvas={canvas}
        solid
        style={{top: margin, left: margin}}
      />
      <div
        style={{
          position: 'absolute',
          top: margin,
          right: margin,
          width: cam + ring * 2,
          height: cam + ring * 2,
          borderRadius: '50%',
          background: `linear-gradient(145deg, ${caption.accent}, rgba(6,7,10,0.9))`,
          boxShadow: `0 22px 48px rgba(0,0,0,0.6), 0 0 30px ${caption.accent}55`,
        }}
      >
        <FocusMedia
          props={props}
          focus={face}
          zoom={2.4}
          width={cam}
          height={cam}
          rounded={cam / 2}
          style={{position: 'absolute', top: ring, left: ring}}
        />
      </div>
      <Pill
        text="Face cam"
        accent={caption.accent}
        canvas={canvas}
        style={{top: margin + cam + ring * 2 + Math.round(canvas.width * 0.02), right: margin}}
      />
      <ProgressBar accent={caption.accent} canvas={canvas} heightScale={0.007} />
    </>
  );
};

// TRI_ZONE: facecam top, crosshair gameplay middle, killfeed HUD bottom.
const GamingTriZone: React.FC<LayoutProps> = ({props, time}) => {
  const {canvas, caption, meta} = props;
  const camH = Math.round(canvas.height * 0.26);
  const gameH = Math.round(canvas.height * 0.46);
  const hudTop = camH + gameH;
  const hudH = Math.round(canvas.height * 0.16);
  const face = focusAt(props, time);
  const cross = Math.max(12, Math.round(canvas.width * 0.02));
  const feed = [0.42, 0.3];
  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: camH,
          overflow: 'hidden',
          background: '#05060a',
        }}
      >
        <FocusMedia
          props={props}
          focus={face}
          zoom={2.4}
          width={canvas.width}
          height={camH}
          style={{position: 'absolute', inset: 0}}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(6,7,10,0.5), rgba(6,7,10,0) 55%, rgba(6,7,10,0.8))',
          }}
        />
        <Pill
          text="Cam 01"
          accent={caption.accent}
          canvas={canvas}
          style={{top: Math.round(camH * 0.1), left: Math.round(canvas.width * 0.05)}}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          top: camH,
          left: 0,
          right: 0,
          height: gameH,
          overflow: 'hidden',
        }}
      >
        <MainMedia props={props} style={{objectFit: 'cover'}} />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: cross * 2,
            height: cross * 2,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            border: `2px solid ${caption.accent}cc`,
            boxShadow: `0 0 18px ${caption.accent}66`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 2,
            height: cross * 2.4,
            transform: 'translate(-50%, -50%)',
            background: `${caption.accent}dd`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: cross * 2.4,
            height: 2,
            transform: 'translate(-50%, -50%)',
            background: `${caption.accent}dd`,
          }}
        />
        <CornerBrackets
          accent={`${caption.accent}cc`}
          inset={Math.round(canvas.width * 0.025)}
          size={Math.round(canvas.width * 0.055)}
        />
        <Pill
          text={meta?.badge ?? 'Clutch'}
          accent={caption.accent}
          canvas={canvas}
          solid
          style={{top: Math.round(canvas.width * 0.04), left: Math.round(canvas.width * 0.05)}}
        />
      </div>
      <NeonDivider top={camH} accent={caption.accent} />
      <NeonDivider top={hudTop} accent={caption.accent} height={2} glow={12} />
      <div
        style={{
          position: 'absolute',
          top: hudTop,
          left: 0,
          right: 0,
          height: hudH,
          overflow: 'hidden',
          background: '#05060a',
        }}
      >
        <Pill
          text="Killfeed"
          accent={caption.accent}
          canvas={canvas}
          style={{top: Math.round(hudH * 0.12), left: Math.round(canvas.width * 0.05)}}
        />
        {feed.map((width, index) => (
          <div
            key={index}
            style={{
              position: 'absolute',
              top: Math.round(hudH * (0.12 + index * 0.16)),
              left: Math.round(canvas.width * 0.32),
              width: Math.round(canvas.width * width * 0.55),
              height: Math.max(5, Math.round(canvas.height * 0.004)),
              borderRadius: 999,
              background: `linear-gradient(90deg, ${caption.accent}dd, ${caption.accent}11)`,
            }}
          />
        ))}
      </div>
      <ProgressBar accent={caption.accent} canvas={canvas} heightScale={0.007} />
    </>
  );
};

// CINEMATIC_BLUR: 16:9 gameplay in the middle, blurred backdrop top and bottom.
const GamingCinematicBlur: React.FC<LayoutProps> = ({props, time}) => {
  const {canvas, caption, meta} = props;
  const videoH = Math.round(Math.min(canvas.height * 0.62, (canvas.width * 9) / 16));
  const videoTop = Math.round((canvas.height - videoH) / 2);
  const pillTop = Math.max(
    Math.round(canvas.height * 0.04),
    videoTop - Math.round(canvas.height * 0.09),
  );
  return (
    <>
      <div style={{position: 'absolute', inset: 0, transform: 'scale(1.14)'}}>
        <MainMedia
          props={props}
          style={{
            objectFit: 'cover',
            filter: 'blur(38px) saturate(1.25) brightness(0.5)',
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, rgba(6,7,10,0) 36%, rgba(6,7,10,0.62) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: videoTop,
          left: 0,
          right: 0,
          height: videoH,
          overflow: 'hidden',
          boxShadow: '0 28px 64px rgba(0,0,0,0.72)',
        }}
      >
        <MainMedia props={props} style={{objectFit: 'cover'}} />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            border: `1px solid ${caption.accent}55`,
            boxShadow: 'inset 0 0 80px rgba(0,0,0,0.6)',
          }}
        />
      </div>
      <Pill
        text={meta?.badge ?? 'Cinematic'}
        accent={caption.accent}
        canvas={canvas}
        solid
        style={{top: pillTop, left: Math.round(canvas.width * 0.05)}}
      />
      <div
        style={{
          position: 'absolute',
          top: pillTop + Math.round(canvas.height * 0.005),
          right: Math.round(canvas.width * 0.05),
          fontFamily: fontFamilyOf('inter'),
          fontSize: Math.round(canvas.width * 0.024),
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.55)',
        }}
      >
        16:9 · Cinematic
      </div>
      <ProgressBar accent={caption.accent} canvas={canvas} heightScale={0.006} />
    </>
  );
};

// DUO_VERSUS: two facecams on top (P1 vs P2), gameplay below.
const GamingDuoVersus: React.FC<LayoutProps> = ({props, time}) => {
  const {canvas, caption, meta} = props;
  const margin = Math.round(canvas.width * 0.04);
  const gap = Math.round(canvas.width * 0.03);
  const camH = Math.round(canvas.height * 0.3);
  const camW = Math.round((canvas.width - margin * 2 - gap) / 2);
  const radius = Math.round(canvas.width * 0.03);
  const gameTop = margin + camH + Math.round(canvas.height * 0.025);
  const gameBottom = canvas.height - Math.round(canvas.height * 0.12);
  const face = focusAt(props, time);
  const leftFocus = {x: Math.max(0.05, face.x - 0.1), y: face.y};
  const rightFocus = {x: Math.min(0.95, face.x + 0.1), y: face.y};
  const vs = Math.round(canvas.width * 0.11);
  return (
    <>
      <div style={{position: 'absolute', inset: 0, background: '#05060a'}} />
      <CamPanel
        props={props}
        focus={leftFocus}
        zoom={2.8}
        width={camW}
        height={camH}
        radius={radius}
        accent={caption.accent}
        style={{top: margin, left: margin}}
      />
      <CamPanel
        props={props}
        focus={rightFocus}
        zoom={2.8}
        width={camW}
        height={camH}
        radius={radius}
        accent={caption.accent}
        style={{top: margin, right: margin}}
      />
      <Pill
        text="P1"
        accent={caption.accent}
        canvas={canvas}
        solid
        style={{top: margin + Math.round(camH * 0.08), left: margin + Math.round(camW * 0.08)}}
      />
      <Pill
        text="P2"
        accent={caption.accent}
        canvas={canvas}
        solid
        style={{
          top: margin + Math.round(camH * 0.08),
          right: margin + Math.round(camW * 0.08),
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: margin + Math.round(camH / 2 - vs / 2),
          left: Math.round((canvas.width - vs) / 2),
          width: vs,
          height: vs,
          borderRadius: '50%',
          background: caption.accent,
          color: '#06070a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: fontFamilyOf('archivo_black'),
          fontSize: Math.round(vs * 0.34),
          letterSpacing: '0.02em',
          transform: 'rotate(-6deg)',
          boxShadow: `0 0 28px ${caption.accent}88`,
        }}
      >
        VS
      </div>
      <div
        style={{
          position: 'absolute',
          top: gameTop,
          left: 0,
          right: 0,
          height: Math.max(1, gameBottom - gameTop),
          overflow: 'hidden',
        }}
      >
        <MainMedia props={props} style={{objectFit: 'cover'}} />
        <NeonDivider top={0} accent={caption.accent} height={3} glow={16} />
        <CornerBrackets
          accent={`${caption.accent}cc`}
          inset={Math.round(canvas.width * 0.025)}
          size={Math.round(canvas.width * 0.055)}
        />
        <Pill
          text={meta?.badge ?? 'Duo'}
          accent={caption.accent}
          canvas={canvas}
          style={{top: Math.round(canvas.width * 0.04), left: Math.round(canvas.width * 0.05)}}
        />
      </div>
      <ProgressBar accent={caption.accent} canvas={canvas} heightScale={0.007} />
    </>
  );
};
// ---------- Football variants ----------

const FootballScoreboardBottom: React.FC<LayoutProps> = ({props}) => {
  const {canvas, caption, meta} = props;
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <TopScrim strength={0.3} />
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={canvas.height * 0.06} align="center" />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const FootballMinimal: React.FC<LayoutProps> = ({props}) => {
  const {canvas, caption, meta} = props;
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <TopScrim strength={0.4} />
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={canvas.height * 0.06} align="center" scale={1.2} />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const FootballBroadcast: React.FC<LayoutProps> = ({props}) => {
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

const FootballHighlight: React.FC<LayoutProps> = ({props}) => {
  const {canvas, caption, meta} = props;
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <TopScrim strength={0.6} />
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={canvas.height * 0.06} align="center" scale={1.3} />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const FootballClean: React.FC<LayoutProps> = ({props}) => {
  const {canvas, caption, meta} = props;
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <TopScrim strength={0.3} />
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={canvas.height * 0.06} align="center" />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

const FootballVerticalStack: React.FC<LayoutProps> = ({props}) => {
  const {canvas, caption, meta} = props;
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <TopScrim strength={0.4} />
      <Badge text={meta?.badge} accent={caption.accent} canvas={canvas} top={canvas.height * 0.45} align="center" scale={1.2} />
      <ProgressBar accent={caption.accent} canvas={canvas} />
    </>
  );
};

// ---------- Podcast variants ----------

const DuoSplitHorizontal: React.FC<LayoutProps> = ({props, time}) => {
  const {canvas, caption, meta} = props;
  const half = Math.round(canvas.width * 0.5);
  const face = focusAt(props, time);
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
  const face = focusAt(props, time);
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

const CustomOverlay: React.FC<LayoutProps> = ({props}) => {
  const {canvas, overlays} = props;
  return (
    <>
      <MainMedia props={props} style={{objectFit: 'cover'}} />
      <TopScrim strength={0.25} />
      {(overlays || []).map((overlay) => (
        <OverlayBubble key={overlay.id || (overlay.x + '-' + overlay.y)} props={props} overlay={overlay} />
      ))}
    </>
  );
};

export const ClipLayout: React.FC<LayoutProps> = ({props, time}) => {
  switch (props.layout) {
    case 'gaming_classic_split':
      return <GamingClassicSplit props={props} time={time} />;
    case 'gaming_pip_overlay':
      return <GamingPipOverlay props={props} time={time} />;
    case 'gaming_tri_zone':
      return <GamingTriZone props={props} time={time} />;
    case 'gaming_cinematic_blur':
      return <GamingCinematicBlur props={props} time={time} />;
    case 'gaming_duo_versus':
      return <GamingDuoVersus props={props} time={time} />;
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
    case 'custom_overlay':
      return <CustomOverlay props={props} time={time} />;
    default:
      return <LegacyLayout props={props} time={time} />;
  }
};
