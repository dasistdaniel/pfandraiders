import { startServer } from './server';
import type { RunningServer } from './server';

const port = Number(process.env.PORT ?? 8080);
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);
const roundMs = process.env.ROUND_MS ? Number(process.env.ROUND_MS) : undefined;

// Letzte Rettung: loggen und weiterlaufen, damit ein Fehler nicht alle Räume beendet
process.on('uncaughtException', (err) => {
  console.error('Unbehandelte Ausnahme:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unbehandelte Zusage:', reason);
});

let running: RunningServer | null = null;

startServer({ port, allowedOrigins, roundMs })
  .then((srv) => {
    running = srv;
    console.log(`PfandRaiders server listening on :${srv.port}`);
    if (allowedOrigins.length === 0) {
      console.warn('ALLOWED_ORIGINS is empty: every origin may connect (development only).');
    }
  })
  .catch((err: Error) => {
    console.error('Server konnte nicht starten:', err.message);
    process.exit(1);
  });

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    // Sicherheitsnetz: nach 3 s hart beenden
    setTimeout(() => process.exit(0), 3000).unref();
    if (!running) process.exit(0);
    else void running.close().then(() => process.exit(0));
  });
}
