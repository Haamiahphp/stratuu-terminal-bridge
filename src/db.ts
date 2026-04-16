import { SQL } from 'bun';
import { env } from './env';

export const sql = new SQL({
  url: env.databaseUrl,
  tls: true,
  max: 5,
  idleTimeout: 30,
});

export interface ServerWithKey {
  id: string;
  ipAddress: string | null;
  userId: string;
  encryptedPrivateKey: string;
}

export async function fetchServerWithKey(
  serverId: string,
  userId: string
): Promise<ServerWithKey | null> {
  const rows = await sql`
    SELECT
      s.id,
      host(s.ip_address) AS "ipAddress",
      s.user_id AS "userId",
      k.encrypted_private_key AS "encryptedPrivateKey"
    FROM servers s
    JOIN server_ssh_keys k ON k.server_id = s.id
    WHERE s.id = ${serverId} AND s.user_id = ${userId}
    LIMIT 1
  ` as ServerWithKey[];
  return rows[0] ?? null;
}

export async function startSession(params: {
  userId: string;
  serverId: string;
  clientIp: string | null;
}): Promise<string> {
  const rows = await sql`
    INSERT INTO terminal_sessions (user_id, server_id, client_ip)
    VALUES (${params.userId}, ${params.serverId}, ${params.clientIp})
    RETURNING id
  ` as { id: string }[];
  return rows[0].id;
}

export async function endSession(params: {
  id: string;
  bytesIn: number;
  bytesOut: number;
  exitReason: string;
}): Promise<void> {
  await sql`
    UPDATE terminal_sessions
    SET ended_at = NOW(),
        bytes_in = ${params.bytesIn},
        bytes_out = ${params.bytesOut},
        exit_reason = ${params.exitReason}
    WHERE id = ${params.id}
  `;
}
