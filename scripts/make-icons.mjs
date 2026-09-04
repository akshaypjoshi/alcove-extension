/**
 * Generates the extension icons. Doing it in-repo rather than committing
 * binaries keeps the design editable — change the two colours below and
 * re-run `node scripts/make-icons.mjs`.
 *
 * Written against zlib + a hand-rolled PNG chunk writer so the repo needs
 * no image dependency for a task this small.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const FROM = [79, 70, 229]; // indigo-600
const TO = [217, 70, 239]; // fuchsia-500

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // Each scanline is prefixed with a filter byte; 0 = none.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Coverage of a rounded square, antialiased by 3x3 supersampling. */
function roundedCoverage(x, y, size, radius) {
  let hits = 0;
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      const px = x + (sx + 0.5) / 3;
      const py = y + (sy + 0.5) / 3;
      const dx = Math.max(radius - px, px - (size - radius), 0);
      const dy = Math.max(radius - py, py - (size - radius), 0);
      if (Math.hypot(dx, dy) <= radius) hits++;
    }
  }
  return hits / 9;
}

/** Four-pointed sparkle: a superellipse with an exponent below 1 is concave. */
function sparkleCoverage(x, y, size) {
  const c = size / 2;
  const r = size * 0.34;
  let hits = 0;
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      const dx = Math.abs(x + (sx + 0.5) / 3 - c) / r;
      const dy = Math.abs(y + (sy + 0.5) / 3 - c) / r;
      if (Math.sqrt(dx) + Math.sqrt(dy) <= 1) hits++;
    }
  }
  return hits / 9;
}

mkdirSync("public/icon", { recursive: true });

for (const size of [16, 32, 48, 96, 128]) {
  const pixels = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const t = (x + y) / (2 * size); // diagonal gradient
      const base = [0, 1, 2].map((c) => Math.round(FROM[c] + (TO[c] - FROM[c]) * t));

      const square = roundedCoverage(x, y, size, radius);
      const star = sparkleCoverage(x, y, size);

      // Composite the white sparkle over the gradient, then mask both by
      // the rounded square so the corners stay transparent.
      for (let c = 0; c < 3; c++) {
        pixels[i + c] = Math.round(base[c] * (1 - star) + 255 * star);
      }
      pixels[i + 3] = Math.round(255 * square);
    }
  }

  writeFileSync(`public/icon/${size}.png`, png(size, pixels));
  console.log(`public/icon/${size}.png`);
}
