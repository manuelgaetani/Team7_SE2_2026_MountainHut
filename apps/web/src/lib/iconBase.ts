import type { SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement>;

// Line icons of the needs of the hut. They are decoration: the label next to them names the need.
export const base = {
  xmlns: 'http://www.w3.org/2000/svg',
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeWidth: 2,
  'aria-hidden': true,
  focusable: false,
} as const;
