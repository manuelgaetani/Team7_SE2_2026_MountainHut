import type { ComponentType, SVGProps } from 'react';
import type { DietaryCode } from '@mountain-hut/shared';

type IconProps = SVGProps<SVGSVGElement>;

// Line icons of the needs of the hut. They are decoration: the label next to them names the need.
const base = {
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

const VeganIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M16 8q6 0 6-6q-6 0-6 6" />
    <path d="M17.41 3.59a10 10 0 1 0 3 3" />
    <path d="M2 2a26.6 26.6 0 0 1 10 20c.9-6.82 1.5-9.5 4-14" />
  </svg>
);

const EggOffIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="m2 2l20 20m-2-7.653V14c0-6-4-12-8-12c-1.078 0-2.157.436-3.157 1.19M6.206 6.21C4.871 8.4 4 11.2 4 14a8 8 0 0 0 14.568 4.568" />
  </svg>
);

const NutOffIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M12 4V2m-7 8v4a7.004 7.004 0 0 0 5.277 6.787c.412.104.802.292 1.102.592L12 22l.621-.621c.3-.3.69-.488 1.102-.592a7 7 0 0 0 4.125-2.939M19 10v3.343" />
    <path d="M12 12c-1.349-.573-1.905-1.005-2.5-2c-.546.902-1.048 1.353-2.5 2c-1.018-.644-1.46-1.08-2-2c-1.028.71-1.69.918-3 1c1.081-1.048 1.757-2.03 2-3c.194-.776.84-1.551 1.79-2.21m11.654 5.997c.887-.457 1.28-.891 1.556-1.787c1.032.916 1.683 1.157 3 1c-1.297-1.036-1.758-2.03-2-3c-.5-2-4-4-8-4c-.74 0-1.461.068-2.15.192M2 2l20 20" />
  </svg>
);

const BeanOffIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M9 9c-.64.64-1.521.954-2.402 1.165A6 6 0 0 0 8 22a13.96 13.96 0 0 0 9.9-4.1M10.75 5.093A6 6 0 0 1 22 8c0 2.411-.61 4.68-1.683 6.66" />
    <path d="M5.341 10.62a4 4 0 0 0 6.487 1.208M10.62 5.341a4 4 0 0 1 2.039 2.04M2 2l20 20" />
  </svg>
);

const MilkOffIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M8 2h8M9 2v1.343M15 2v2.789a4 4 0 0 0 .672 2.219l.656.984a4 4 0 0 1 .672 2.22v1.131M7.8 7.8l-.128.192A4 4 0 0 0 7 10.212V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-3" />
    <path d="M7 15a6.47 6.47 0 0 1 5 0a6.47 6.47 0 0 0 3.435.435M2 2l20 20" />
  </svg>
);

const WheatOffIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="m2 22l10-10m4-4l-1.17 1.17M3.47 12.53L5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94M8 8l-.53.53a3.5 3.5 0 0 0 0 4.94L9 15l1.53-1.53c.55-.55.88-1.25.98-1.97m-.6-6.24c.15-.26.34-.51.56-.73L13 3l1.53 1.53a3.5 3.5 0 0 1 .28 4.62M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4" />
    <path d="M11.47 17.47L13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0M16 16l-.53.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.5 3.5 0 0 1 1.97-.98m6.24.6c.26-.15.51-.34.73-.56L21 11l-1.53-1.53a3.5 3.5 0 0 0-4.62-.28M2 2l20 20" />
  </svg>
);

const SaladIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M7 21h10m-5 0a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9" />
    <path d="M11.38 12a2.4 2.4 0 0 1-.4-4.77a2.4 2.4 0 0 1 3.2-2.77a2.4 2.4 0 0 1 3.47-.63a2.4 2.4 0 0 1 3.37 3.37a2.4 2.4 0 0 1-1.1 3.7a2.5 2.5 0 0 1 .03 1.1M13 12l4-4" />
    <path d="M10.9 7.25A3.99 3.99 0 0 0 4 10c0 .73.2 1.41.54 2" />
  </svg>
);

// "Other": a pencil, for a need the hiker writes.
export const OtherNeedIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1l1-4z" />
  </svg>
);

const ICONS: Record<DietaryCode, ComponentType<IconProps>> = {
  GLUTEN_FREE: WheatOffIcon,
  LACTOSE_FREE: MilkOffIcon,
  EGG_FREE: EggOffIcon,
  NUT_FREE: NutOffIcon,
  SOY_FREE: BeanOffIcon,
  VEGAN: VeganIcon,
  VEGETARIAN: SaladIcon,
};

// The icon of a need of the list.
export function DietaryIcon({ code, ...props }: IconProps & { code: DietaryCode }) {
  const Icon = ICONS[code];
  return <Icon {...props} />;
}
