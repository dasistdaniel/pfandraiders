// Erzeugt das Vorschaubild für Link-Vorschauen und das Apple-Touch-Icon aus packages/client/src/socialPreview.ts.
// Aufruf: npm run social. Nur Node-Bordmittel: zlib packt die PNG-Daten (RGB, 8 Bit, ohne Zeilenfilter).
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { renderSocialPreview, renderTouchIcon } from '../packages/client/src/socialPreview.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** CRC-32 wie im PNG-Standard (zlib.crc32 gibt es erst ab Node 22.2). */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** RGB-Raster als PNG: Signatur, IHDR, ein IDAT (jede Zeile mit Filterbyte 0), IEND. Deterministisch. */
function encodePng({ width, height, data }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bittiefe
  ihdr[9] = 2; // Farbtyp RGB
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [rel, image] of [
  ['packages/client/public/social-preview.png', renderSocialPreview()],
  ['packages/client/public/apple-touch-icon.png', renderTouchIcon()],
]) {
  const png = encodePng(image);
  writeFileSync(join(root, rel), png);
  console.log(`${rel} (${image.width}x${image.height}, ${png.length} Bytes)`);
}
