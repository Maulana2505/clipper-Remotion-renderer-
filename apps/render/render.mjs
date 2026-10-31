import path from 'node:path';
import fs from 'node:fs';
import {bundle} from '@remotion/bundler';
import {selectComposition, renderMedia} from '@remotion/renderer';

function readArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }
  return process.argv[index + 1];
}

const propsPath = readArg('--props');
const outPath = readArg('--out');
const entryPoint = path.resolve(readArg('--entry', 'src/index.ts'));

if (!propsPath || !outPath) {
  console.error('Usage: node render.mjs --props props.json --out output.mp4');
  process.exit(1);
}

const inputProps = JSON.parse(fs.readFileSync(path.resolve(propsPath), 'utf8'));
const outputLocation = path.resolve(outPath);
fs.mkdirSync(path.dirname(outputLocation), {recursive: true});

console.log('BUNDLE start');
const serveUrl = await bundle({
  entryPoint,
  publicDir: path.resolve('public'),
});
console.log('BUNDLE done');

const composition = await selectComposition({
  serveUrl,
  id: 'Clip',
  inputProps,
});
console.log(
  `COMPOSITION ${composition.width}x${composition.height}@${composition.fps}fps ${composition.durationInFrames}frames`,
);

let lastPercent = -1;
const startedAt = Date.now();

const renderOptions = {
  composition,
  serveUrl,
  codec: 'h264',
  outputLocation,
  inputProps,
  crf: 18,
  imageFormat: process.env.RENDER_IMAGE_FORMAT || 'jpeg',
  jpegQuality: 82,
  x264Preset: process.env.RENDER_X264_PRESET || 'veryfast',
  audioCodec: 'aac',
  audioBitrate: '192k',
  chromiumOptions: {gl: process.env.REMOTION_GL || 'angle'},
  timeoutInMilliseconds: 1000 * 60 * 10,
  onProgress: ({progress}) => {
    const percent = Math.round(progress * 100);
    if (percent !== lastPercent) {
      lastPercent = percent;
      if (percent % 10 === 0) {
        console.log(`PROGRESS ${percent}`);
      }
    }
  },
};

const concurrency = Number(process.env.RENDER_CONCURRENCY || 0);
if (concurrency > 0) {
  renderOptions.concurrency = concurrency;
}

await renderMedia(renderOptions);

const elapsed = Date.now() - startedAt;
const frames = composition.durationInFrames;
console.log(`DONE ${elapsed}ms ${frames}frames ${(frames / (elapsed / 1000)).toFixed(2)}fps`);
