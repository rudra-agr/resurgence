import test from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit, clientIp } from '../lib/rateLimit';

test('allows up to the limit, then blocks with a Retry-After', () => {
  const t = 1_000_000;
  for (let i = 0; i < 5; i++) assert.equal(rateLimit('k1', 5, 60_000, t + i).ok, true);
  const blocked = rateLimit('k1', 5, 60_000, t + 10);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSec >= 1 && blocked.retryAfterSec <= 60);
});

test('keys are independent and the window slides', () => {
  const t = 2_000_000;
  for (let i = 0; i < 5; i++) rateLimit('a', 5, 1000, t);
  assert.equal(rateLimit('a', 5, 1000, t + 1).ok, false);
  assert.equal(rateLimit('b', 5, 1000, t + 1).ok, true); // another key is unaffected
  assert.equal(rateLimit('a', 5, 1000, t + 1001).ok, true); // window has passed
});

test('clientIp trusts the Cloudflare headers, ignores x-forwarded-for, else "unknown"', () => {
  assert.equal(clientIp({ headers: new Headers({ 'true-client-ip': '1.2.3.4' }) }), '1.2.3.4');
  assert.equal(clientIp({ headers: new Headers({ 'cf-connecting-ip': '2001:db8::1' }) }), '2001:db8::1');
  // a spoofed x-forwarded-for must not create its own bucket
  assert.equal(clientIp({ headers: new Headers({ 'x-forwarded-for': '6.6.6.6, 9.9.9.9' }) }), 'unknown');
  // junk in a trusted header is rejected
  assert.equal(clientIp({ headers: new Headers({ 'true-client-ip': 'not an ip!' }) }), 'unknown');
  assert.equal(clientIp({ headers: new Headers() }), 'unknown');
});
