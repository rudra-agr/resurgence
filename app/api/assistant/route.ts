import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin, requireJson } from '@/lib/csrf';
import { clientIp, limit, MIN } from '@/lib/rateLimit';
import { askAssistant } from '@/lib/assistant';

export const dynamic = 'force-dynamic';

// [name, max requests, window in ms]. Raise these if you expect a lot of real demo traffic.
const GLOBAL_CAPS: [string, number, number][] = [
  ['min', 30, MIN],
  ['hour', 300, 60 * MIN],
  ['day', 1500, 24 * 60 * MIN],
];

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(600) }))
    .min(1)
    .max(12),
});


export async function POST(req: Request) {
  const blocked = assertSameOrigin(req) ?? requireJson(req);
  if (blocked) return blocked;
  const limited = limit(`assistant:${clientIp(req)}`, 12, MIN);
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Ask a short question (up to 600 characters).' }, { status: 400 });
  const messages = parsed.data.messages.slice(-8);
  if (messages[messages.length - 1].role !== 'user') return NextResponse.json({ error: 'Ask a question first.' }, { status: 400 });

  // SECURITY (R5): global caps for ALL visitors combined, so a spoofer or a botnet cannot drain the
  // LLM credit even if every request looks like a new person. Process-local, like the other limits.
  for (const [name, max, windowMs] of GLOBAL_CAPS) {
    const g = limit(`assistant:global:${name}`, max, windowMs);
    if (g) return g;
  }

  try {
    return NextResponse.json({ reply: await askAssistant(messages) });
  } catch (e) {
    const status = (e as { status?: number }).status;
    const msg = status === 503 ? 'The assistant is not configured on this server.' : 'The assistant is unavailable right now. Please try again in a moment.';
    return NextResponse.json({ error: msg }, { status: status === 503 ? 503 : 502 });
  }
}
