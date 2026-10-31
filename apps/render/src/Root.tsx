import React from 'react';
import {Composition} from 'remotion';
import {ClipComposition, clipDurationInFrames, type ClipProps} from '@clipper/video';
import {defaultClipProps} from './defaultProps';
import './fonts';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Clip"
      component={ClipComposition}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={defaultClipProps}
      calculateMetadata={({props}: {props: ClipProps}) => {
        const typed = props;
        return {
          fps: typed.canvas?.fps || 30,
          width: typed.canvas?.width || 1080,
          height: typed.canvas?.height || 1920,
          durationInFrames: clipDurationInFrames(typed),
          props,
        };
      }}
    />
  );
};
