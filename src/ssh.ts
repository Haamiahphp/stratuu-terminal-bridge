import { Client, ClientChannel } from 'ssh2';

export interface SshSession {
  stream: ClientChannel;
  resize(cols: number, rows: number): void;
  close(): void;
}

export async function openSshSession(params: {
  host: string;
  port?: number;
  username?: string;
  privateKey: string;
  cols: number;
  rows: number;
}): Promise<SshSession> {
  const conn = new Client();

  return new Promise<SshSession>((resolve, reject) => {
    let settled = false;
    const settleError = (e: Error) => {
      if (settled) return;
      settled = true;
      reject(e);
    };

    conn.on('ready', () => {
      conn.shell(
        { term: 'xterm-256color', cols: params.cols, rows: params.rows },
        (err, stream) => {
          if (err) {
            settleError(err);
            conn.end();
            return;
          }
          settled = true;
          resolve({
            stream,
            resize(cols, rows) {
              stream.setWindow(rows, cols, 0, 0);
            },
            close() {
              try {
                stream.end();
              } catch {}
              try {
                conn.end();
              } catch {}
            },
          });
        }
      );
    });
    conn.on('error', settleError);
    conn.on('close', () => {
      if (!settled) settleError(new Error('SSH connection closed before ready'));
    });

    conn.connect({
      host: params.host,
      port: params.port ?? 22,
      username: params.username ?? 'root',
      privateKey: params.privateKey,
      readyTimeout: 10_000,
    });
  });
}
