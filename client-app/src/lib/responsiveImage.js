import widths from './photoWidths.json';

// WebP copies of the big photos in public/assets/photos are named <name>-<width>.webp and listed in
// photoWidths.json. This returns <img> props that let phones, tablets and desktops download the
// size they need. The original file stays as the plain `src` fallback.
export function photoProps(src, sizes) {
  const m = /^(\/assets\/photos\/)([^/]+)\.(jpg|png)$/.exec(src);
  const list = m && widths[`${m[2]}.${m[3]}`];
  if (!list) return { src };
  return { src, srcSet: list.map((w) => `${m[1]}${m[2]}-${w}.webp ${w}w`).join(', '), sizes };
}

export const SIZES = {
  half: '(max-width: 700px) 100vw, 50vw',
  card: '(max-width: 700px) 45vw, 22vw',
  full: '100vw',
  poster: '(max-width: 1200px) 100vw, 1200px',
};
