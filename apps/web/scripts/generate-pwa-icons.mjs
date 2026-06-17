/**
 * Generátor PWA ikon (M0 follow-up) — deterministický, bez externích závislostí.
 *
 * Vykreslí procedurální pixel-art ikonu „60" v brand barvách (gold na tmavém
 * podkladu, viz app.css tokeny) na malé logické mřížce 32×32 a nearest-neighbor
 * upscalem ji vyrenderuje do reálných PNG (192/512/maskable/apple-touch/favicon).
 *
 * PNG se kóduje ručně přes vestavěný `zlib` (deflate) + CRC32 → žádný `canvas`
 * ani `sharp`. Spouštět `node scripts/generate-pwa-icons.mjs`; výstup commitujeme
 * do `static/`, aby build nezávisel na běhu skriptu (deterministické, recenzovatelné).
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = join(__dirname, '..', 'static');

// --- Brand paleta (drží se app.css) -----------------------------------------
const BG_TOP = [0x24, 0x1a, 0x12];
const BG_BOTTOM = [0x14, 0x10, 0x0c];
const GOLD = [0xd4, 0xa0, 0x4c];
const GOLD_BRIGHT = [0xf0, 0xc8, 0x70];

const L = 32; // logická mřížka

// 5×7 bitmapy číslic
const GLYPHS = {
  6: ['.XXX.', 'X....', 'X....', 'XXXX.', 'X...X', 'X...X', '.XXX.'],
  0: ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
};

/** Rounded-rect test na logické mřížce L×L s poloměrem r. */
function inRoundRect(x, y, r) {
  const minX = r,
    maxX = L - 1 - r,
    minY = r,
    maxY = L - 1 - r;
  let cx = x,
    cy = y;
  if (x < minX) cx = minX;
  else if (x > maxX) cx = maxX;
  if (y < minY) cy = minY;
  else if (y > maxY) cy = maxY;
  const dx = x - cx,
    dy = y - cy;
  return dx * dx + dy * dy <= (r + 0.5) * (r + 0.5);
}

function lerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/**
 * Vykreslí logickou mřížku do pole [r,g,b,a] per pixel (délka L*L*4).
 * maskable = full-bleed (bez průhledných rohů, bez okrajového rámu) pro
 * platformy, které ikonu ořezávají do kruhu/squircle.
 */
function renderGrid(maskable) {
  const px = new Uint8Array(L * L * 4);
  const set = (x, y, c, a = 255) => {
    if (x < 0 || y < 0 || x >= L || y >= L) return;
    const i = (y * L + x) * 4;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
    px[i + 3] = a;
  };

  const radius = maskable ? 0 : 5;
  // Podklad (vertikální gradient) + případný gold rám.
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      if (!maskable && !inRoundRect(x, y, radius)) continue; // průhledný roh
      const bg = lerp(BG_TOP, BG_BOTTOM, y / (L - 1));
      set(x, y, bg);
    }
  }
  if (!maskable) {
    // Tenký gold rám 1px kousek od kraje.
    for (let y = 0; y < L; y++) {
      for (let x = 0; x < L; x++) {
        if (!inRoundRect(x, y, radius)) continue;
        const onEdge = !inRoundRect(x, y, radius + 1.4);
        if (onEdge) set(x, y, GOLD, 220);
      }
    }
  }

  // „60" — dvě číslice 5×7 zvětšené 2× (10×14), vystředěné.
  const scale = 2;
  const glyphW = 5 * scale;
  const glyphH = 7 * scale;
  const gap = 2;
  const totalW = glyphW * 2 + gap;
  const x0 = Math.round((L - totalW) / 2);
  const y0 = Math.round((L - glyphH) / 2);
  const digits = [6, 0];
  digits.forEach((d, di) => {
    const rows = GLYPHS[d];
    const baseX = x0 + di * (glyphW + gap);
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (rows[gy][gx] !== 'X') continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const x = baseX + gx * scale + sx;
            const y = y0 + gy * scale + sy;
            // jemný shora-dolů gradient na číslicích (bright → gold)
            const c = lerp(GOLD_BRIGHT, GOLD, gy / 6);
            set(x, y, c);
          }
        }
      }
    }
  });

  return px;
}

/** Nearest-neighbor upscale logické mřížky na size×size RGBA buffer. */
function upscale(grid, size) {
  const out = Buffer.alloc(size * size * 4);
  const f = size / L;
  for (let y = 0; y < size; y++) {
    const gy = Math.floor(y / f);
    for (let x = 0; x < size; x++) {
      const gx = Math.floor(x / f);
      const si = (gy * L + gx) * 4;
      const di = (y * size + x) * 4;
      out[di] = grid[si];
      out[di + 1] = grid[si + 1];
      out[di + 2] = grid[si + 2];
      out[di + 3] = grid[si + 3];
    }
  }
  return out;
}

// --- minimální PNG enkodér (RGBA, 8bit) -------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(rgba, size) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // raw scanlines s filtrem 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- generování -------------------------------------------------------------
mkdirSync(STATIC_DIR, { recursive: true });

const standard = renderGrid(false);
const maskable = renderGrid(true);

const targets = [
  { file: 'favicon.png', size: 64, grid: standard },
  { file: 'icon-192.png', size: 192, grid: standard },
  { file: 'icon-512.png', size: 512, grid: standard },
  { file: 'icon-192-maskable.png', size: 192, grid: maskable },
  { file: 'icon-512-maskable.png', size: 512, grid: maskable },
  { file: 'apple-touch-icon.png', size: 192, grid: maskable },
];

for (const { file, size, grid } of targets) {
  const png = encodePng(upscale(grid, size), size);
  writeFileSync(join(STATIC_DIR, file), png);
  console.log(`wrote static/${file} (${size}×${size}, ${png.length} B)`);
}
