import { NextResponse } from 'next/server';

// SECURITY: in-memory sliding-window rate limiter.
// NOTE: state lives in this process only. On multi-instance or serverless deployments
// every instance counts separately, so swap the body of rateLimit() for a shared store
// (Redis / Upstash) and keep the same function signature.
type Entry = { hits: number[]; windowMs: number };
const store = new Map<string, Entry>();
const MAX_KEYS = 10_000; // hard cap so an attacker cannot grow memory without limit
const SWEEP_EVERY_MS = 60_000;
let lastSweep = 0;

function sweep(now: number) {
  lastSweep = now;
  for (const [k, e] of store) {
    // Entry is dead once its newest hit has left the window.
    if (e.hits.length === 0 || e.hits[e.hits.length - 1] <= now - e.windowMs) store.delete(k);
  }
  // Still too big after removing expired entries: drop the oldest-inserted keys.
  for (const k of store.keys()) {
    if (store.size <= MAX_KEYS) break;
    store.delete(k);
  }
}

export type RateResult = { ok: boolean; retryAfterSec: number };

// `now` is injectable only so tests can move time forward.
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateResult {
  if (now - lastSweep > SWEEP_EVERY_MS || store.size > MAX_KEYS) sweep(now);

  const e = store.get(key) ?? { hits: [], windowMs };
  e.windowMs = windowMs;
  e.hits = e.hits.filter((t) => t > now - windowMs);

  if (e.hits.length >= limit) {
    store.set(key, e);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((e.hits[0] + windowMs - now) / 1000)) };
  }
  e.hits.push(now);
  store.set(key, e);
  return { ok: true, retryAfterSec: 0 };
}

// SECURITY: client IP for rate limiting.
// x-forwarded-for is NOT trusted: the client can send its own value and the host only appends to it,
// so rotating it would give an attacker a fresh bucket on every request.
// On Render, Cloudflare sits in front and sets these two headers itself (clients cannot forge them).
// If neither is present (local dev, unexpected proxy) everyone shares one strict 'unknown' bucket.
const IP_SHAPE = /^[0-9a-fA-F:.]{3,45}$/; // IPv4 or IPv6 characters only, so junk cannot create keys
export function clientIp(req: { headers: Headers }): string {
  for (const name of ['true-client-ip', 'cf-connecting-ip']) {
    const v = req.headers.get(name)?.trim();
    if (v && IP_SHAPE.test(v)) return v;
  }
  return 'unknown';
}

// 429 in the same { error } shape the routes already use.
export function tooMany(r: RateResult): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please wait and try again.' },
    { status: 429, headers: { 'Retry-After': String(r.retryAfterSec) } }
  );
}

// Convenience used by routes: returns a 429 response, or null when the request may continue.
export function limit(key: string, max: number, windowMs: number): NextResponse | null {
  const r = rateLimit(key, max, windowMs);
  return r.ok ? null : tooMany(r);
}

export const MIN = 60_000;
export const QUARTER_HOUR = 15 * MIN;
