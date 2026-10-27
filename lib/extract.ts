import { z } from 'zod';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const TIMEOUT_MS = 20000;

const SYSTEM = `You read relief requests written by field coordinators, in any language, and extract the need as structured data.
- title: a short English summary of the need (max 8 words).
- location: the place exactly as written in the message, or an empty string if none is given.
- families: number of families or households affected, 0 if not stated.
- urgency: Critical, High, Medium or Low. Use High when it is not stated.
- language: the language of the message.
- items: each requested item with a quantity. Write item names in plain English as a shopper would search for them (e.g. "wool blanket", "portable water filter"). Use quantity 1 if no number is given.
Only use what the message says. Do not invent items, numbers or places.
Reply with a single JSON object shaped exactly like:
{"title": string, "location": string, "families": integer, "urgency": string, "language": string, "items": [{"name": string, "quantity": integer}]}`;

// JSON mode guarantees valid JSON, not the right shape, so every field is validated here.
const Draft = z.object({
  title: z.string().min(1).max(120),
  location: z.string().max(160).catch(''),
  families: z.number().int().min(0).catch(0),
  urgency: z.enum(['Critical', 'High', 'Medium', 'Low']).catch('High'),
  language: z.string().catch('unknown'),
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        quantity: z.number().int().min(1).catch(1),
      })
    )
    .min(1)
    .max(20),
});
export type NeedDraft = z.infer<typeof Draft>;

class GroqError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function ask(model: string, text: string): Promise<NeedDraft> {
  const r = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!r.ok) throw new GroqError(`Groq ${r.status}: ${(await r.text()).slice(0, 300)}`, r.status);

  const raw = ((await r.json()) as { choices?: { message?: { content?: string } }[] }).choices?.[0]
    ?.message?.content;
  if (!raw) throw new GroqError('Groq returned no content');
  return Draft.parse(JSON.parse(raw));
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// Tries each configured model in order and retries temporary failures (timeouts,
// rate limits, 5xx, invalid output) before moving on. The caller falls back to the manual form.
export async function extractNeed(text: string): Promise<NeedDraft> {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set');
  const models = (process.env.GROQ_MODELS || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  let last: unknown = new Error('No model configured');
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await ask(model, text);
      } catch (e) {
        last = e;
        const status = e instanceof GroqError ? e.status : undefined;
        // An invalid key will not fix itself.
        if (status === 401 || status === 403) throw e;
        const temporary = !status || status === 429 || status >= 500;
        // 400/404 means the model name is wrong, so move on to the next one.
        if (!temporary) break;
        await sleep(1000 * (attempt + 1));
      }
    }
  }
  throw last;
}
