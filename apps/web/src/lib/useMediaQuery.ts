import { useSyncExternalStore } from 'react';

// Without matchMedia (old browsers, jsdom) the wide layout is assumed.
const supported = (): boolean => typeof window.matchMedia === 'function';

// True while the media query matches, e.g. useMediaQuery('(max-width: 820px)').
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (!supported()) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => supported() && window.matchMedia(query).matches,
    () => false,
  );
}
