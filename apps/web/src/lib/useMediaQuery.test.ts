import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMediaQuery } from './useMediaQuery.ts';

const QUERY = '(max-width: 820px)';

// A matchMedia whose answer the test can change, as a resized window does.
function stubMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const list = {
    get matches() {
      return matches;
    },
    addEventListener: vi.fn((_type: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: () => void) => listeners.delete(listener)),
  };
  const matchMedia = vi.fn(() => list);
  vi.stubGlobal('matchMedia', matchMedia);
  return {
    matchMedia,
    list,
    resize(next: boolean) {
      matches = next;
      listeners.forEach((listener) => listener());
    },
  };
}

describe('useMediaQuery', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('assumes the wide layout without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result, unmount } = renderHook(() => useMediaQuery(QUERY));

    expect(result.current).toBe(false);
    unmount();
  });

  it('tells whether the query matches', () => {
    const media = stubMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery(QUERY));

    expect(result.current).toBe(true);
    expect(media.matchMedia).toHaveBeenCalledWith(QUERY);
  });

  it('follows the changes of the window, and stops listening once unmounted', () => {
    const media = stubMatchMedia(false);
    const { result, unmount } = renderHook(() => useMediaQuery(QUERY));
    expect(result.current).toBe(false);

    act(() => media.resize(true));
    expect(result.current).toBe(true);

    unmount();
    expect(media.list.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
