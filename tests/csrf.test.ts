import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSameOrigin, requireJson } from '../lib/csrf';

const req = (h: Record<string, string>) => ({ headers: new Headers(h) });

test('same-origin and header-less requests pass', () => {
  assert.equal(assertSameOrigin(req({ origin: 'http://localhost:3000', host: 'localhost:3000' })), null);
  assert.equal(assertSameOrigin(req({ host: 'localhost:3000' })), null);
  assert.equal(assertSameOrigin(req({ 'sec-fetch-site': 'same-origin', host: 'a.example' })), null);
});

test('forged Origin or cross-site fetch is rejected with 403', () => {
  assert.equal(assertSameOrigin(req({ origin: 'https://evil.example', host: 'localhost:3000' }))?.status, 403);
  assert.equal(assertSameOrigin(req({ origin: 'null', host: 'localhost:3000' }))?.status, 403);
  assert.equal(assertSameOrigin(req({ 'sec-fetch-site': 'cross-site', host: 'localhost:3000' }))?.status, 403);
});

test('non-JSON content types get 415', () => {
  assert.equal(requireJson(req({ 'content-type': 'application/json' })), null);
  assert.equal(requireJson(req({ 'content-type': 'application/json; charset=utf-8' })), null);
  assert.equal(requireJson(req({ 'content-type': 'text/plain' }))?.status, 415);
  assert.equal(requireJson(req({}))?.status, 415);
});
