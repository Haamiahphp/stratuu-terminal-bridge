function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const env = {
  jwtSecret: required('TERMINAL_JWT_SECRET'),
  keyMaster: required('TERMINAL_KEY_MASTER'),
  databaseUrl: required('DATABASE_URL'),
  port: Number(process.env.PORT ?? 8080),
  allowedOrigin: process.env.ALLOWED_ORIGIN ?? '*',
};

if (env.jwtSecret.length < 32) {
  throw new Error('TERMINAL_JWT_SECRET must be ≥ 32 chars');
}
if (!/^[0-9a-fA-F]{64}$/.test(env.keyMaster)) {
  throw new Error('TERMINAL_KEY_MASTER must be 64 hex chars (32 bytes)');
}
