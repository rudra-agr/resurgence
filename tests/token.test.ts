import test from 'node:test';
import assert from 'node:assert/strict';
import { pvOf, pvMatches, signToken, verifyToken } from '../lib/token';

const SECRET = 'x'.repeat(32);

test('a valid token round-trips', () => {
  const t = signToken(SECRET, 'user1', pvOf('hash-A'), 3600, 1000);
  assert.deepEqual(verifyToken(SECRET, t, 1001), { uid: 'user1', pv: pvOf('hash-A') });
});

test('tampered, wrongly signed and expired tokens are rejected', () => {
  const t = signToken(SECRET, 'user1', pvOf('hash-A'), 3600, 1000);
  assert.equal(verifyToken('y'.repeat(32), t, 1001), null);
  assert.equal(verifyToken(SECRET, t.replace(/^./, (c) => (c === 'a' ? 'b' : 'a')), 1001), null);
  assert.equal(verifyToken(SECRET, t, 1000 + 3601), null);
});

test('pv mismatch: a changed password hash invalidates the old session', () => {
  const t = verifyToken(SECRET, signToken(SECRET, 'user1', pvOf('old-hash'), 3600, 1000), 1001)!;
  assert.equal(pvMatches(t.pv, 'old-hash'), true);
  assert.equal(pvMatches(t.pv, 'new-hash-after-password-change'), false);
});
