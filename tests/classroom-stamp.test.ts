import { test, expect } from 'vitest';
import { compressToEncodedURIComponent } from 'lz-string';
import { decodePayload, encodePayload, isValid, sign, stampFromText } from '../src/classroom/stamp';

const base = { id: 'Ana López 7', t: 29000000, z: -480, s: '[CP [DP_i what] [C′ [C did] [TP [DP 狗] [VP <what_i>]]]]' };

test('payload round-trips and keeps the signature valid', () => {
  for (const st of [sign(base), sign({ ...base, b: { mode: 'xbar' }, st: { font: 'serif' } }), sign({ ...base, st: { font: 'serif' } })]) {
    const p = encodePayload(st);
    expect(p).toMatch(/^[A-Z2-7]+$/);
    const back = decodePayload(p)!;
    expect(back).toEqual(st);
    expect(isValid(back)).toBe(true);
    expect(stampFromText(`NTV2:${p}`)).toEqual(st);
  }
});

test('odd values survive the compact layout', () => {
  for (const extra of [{ t: 0, z: 0 }, { t: 40000000, z: 570 }, { t: 28000000, z: -840 }, { s: 'a\u0000b\n  [X ∅]', b: { chains: 'multidominance' } }, { s: '' }]) {
    const st = sign({ ...base, ...extra });
    expect(decodePayload(encodePayload(st))).toEqual(st);
  }
  const st = { ...sign(base), sig: 'ZZZZZ99999' };
  expect(decodePayload(encodePayload(st))).toEqual(st);
});

test('older #v= / NTV1: codes still read', () => {
  const st = sign(base);
  const old = compressToEncodedURIComponent(JSON.stringify(st));
  expect(stampFromText(`https://x.example/tree/#v=${old}`)).toEqual(st);
  expect(stampFromText(`NTV1:${old}`)).toEqual(st);
});

test('garbage is rejected', () => {
  expect(stampFromText('NTV2:AAAA')).toBeNull();
  expect(stampFromText('hello')).toBeNull();
});
