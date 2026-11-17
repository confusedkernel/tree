import { test, expect } from 'vitest';
import { createHmac, createHash } from 'node:crypto';
import { hmacSha256, sha256Hex } from '../src/classroom/crypto';
test('sha/hmac', () => {
  for (const s of ['', 'abc', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(200), '[NP [D the] [N′ [N 狗]]]']) {
    expect(sha256Hex(s)).toBe(createHash('sha256').update(s).digest('hex'));
    for (const k of ['k', 'k'.repeat(100)]) expect(Buffer.from(hmacSha256(k, s)).toString('hex')).toBe(createHmac('sha256', k).update(s).digest('hex'));
  }
});
