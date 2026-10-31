import type {FontId} from './types';

export const FONT_FAMILIES: Record<FontId, string> = {
  anton: 'Anton, Impact, sans-serif',
  oswald: 'Oswald, Arial Narrow, sans-serif',
  inter: 'Inter, system-ui, sans-serif',
  montserrat: 'Montserrat, sans-serif',
  pinyon: "'Pinyon Script', cursive",
  eb_garamond: "'EB Garamond', serif",
  bebas_neue: "'Bebas Neue', sans-serif",
  archivo_black: "'Archivo Black', sans-serif",
};

/**
 * Font files that both hosts must serve under the same relative path.
 * - Render: apps/render/public/fonts
 * - Web: apps/web/public/fonts
 */
export const FONT_FILES: Array<{id: FontId; family: string; file: string}> = [
  {id: 'anton', family: 'Anton', file: 'Anton-Regular.ttf'},
  {id: 'oswald', family: 'Oswald', file: 'Oswald.ttf'},
  {id: 'inter', family: 'Inter', file: 'Inter.ttf'},
  {id: 'montserrat', family: 'Montserrat', file: 'Montserrat.ttf'},
  {id: 'pinyon', family: 'Pinyon Script', file: 'PinyonScript-Regular.ttf'},
  {id: 'eb_garamond', family: 'EB Garamond', file: 'EBGaramond.ttf'},
  {id: 'bebas_neue', family: 'Bebas Neue', file: 'BebasNeue-Regular.ttf'},
  {id: 'archivo_black', family: 'Archivo Black', file: 'ArchivoBlack-Regular.ttf'},
];

export function fontFamilyOf(id: FontId | string | undefined): string {
  return FONT_FAMILIES[(id ?? 'anton') as FontId] ?? FONT_FAMILIES.anton;
}
