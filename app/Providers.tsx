'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { send } from '@/lib/client';
import { makeMoney } from '@/lib/ledger';
import type { LedgerData, Me } from '@/lib/types';

type Ctx = {
  data: LedgerData;
  loaded: boolean;
  offline: boolean;
  me: Me | null;
  meLoaded: boolean;
  setMe: (m: Me | null) => void;
  refresh: () => Promise<void>;
  cur: string;
  money: (v: number) => string;
};

const LedgerCtx = createContext<Ctx | null>(null);

// One shared copy of the ledger for every route, refreshed on the same 8 second timer as before.
export function LedgerProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<LedgerData>({ region: null, needs: [], donations: [] });
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [meLoaded, setMeLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const { ok, j } = await send('/api/needs', undefined, 'GET');
    setOffline(!ok);
    if (ok) {
      setData(j);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    send('/api/auth/me', undefined, 'GET').then(({ j }) => {
      setMe(j.user ?? null);
      setMeLoaded(true);
    });
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [refresh]);

  const cur = data.region?.currency ?? 'USD';
  const money = useMemo(() => makeMoney(cur), [cur]);
  const value = useMemo(
    () => ({ data, loaded, offline, me, meLoaded, setMe, refresh, cur, money }),
    [data, loaded, offline, me, meLoaded, refresh, cur, money]
  );
  return <LedgerCtx.Provider value={value}>{children}</LedgerCtx.Provider>;
}

export function useLedger() {
  const c = useContext(LedgerCtx);
  if (!c) throw new Error('useLedger must be used inside LedgerProvider');
  return c;
}
