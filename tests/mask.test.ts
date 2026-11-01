import test from 'node:test';
import assert from 'node:assert/strict';
import { maskId, maskPayer } from '../lib/mask';

test('ids show only the last 4 characters', () => {
  assert.equal(maskId('5O190127TN364715T'), '…715T');
  assert.equal(maskId('ab'), '…ab');
});

test('payer becomes first initial; Anonymous is unchanged', () => {
  assert.equal(maskPayer('alice'), 'A.');
  assert.equal(maskPayer('  Émile '), 'É.');
  assert.equal(maskPayer('Anonymous'), 'Anonymous');
  assert.equal(maskPayer(''), 'Anonymous');
});
