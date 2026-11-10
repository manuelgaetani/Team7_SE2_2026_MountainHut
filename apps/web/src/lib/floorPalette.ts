// Colours of the groups of a floor plan. The colour only reinforces the letter: every seat
// always shows the letter too, so a group never depends on colour alone.
export interface GroupColor {
  background: string;
  color: string;
}

// Every background keeps a contrast of at least 4.5:1 with the white text.
const BACKGROUNDS = [
  '#8a3f2b',
  '#6b6a2f',
  '#2f6a8a',
  '#7a4f78',
  '#2a6b58',
  '#9a5b13',
  '#5a4a8a',
  '#8a2f50',
  '#3f6b2a',
  '#4a5568',
] as const;

export const PALETTE: GroupColor[] = BACKGROUNDS.map((background) => ({
  background,
  color: '#ffffff',
}));

export function labelIndex(label: string): number {
  let n = 0;
  for (const ch of label.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// The colour of a group label. Cyclic: after the last colour it starts again.
export function groupColor(label: string): GroupColor {
  const i = labelIndex(label);
  return PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length]!;
}

const channel = (v: number): number => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
