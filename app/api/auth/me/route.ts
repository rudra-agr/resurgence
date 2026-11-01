import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  // SECURITY: never cache who is logged in.
  return NextResponse.json({ user: await getSessionUser() }, { headers: { 'Cache-Control': 'no-store' } });
}
