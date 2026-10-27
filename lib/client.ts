// Small fetch helper for the browser. Returns the parsed JSON even on errors.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function send(url: string, body?: unknown, method = 'POST'): Promise<{ ok: boolean; j: any }> {
  try {
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { ok: r.ok, j: await r.json().catch(() => ({})) };
  } catch {
    return { ok: false, j: { error: 'Could not reach the server.' } };
  }
}
