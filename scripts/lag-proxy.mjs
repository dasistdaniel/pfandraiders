#!/usr/bin/env node
// Lag-Proxy für Netz-Tests: reicht WebSocket-Frames zwischen Client und Server mit Verzögerung, Jitter und Staus
// weiter (beide Richtungen, nie umsortiert). Beispiel:
//
//   node scripts/lag-proxy.mjs --listen 8081 --target ws://localhost:8080 --delay 80 --jitter 60 \
//     --burst-every 3000 --burst-ms 500 --loss-stall 0
//   node scripts/lag-proxy.mjs --preset steam
//
// Client dann mit ?server=ws://localhost:8081&debug=net öffnen. Siehe README ("Netz testen") und docs/NETZ.md.
import { WebSocket, WebSocketServer } from 'ws';
import { LagLine, lineOptions, OrderedQueue, parseArgs } from './lagSchedule.mjs';

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
} catch (err) {
  console.error(String(err.message ?? err));
  console.error('Optionen: --listen PORT --target ws://… --delay MS --jitter MS --burst-every MS --burst-ms MS --loss-stall P --stall-dir both|down|up --preset wifi|congested|steam');
  process.exit(2);
}

const start = Date.now();
const summary = { up: [], down: [] };
let nextId = 1;
const conns = new Set();

const wss = new WebSocketServer({ port: opts.listen });
wss.on('listening', () => {
  const { delay, jitter, burstEvery, burstMs, lossStall, preset } = opts;
  console.log(
    `lag-proxy: ws://localhost:${opts.listen} -> ${opts.target}` +
      `${preset ? ` (preset ${preset})` : ''}: delay ${delay} ms, jitter ±${jitter} ms, ` +
      `${burstEvery > 0 && burstMs > 0 ? `Stau ${burstMs} ms alle ${burstEvery} ms` : 'keine Staus'}, loss-stall ${lossStall}, Staus: ${opts.stallDir}`,
  );
});

wss.on('connection', (client, req) => {
  const id = nextId++;
  // Gleicher Pfad, Origin weiterreichen (der Server prüft ALLOWED_ORIGINS)
  const url = new URL(req.url ?? '/', opts.target).toString();
  const headers = req.headers.origin ? { origin: req.headers.origin } : {};
  const upstream = new WebSocket(url, { headers });
  // Staus liegen für beide Richtungen und alle Verbindungen im selben Takt (seit Start des Proxys)
  const up = new OrderedQueue(new LagLine(lineOptions(opts, 'up'), Math.random, start), (m) => sendTo(upstream, m));
  const down = new OrderedQueue(new LagLine(lineOptions(opts, 'down'), Math.random, start), (m) => sendTo(client, m));
  const conn = { id, up, down };
  conns.add(conn);
  console.log(`[${id}] verbunden`);

  const size = (data) => (Array.isArray(data) ? data.reduce((a, b) => a + b.length, 0) : (data.byteLength ?? 0));
  client.on('message', (data, isBinary) => up.push({ data, isBinary }, size(data)));
  upstream.on('message', (data, isBinary) => down.push({ data, isBinary }, size(data)));

  let closed = false;
  const closeBoth = (why) => {
    if (closed) return;
    closed = true;
    collect(conn);
    up.dispose();
    down.dispose();
    conns.delete(conn);
    for (const ws of [client, upstream]) {
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
      } catch {
        ws.terminate();
      }
    }
    console.log(`[${id}] getrennt (${why})`);
  };
  client.on('close', () => closeBoth('Client'));
  upstream.on('close', () => closeBoth('Server'));
  client.on('error', () => closeBoth('Client-Fehler'));
  upstream.on('error', (err) => closeBoth(`Server-Fehler: ${err.message}`));
});

/** Schickt einen Frame weiter; vor dem Öffnen des Ziels wartet er (Reihenfolge bleibt). */
function sendTo(ws, m) {
  const frame = { data: m.data, binary: m.isBinary };
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(frame.data, { binary: frame.binary });
  } else if (ws.readyState === WebSocket.CONNECTING) {
    (ws.pendingFrames ??= []).push(frame);
    if (!ws.pendingHooked) {
      ws.pendingHooked = true;
      ws.once('open', () => {
        for (const f of ws.pendingFrames) ws.send(f.data, { binary: f.binary });
        ws.pendingFrames = [];
      });
    }
  }
}

function collect(conn) {
  summary.up.push(conn.up.takeStats());
  summary.down.push(conn.down.takeStats());
}

function line(name, list) {
  const s = list.reduce(
    (a, b) => ({ frames: a.frames + b.frames, bytes: a.bytes + b.bytes, delaySum: a.delaySum + b.delaySum, maxDelay: Math.max(a.maxDelay, b.maxDelay), held: a.held + b.held }),
    { frames: 0, bytes: 0, delaySum: 0, maxDelay: 0, held: 0 },
  );
  const avg = s.frames > 0 ? Math.round(s.delaySum / s.frames) : 0;
  return `${name} ${String(s.frames).padStart(4)} Frames ${String(Math.round(s.bytes / 1024)).padStart(5)} KiB, Verzögerung Ø ${avg} ms max ${Math.round(s.maxDelay)} ms, im Stau gehalten ${s.held}`;
}

setInterval(() => {
  for (const c of conns) collect(c);
  const pending = [...conns].reduce((a, c) => a + c.up.pending + c.down.pending, 0);
  console.log(`--- 5 s: ${conns.size} Verbindung(en), ${pending} Frames in der Leitung`);
  console.log(`  ${line('Client->Server', summary.up)}`);
  console.log(`  ${line('Server->Client', summary.down)}`);
  summary.up = [];
  summary.down = [];
}, 5000).unref();
