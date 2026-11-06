'use client';

import { useCallback, useEffect, useState } from 'react';

export type Mode = 'light' | 'dark';

const read = (): Mode => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

export function useThemeMode() {
  const [mode, setMode] = useState<Mode>('light');

  useEffect(() => {
    setMode(read());
    const obs = new MutationObserver(() => setMode(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  const toggle = useCallback(() => {
    const next: Mode = read() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('rl-theme', next);
    } catch {
      /* private mode: the choice just will not be remembered */
    }
  }, []);

  return { mode, toggle };
}
