import type { ComponentType } from 'react';
import { MENU_MARKS, markLabel, sortMarks, type MenuMark } from '../lib/menu.ts';
import { base, type IconProps } from '../lib/iconBase.ts';
import { SaladIcon, VeganIcon } from './DietaryIcons.tsx';

// What a dish contains: the same line icons as the needs of the hut, without the bar.
const WheatIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M2 22L16 8M3.47 12.53L5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94m4-4L9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94m4-4L13 3l1.530 1.53a3.5 3.5 0 0 1 0 4.94L13 11l-1.53-1.53a3.5 3.5 0 0 1 0-4.94M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4" />
    <path d="M11.47 17.47L13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0m4-4L17 15l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.5 3.5 0 0 1 4.94 0m4-4L21 11l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L13 11l1.53-1.53a3.5 3.5 0 0 1 4.94 0" />
  </svg>
);

const MilkIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M8 2h8M9 2v2.789a4 4 0 0 1-.672 2.219l-.656.984A4 4 0 0 0 7 10.212V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-9.789a4 4 0 0 0-.672-2.219l-.656-.984A4 4 0 0 1 15 4.788V2" />
    <path d="M7 15a6.47 6.47 0 0 1 5 0a6.47 6.47 0 0 0 5 0" />
  </svg>
);

const EggIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M12 2C8 2 4 8 4 14a8 8 0 0 0 16 0c0-6-4-12-8-12" />
  </svg>
);

const NutIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M12 4V2m-7 8v4a7.004 7.004 0 0 0 5.277 6.787c.412.104.802.292 1.102.592L12 22l.621-.621c.3-.3.69-.488 1.102-.592A7 7 0 0 0 19 14v-4" />
    <path d="M12 4C8 4 4.5 6 4 8c-.243.97-.919 1.952-2 3c1.31-.082 1.972-.29 3-1c.54.92.982 1.356 2 2c1.452-.647 1.954-1.098 2.5-2c.595.995 1.151 1.427 2.5 2c1.31-.621 1.862-1.058 2.5-2c.629.977 1.162 1.423 2.5 2c1.209-.548 1.68-.967 2-2c1.032.916 1.683 1.157 3 1c-1.297-1.036-1.758-2.030-2-3c-.5-2-4-4-8-4" />
  </svg>
);

const BeanIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M5.822 10.6c1.038-.474 2.153-.774 3.044-1.666c.917-.916 1.207-2.053 1.692-3.1m-4.736 4.767c-.365.167-.72.355-1.053.6m1.053-.6a3.5 3.5 0 1 0 4.736-4.766m.574-.999a5.7 5.7 0 0 0-.574.999m0 0l-.001-.001m7.322 12.112c-5.155 5.155-12.847 4.082-14.847-.703c-1.188-2.843.012-4.782 1.736-6.043c1.282-.937 2.893-1.060 4.098-2.266c1.220-1.220 1.330-2.829 2.267-4.098C12.368 3.162 14.320 1.950 17.174 3.100c4.834 1.950 6.214 9.336.705 14.845Z" />
  </svg>
);

const ICONS: Record<MenuMark, ComponentType<IconProps>> = {
  GLUTEN: WheatIcon,
  DAIRY: MilkIcon,
  EGG: EggIcon,
  NUTS: NutIcon,
  SOY: BeanIcon,
  VEGETARIAN: SaladIcon,
  VEGAN: VeganIcon,
};

export function MenuMarkIcon({ mark, ...props }: IconProps & { mark: MenuMark }) {
  const Icon = ICONS[mark];
  return <Icon {...props} />;
}

// The marks of a dish as small tinted squares, in the order of the legend.
// The icons are drawn; the names are read by screen readers and shown on hover.
export function MenuMarks({ marks }: { marks: MenuMark[] }) {
  if (marks.length === 0) return null;
  return (
    <span className="menu-marks">
      {sortMarks(marks).map((mark) => (
        <span
          key={mark}
          className={`menu-mark menu-mark--${mark.toLowerCase()}`}
          title={markLabel(mark)}
        >
          <MenuMarkIcon mark={mark} className="menu-mark__icon" />
          <span className="visually-hidden">{markLabel(mark)}</span>
        </span>
      ))}
    </span>
  );
}

// What the squares mean, at the bottom of the menu.
export function MenuLegend() {
  return (
    <ul className="menu-legend" aria-label="Legend">
      {MENU_MARKS.map(({ mark, label }) => (
        <li key={mark} className="menu-legend__item">
          <span className={`menu-mark menu-mark--${mark.toLowerCase()}`}>
            <MenuMarkIcon mark={mark} className="menu-mark__icon" />
          </span>
          {label}
        </li>
      ))}
    </ul>
  );
}
