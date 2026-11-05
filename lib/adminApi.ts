import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { limit, MIN } from '@/lib/rateLimit';

// Every analytics route goes through this: ADMIN only, rate limited, read-only JSON.
export async function adminGet<T>(key: string, run: () => Promise<T>) {
  const auth = await requireRole('ADMIN');
  if ('error' in auth) return auth.error;
  const limited = limit(`analytics:${key}:${auth.user.id}`, 60, MIN);
  if (limited) return limited;
  return NextResponse.json(await run());
}

export const dayKey = (d: Date) => d.toISOString().slice(0, 10);
