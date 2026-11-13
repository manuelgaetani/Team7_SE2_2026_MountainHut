import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { groupColor } from '../lib/floorPalette.ts';
import { GroupBadge } from './GroupBadge.tsx';

describe('GroupBadge', () => {
  it('shows the letter on the colour of the group', () => {
    render(<GroupBadge label="C" />);
    const badge = screen.getByText('C');
    const { background, color } = groupColor('C');
    expect(badge).toHaveStyle({ backgroundColor: background, color });
  });

  it('is hidden from screen readers: the button around it carries the name', () => {
    render(<GroupBadge label="A" />);
    expect(screen.getByText('A')).toHaveAttribute('aria-hidden', 'true');
  });

  it('accepts an extra class', () => {
    render(<GroupBadge label="A" className="extra" />);
    expect(screen.getByText('A')).toHaveClass('group-badge', 'extra');
  });
});
