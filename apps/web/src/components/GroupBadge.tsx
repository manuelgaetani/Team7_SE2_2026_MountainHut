import { groupColor } from '../lib/floorPalette.ts';

// The letter of a group on its colour: the letter is what identifies the group, the colour
// only reinforces it.
export function GroupBadge({ label, className = '' }: { label: string; className?: string }) {
  const { background, color } = groupColor(label);
  return (
    <span
      className={`group-badge ${className}`.trim()}
      style={{ backgroundColor: background, color }}
      aria-hidden="true"
    >
      {label}
    </span>
  );
}
