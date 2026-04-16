import { test, expect, beforeAll } from 'bun:test';
import { verifyTerminalToken } from './jwt';
import { SignJWT } from 'jose';

const SECRET = 'test-secret-at-least-32-chars-long-for-HS256-yes';

beforeAll(() => {
  process.env.TERMINAL_JWT_SECRET = SECRET;
});

async function signValid(payload: { userId: string; serverId: string }) {
  const secret = new TextEncoder().encode(SECRET);
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('stratuu-dashboard')
    .setAudience('stratuu-terminal-bridge')
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(secret);
}

test('verifies a valid token', async () => {
  const token = await signValid({ userId: 'u1', serverId: 's1' });
  const p = await verifyTerminalToken(token);
  expect(p.userId).toBe('u1');
  expect(p.serverId).toBe('s1');
});

test('rejects invalid issuer', async () => {
  const secret = new TextEncoder().encode(SECRET);
  const badIss = await new SignJWT({ userId: 'u', serverId: 's' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('wrong')
    .setAudience('stratuu-terminal-bridge')
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(secret);
  await expect(verifyTerminalToken(badIss)).rejects.toThrow();
});

test('rejects garbage', async () => {
  await expect(verifyTerminalToken('x.y.z')).rejects.toThrow();
});
