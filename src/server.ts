import { env } from './env';
import { verifyTerminalToken } from './jwt';
import { decrypt } from './crypto';
import { fetchServerWithKey, startSession, endSession } from './db';
import { openSshSession, type SshSession } from './ssh';

interface ConnCtx {
  userId: string;
  serverId: string;
  host: string;
  privateKey: string;
  clientIp: string | null;
  sessionId: string;
  ssh: SshSession | null;
  bytesIn: number;
  bytesOut: number;
  ended: boolean;
}

function clientIpFrom(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() ?? null;
  return null;
}

async function finish(ctx: ConnCtx, reason: string) {
  if (ctx.ended) return;
  ctx.ended = true;
  try {
    await endSession({
      id: ctx.sessionId,
      bytesIn: ctx.bytesIn,
      bytesOut: ctx.bytesOut,
      exitReason: reason,
    });
  } catch (e) {
    console.error('[audit] endSession failed', e);
  }
  try {
    ctx.ssh?.close();
  } catch {}
}

const server = Bun.serve<ConnCtx>({
  port: env.port,
  async fetch(req, srv) {
    const url = new URL(req.url);

    if (url.pathname === '/healthz') {
      return new Response('ok', { headers: { 'content-type': 'text/plain' } });
    }

    if (url.pathname !== '/') {
      return new Response('not found', { status: 404 });
    }

    // Origin check for WS upgrades
    const origin = req.headers.get('origin');
    if (env.allowedOrigin !== '*' && origin !== env.allowedOrigin) {
      return new Response('forbidden', { status: 403 });
    }

    const token = url.searchParams.get('token');
    if (!token) {
      return new Response('unauthorized', { status: 401 });
    }

    let payload;
    try {
      payload = await verifyTerminalToken(token);
    } catch {
      return new Response('unauthorized', { status: 401 });
    }

    const serverRow = await fetchServerWithKey(payload.serverId, payload.userId);
    if (!serverRow || !serverRow.ipAddress) {
      return new Response('not found', { status: 404 });
    }

    let privateKey: string;
    try {
      privateKey = decrypt(serverRow.encryptedPrivateKey);
    } catch (e) {
      console.error('[bridge] decrypt failed', e);
      return new Response('server error', { status: 500 });
    }

    const ip = clientIpFrom(req);
    let sessionId: string;
    try {
      sessionId = await startSession({
        userId: payload.userId,
        serverId: payload.serverId,
        clientIp: ip,
      });
    } catch (e) {
      console.error('[bridge] startSession failed', e);
      return new Response('server error', { status: 500 });
    }

    const data: ConnCtx = {
      userId: payload.userId,
      serverId: payload.serverId,
      host: serverRow.ipAddress,
      privateKey,
      clientIp: ip,
      sessionId,
      ssh: null,
      bytesIn: 0,
      bytesOut: 0,
      ended: false,
    };

    if (srv.upgrade(req, { data })) return;
    // Upgrade failed — roll back the audit row
    await finish(data, 'upgrade_failed');
    return new Response('upgrade failed', { status: 400 });
  },

  websocket: {
    async open(ws) {
      const ctx = ws.data;
      try {
        const ssh = await openSshSession({
          host: ctx.host,
          privateKey: ctx.privateKey,
          cols: 80,
          rows: 24,
        });
        ctx.ssh = ssh;
        ssh.stream.on('data', (chunk: Buffer) => {
          ctx.bytesOut += chunk.length;
          if (ws.readyState === 1) ws.send(chunk);
        });
        ssh.stream.stderr?.on('data', (chunk: Buffer) => {
          ctx.bytesOut += chunk.length;
          if (ws.readyState === 1) ws.send(chunk);
        });
        ssh.stream.on('close', () => {
          void finish(ctx, 'ssh_close');
          try {
            ws.close(1000, 'ssh-closed');
          } catch {}
        });
      } catch (e) {
        console.error('[ssh] connect failed', e);
        void finish(ctx, 'ssh_connect_failed');
        try {
          ws.close(1011, 'ssh-connect-failed');
        } catch {}
      }
    },

    message(ws, message) {
      const ctx = ws.data;
      try {
        if (typeof message === 'string') {
          if (message.startsWith('{')) {
            const msg = JSON.parse(message);
            if (msg?.type === 'resize') {
              ctx.ssh?.resize(Number(msg.cols), Number(msg.rows));
              return;
            }
          }
          const buf = Buffer.from(message, 'utf8');
          ctx.bytesIn += buf.length;
          ctx.ssh?.stream.write(buf);
          return;
        }
        // Binary
        const buf = Buffer.isBuffer(message)
          ? message
          : Buffer.from(message as ArrayBuffer);
        ctx.bytesIn += buf.length;
        ctx.ssh?.stream.write(buf);
      } catch (e) {
        console.error('[ws->ssh] error', e);
      }
    },

    close(ws) {
      void finish(ws.data, 'client_close');
    },
  },
});

console.log(`[bridge] listening on :${server.port}`);

// Drain active connections on SIGTERM (Coolify sends this on redeploy).
// `stop(true)` tells Bun to close existing connections; client `close` handlers
// then fire and flush `terminal_sessions.ended_at` via `finish()`.
process.on('SIGTERM', () => {
  console.log('[bridge] SIGTERM received, draining');
  server.stop(true);
});
process.on('SIGINT', () => {
  console.log('[bridge] SIGINT received, draining');
  server.stop(true);
});
