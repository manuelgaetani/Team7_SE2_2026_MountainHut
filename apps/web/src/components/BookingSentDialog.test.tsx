import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BookingSentDialog } from './BookingSentDialog.tsx';

describe('BookingSentDialog', () => {
  it('renders summary and title and focuses the Got it button', () => {
    const onClose = vi.fn();
    render(<BookingSentDialog summary="Tue 15 Jan · 19:00 · 3 people" onClose={onClose} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Tue 15 Jan · 19:00 · 3 people')).toBeInTheDocument();
    expect(screen.getByText('Booking request sent')).toBeInTheDocument();
    expect(screen.getByText('Awaiting confirmation')).toBeInTheDocument();

    const gotItBtn = screen.getByRole('button', { name: 'Got it' });
    expect(gotItBtn).toHaveFocus();
  });

  it('shows no requirements section when there are none', () => {
    render(<BookingSentDialog summary="Test" onClose={vi.fn()} />);
    expect(screen.queryByText('Dietary requirements')).not.toBeInTheDocument();
  });

  it('lists the requirements in order and marks only the ones with allergies', () => {
    render(
      <BookingSentDialog
        summary="Test"
        requirements={[
          { allergies: true, description: '1 vegan, peanut allergy' },
          { allergies: false, description: '2 vegetarians' },
        ]}
        onClose={vi.fn()}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      'Allergies (special care needed): 1 vegan, peanut allergy',
      '2 vegetarians',
    ]);
    expect(screen.getAllByText(/special care/i)).toHaveLength(1);
  });

  it('calls onClose when close button or Got it button is clicked', () => {
    const onClose = vi.fn();
    const { rerender } = render(<BookingSentDialog summary="Test" onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<BookingSentDialog summary="Test" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('calls onClose when Escape key is pressed, but ignores other keys', () => {
    const onClose = vi.fn();
    render(<BookingSentDialog summary="Test" onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when clicking backdrop directly, but not when clicking inside dialog', () => {
    const onClose = vi.fn();
    render(<BookingSentDialog summary="Test" onClose={onClose} />);

    const backdrop = screen.getByRole('presentation');
    const dialog = screen.getByRole('dialog');

    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
