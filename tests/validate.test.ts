import test from 'node:test';
import assert from 'node:assert/strict';
import { isHttpUrl, safeUrl, httpUrl, idParam } from '../lib/validate';

test('only http and https URLs are accepted', () => {
  assert.equal(isHttpUrl('https://shop.example/p/1'), true);
  assert.equal(isHttpUrl('http://shop.example'), true);
  for (const bad of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'ftp://x.example', 'not a url', '']) {
    assert.equal(isHttpUrl(bad), false, bad);
  }
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl(undefined), null);
  assert.equal(httpUrl.safeParse('javascript:alert(1)').success, false);
});

test('id validator accepts cuid-style ids and rejects the rest', () => {
  assert.equal(idParam.safeParse('clx9abc123def456ghi789jkl').success, true);
  for (const bad of ['short', 'has space in it', "x'; DROP TABLE", 'a'.repeat(61), '../../etc/passwd']) {
    assert.equal(idParam.safeParse(bad).success, false, bad);
  }
});
