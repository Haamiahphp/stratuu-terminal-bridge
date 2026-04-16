import { jwtVerify } from 'jose';

export const ISSUER = 'stratuu-dashboard';
export const AUDIENCE = 'stratuu-terminal-bridge';

export interface TerminalTokenPayload {
  userId: string;
  serverId: string;
}

function getSecret(): Uint8Array {
  const s = process.env.TERMINAL_JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error('TERMINAL_JWT_SECRET must be set (≥ 32 chars)');
  }
  return new TextEncoder().encode(s);
}

export async function verifyTerminalToken(
  token: string
): Promise<TerminalTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret(), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  const userId = payload.userId;
  const serverId = payload.serverId;
  if (typeof userId !== 'string' || typeof serverId !== 'string') {
    throw new Error('Invalid token payload');
  }
  return { userId, serverId };
}
