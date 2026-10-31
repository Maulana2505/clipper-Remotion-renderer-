import {continueRender, delayRender, staticFile} from 'remotion';
import {loadFont} from '@remotion/fonts';
import {FONT_FILES} from '@clipper/video';

/**
 * Remotion renders in a clean Chromium profile, so every font used by the
 * shared video package must be registered explicitly before the first frame.
 */
const handle = delayRender('Loading video fonts');

Promise.all(
  FONT_FILES.map((font) =>
    loadFont({
      family: font.family,
      url: staticFile(`fonts/${font.file}`),
    }),
  ),
)
  .then(() => continueRender(handle))
  .catch((error) => {
    console.error('Font loading failed', error);
    continueRender(handle);
  });
