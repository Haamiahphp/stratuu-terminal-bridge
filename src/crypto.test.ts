import { test, expect, beforeAll } from 'bun:test';
import { encrypt, decrypt } from './crypto';

beforeAll(() => {
  process.env.TERMINAL_KEY_MASTER =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});

test('roundtrip', () => {
  const ct = encrypt('hello');
  expect(decrypt(ct)).toBe('hello');
});

test('fresh IV per call', () => {
  expect(encrypt('x')).not.toBe(encrypt('x'));
});

test('tamper fails', () => {
  const ct = encrypt('secret');
  const tampered = ct.slice(0, -1) + (ct.slice(-1) === 'A' ? 'B' : 'A');
  expect(() => decrypt(tampered)).toThrow();
});
