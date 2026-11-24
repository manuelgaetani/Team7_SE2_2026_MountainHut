import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SESSION_EXPIRED } from '../lib/errors.ts';
import { ErrorNotice } from './ErrorNotice.tsx';

const TEXT = {
  expired: 'The session has expired. Please sign in again.',
  signIn: 'sign in',
  other: 'Booking failed. Please try again.',
};

function renderNotice(message: string) {
  const router = createMemoryRouter([{ path: '*', element: <ErrorNotice message={message} /> }], {
    initialEntries: ['/bookings?tab=past'],
  });
  render(<RouterProvider router={router} />);
}

describe('ErrorNotice', () => {
  it('links to sign in, coming back to the current page, when the session has expired', () => {
    renderNotice(SESSION_EXPIRED);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(TEXT.expired);
    expect(screen.getByRole('link', { name: TEXT.signIn })).toHaveAttribute(
      'href',
      '/login?next=%2Fbookings%3Ftab%3Dpast',
    );
  });

  it('shows any other message as plain text', () => {
    renderNotice(TEXT.other);
    expect(screen.getByRole('alert')).toHaveTextContent(TEXT.other);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
