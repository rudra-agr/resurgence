'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Refresh intervals offered on the Live and Studio tabs, in milliseconds.
// Not lower than 5s: the admin API routes are rate limited to 60 requests a minute.
export const INTERVALS = [5000, 15000, 30000] as const;
export type Interval = (typeof INTERVALS)[number];

/**
 * Polls `pull` on a timer, like the live feed in the AG Studio real-time dashboard demo.
 *
 * - start / pause and the update interval are owned here, so the toolbar just drives this hook
 * - a pull is skipped while the previous one is still in flight
 * - nothing runs while the browser tab is hidden; on return it catches up at once
 */
export function useLiveFeed(pull: () => Promise<void>, initialMs: Interval = INTERVALS[0]) {
  const [running, setRunning] = useState(true);
  const [intervalMs, setIntervalMs] = useState<Interval>(initialMs);
  const pullRef = useRef(pull);
  pullRef.current = pull;
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await pullRef.current();
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!running) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const schedule = () => {
      clearInterval(timer);
      timer = undefined;
      if (document.hidden) return;
      void refresh(); // catch up straight away rather than waiting a full interval
      timer = setInterval(() => void refresh(), intervalMs);
    };
    schedule();
    document.addEventListener('visibilitychange', schedule);
    return () => {
      document.removeEventListener('visibilitychange', schedule);
      clearInterval(timer);
    };
  }, [running, intervalMs, refresh]);

  return { running, setRunning, intervalMs, setIntervalMs, refresh };
}
