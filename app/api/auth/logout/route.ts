// SECURITY: any visitor may call this (it only clears their own cookie). Origin is checked
// so other sites cannot log a user out.
import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';

export async function POST(req: Request) {
  const blocked = assertSameOrigin(req);
  if (blocked) return blocked;
  clearSessionCookie();
  return NextResponse.json({ ok: true });
}
