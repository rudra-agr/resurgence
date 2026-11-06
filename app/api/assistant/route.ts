import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin, requireJson } from '@/lib/csrf';
import { clientIp, limit, MIN } from '@/lib/rateLimit';
import { askAssistant } from '@/lib/assistant';

export const dynamic = 'force-dynamic';

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

  try {
    return NextResponse.json({ reply: await askAssistant(messages) });
  } catch (e) {
    const status = (e as { status?: number }).status;
    const msg = status === 503 ? 'The assistant is not configured on this server.' : 'The assistant is unavailable right now. Please try again in a moment.';
    return NextResponse.json({ error: msg }, { status: status === 503 ? 503 : 502 });
  }
}
