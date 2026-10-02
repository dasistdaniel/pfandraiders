import { startServer } from './server';

const port = Number(process.env.PORT ?? 8080);
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

startServer({ port, allowedOrigins }).then((srv) => {
  console.log(`PfandRaiders server listening on :${srv.port}`);
  if (allowedOrigins.length === 0) {
    console.warn('ALLOWED_ORIGINS is empty: every origin may connect (development only).');
  }
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => process.exit(0));
}
