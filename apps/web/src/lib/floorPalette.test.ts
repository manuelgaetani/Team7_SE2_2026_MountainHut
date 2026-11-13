import { describe, expect, it } from 'vitest';
import { contrastRatio, groupColor, labelIndex, PALETTE } from './floorPalette.ts';

describe('labelIndex', () => {
  it.each([
    ['A', 0],
    ['B', 1],
    ['Z', 25],
    ['AA', 26],
    ['AB', 27],
    ['BA', 52],
  ])('turns %s into %d', (label, index) => {
    expect(labelIndex(label)).toBe(index);
  });
});

describe('groupColor', () => {
  it('gives each of the first groups its own colour', () => {
    const colors = PALETTE.map((_, i) => groupColor(String.fromCharCode(65 + i)).background);
    expect(new Set(colors).size).toBe(PALETTE.length);
  });

  it('is cyclic: after the last colour it starts again', () => {
    expect(groupColor(String.fromCharCode(65 + PALETTE.length))).toEqual(groupColor('A'));
  });

  it('is the same for the same label', () => {
    expect(groupColor('C')).toEqual(groupColor('C'));
  });

  it('falls back to the first colour for an unreadable label', () => {
    expect(PALETTE).toContainEqual(groupColor(''));
  });
});

describe('PALETTE', () => {
  it.each(PALETTE.map((c) => [c.background, c.color]))(
    'keeps the text of %s readable (contrast of at least 4.5)',
    (background, color) => {
      expect(contrastRatio(background!, color!)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe('contrastRatio', () => {
  it('is 21 between black and white, whatever the order', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
  });
});
