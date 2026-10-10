import { currentBuild, startupLine } from './buildInfo';
import { startServer } from './server';
import type { RunningServer } from './server';
import { mapIdWarning, parseGraceMs, parseMapId, parseRoundMs, parseWsCompression, SERVER_CONFIG } from './config';

const port = Number(process.env.PORT ?? 8080);
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);
const round = parseRoundMs(process.env.ROUND_MS);
const roundMs = round.value;
if (round.invalid) {
  console.warn(`ROUND_MS=${process.env.ROUND_MS} ist ungültig (mindestens 1000), Standardwert wird genutzt.`);
}
const graceRaw = process.env.GRACE_MS;
const graceMs = parseGraceMs(graceRaw, SERVER_CONFIG.graceMs);
if (graceRaw?.trim() && graceMs === SERVER_CONFIG.graceMs && Number(graceRaw.trim()) !== graceMs) {
  console.warn(`GRACE_MS=${graceRaw} ist ungültig (ganze Zahl, 5000 bis 3600000), Standardwert ${SERVER_CONFIG.graceMs} wird genutzt.`);
}

const map = parseMapId(process.env.MAP_ID);
const mapId = map.value;
if (map.invalid) console.warn(mapIdWarning(process.env.MAP_ID));

const comp = parseWsCompression(process.env.WS_COMPRESSION);
const compression = comp.value;
if (comp.invalid) console.warn(`WS_COMPRESSION=${process.env.WS_COMPRESSION} ist ungültig (on oder off), Kompression bleibt an.`);

// Letzte Rettung: loggen und weiterlaufen, damit ein Fehler nicht alle Räume beendet
process.on('uncaughtException', (err) => {
  console.error('Unbehandelte Ausnahme:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unbehandelte Zusage:', reason);
});

const build = currentBuild();
let running: RunningServer | null = null;

startServer({ port, allowedOrigins, roundMs, graceMs, mapId, compression })
  .then((srv) => {
    running = srv;
    console.log(startupLine(srv.port, build));
    if (!compression) console.log('WS_COMPRESSION=off: Nachrichten gehen unkomprimiert hinaus.');
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
