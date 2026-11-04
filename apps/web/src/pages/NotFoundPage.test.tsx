import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderAt, stubApi } from '../test/app.tsx';

describe('NotFoundPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders 404 information and action links', () => {
    stubApi();
    renderAt('/non-existent-route');

    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(
      within(main).getByText(/the trail you are following doesn't lead anywhere/i),
    ).toBeInTheDocument();
    expect(within(main).getByRole('link', { name: /Back to home/i })).toHaveAttribute('href', '/');
    expect(within(main).getByRole('link', { name: /Book a table/i })).toHaveAttribute(
      'href',
      '/book',
    );
  });
});
