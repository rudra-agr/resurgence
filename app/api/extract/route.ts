import { NextResponse } from 'next/server';
import { z } from 'zod';
import { extractNeed } from '@/lib/extract';
import { requireRole } from '@/lib/auth';
import { assertSameOrigin, requireJson } from '@/lib/csrf';
import { limit, MIN } from '@/lib/rateLimit';

const Body = z.object({ text: z.string().trim().min(1, 'Write the request first.').max(2000, 'Request is too long (2000 characters max).') });

// Returns a draft only; nothing is saved until the coordinator reviews and posts it.
// SECURITY: requires role COORDINATOR or ADMIN. Each call costs Groq credits, so it is rate limited.
export async function POST(req: Request) {
  const blocked = assertSameOrigin(req) ?? requireJson(req);
  if (blocked) return blocked;
  const auth = await requireRole('COORDINATOR', 'ADMIN');
  if ('error' in auth) return auth.error;
  const limited = limit(`extract:${auth.user.id}`, 10, MIN);
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  try {
    return NextResponse.json(await extractNeed(parsed.data.text));
  } catch (e) {
    console.error('[extract]', e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: 'Automatic drafting is unavailable right now. Fill the fields by hand instead.' },
      { status: 502 }
    );
  }
}
