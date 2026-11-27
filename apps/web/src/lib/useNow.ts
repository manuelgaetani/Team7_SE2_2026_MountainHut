import { useEffect, useState } from 'react';

// MH-21: the current time, refreshed every `everyMs`, so a page that stays open moves its items
// between states (e.g. a hike becomes past) without waiting for new data.
export function useNow(everyMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
