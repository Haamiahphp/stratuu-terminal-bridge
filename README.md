# stratuu-terminal-bridge

WebSocket ↔ SSH proxy for the Stratuu dashboard terminal panel.

Built on Bun: `Bun.serve` for HTTP/WS, `Bun.sql` for Postgres, plus `ssh2` for the SSH client. No Node runtime needed.

## Local development

```bash
cp .env.example .env
# Fill in TERMINAL_JWT_SECRET, TERMINAL_KEY_MASTER, DATABASE_URL
bun install
bun run dev
curl http://localhost:8080/healthz
```

## Deploy (Coolify on Stratuu Control VPS)

1. Coolify → New Resource → Public Git Repository → `github.com/Haamiahphp/stratuu-terminal-bridge`.
2. Build pack: Dockerfile.
3. Port mapping: container 8080.
4. Domain: `term.stratuu.dev` (Traefik + Let's Encrypt managed by Coolify).
5. Environment variables (set in Coolify UI — must match the dashboard's Vercel env):
   - `TERMINAL_JWT_SECRET` — same value as Vercel dashboard.
   - `TERMINAL_KEY_MASTER` — same value as Vercel dashboard.
   - `DATABASE_URL` — Neon connection string.
   - `ALLOWED_ORIGIN=https://app.stratuu.dev`
6. Healthcheck: `GET /healthz` → `200 ok`.

## DNS

Cloudflare: `term` A record → Control VPS IP (`2.24.203.246`). **Proxy status OFF (DNS-only)** — Cloudflare's free tier does not reliably forward long-lived WebSocket upgrades.

## Tests

```bash
bun test
```
