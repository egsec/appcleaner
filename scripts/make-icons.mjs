// Uygulama ikonlarını harici bağımlılık olmadan üretir (SDF tabanlı raster):
// yuvarlatılmış teal zemin üzerinde beyaz süpürge + parıltılar.
// Çıktılar: src-tauri/icons/{32x32,128x128,512x512}.png ve icon.ico
import { deflateSync, crc32 } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "src-tauri", "icons");
mkdirSync(iconsDir, { recursive: true });

// --- SDF yardımcıları (koordinatlar 0..1 uzayında) ---
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const smooth = (d, aa) => clamp(0.5 - d / aa, 0, 1); // d<0 içeride

function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

function sdCapsule(px, py, ax, ay, bx, by, r) {
  const pax = px - ax, pay = py - ay;
  const bax = bx - ax, bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h) - r;
}

function sdCircle(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) - r;
}

// Konveks dörtgen SDF (saat yönünde köşeler)
function sdQuad(px, py, pts) {
  let inside = true;
  let minDist = Infinity;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % 4];
    const ex = bx - ax, ey = by - ay;
    const wx = px - ax, wy = py - ay;
    const cross = ex * wy - ey * wx;
    if (cross < 0) inside = false;
    const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
    minDist = Math.min(minDist, Math.hypot(wx - ex * t, wy - ey * t));
  }
  return inside ? -minDist : minDist;
}

function makePixels(size) {
  const px = Buffer.alloc(size * size * 4);
  const aa = 1.5 / size;

  // süpürge geometrisi: sap sağ üstten ortaya, fırça sol alta doğru genişler
  const stick = { ax: 0.72, ay: 0.16, bx: 0.46, by: 0.55, r: 0.035 };
  const head = [
    [0.40, 0.52], // üst sol
    [0.52, 0.52], // üst sağ
    [0.46, 0.82], // alt sağ
    [0.18, 0.72], // alt sol
  ];
  const sparkles = [
    { x: 0.70, y: 0.62, r: 0.030 },
    { x: 0.62, y: 0.76, r: 0.022 },
    { x: 0.80, y: 0.74, r: 0.018 },
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const i = (y * size + x) * 4;

      // zemin: yuvarlatılmış kare, dikey teal degrade
      const bg = sdRoundRect(u, v, 0.5, 0.5, 0.46, 0.46, 0.11);
      const bgA = smooth(bg, aa);
      let r = 45 - 25 * v;
      let g = 190 - 75 * v;
      let b = 175 - 55 * v;
      let alpha = bgA;

      // hafif üst parlaklık
      const gloss = sdRoundRect(u, v, 0.5, 0.28, 0.40, 0.16, 0.1);
      const glossA = smooth(gloss, 0.02) * 0.10;
      r += 255 * glossA; g += 255 * glossA; b += 255 * glossA;

      // süpürge: beyaz sap + fırça
      let broom = sdCapsule(u, v, stick.ax, stick.ay, stick.bx, stick.by, stick.r);
      broom = Math.min(broom, sdQuad(u, v, head));
      const broomA = smooth(broom, aa);
      // fırça kılları: baş bölgesinde eğik koyu çizgiler
      let bristle = 0;
      if (broomA > 0 && v > 0.54) {
        const t = (u * 0.9 + (v - 0.54) * 0.35) * 5.2;
        const fr = Math.abs(t - Math.round(t)) * 2; // 0..1 testere
        bristle = fr < 0.22 ? 0.22 : 0;
      }
      const wr = 250 - 160 * bristle;
      r = r * (1 - broomA) + wr * broomA;
      g = g * (1 - broomA) + wr * broomA;
      b = b * (1 - broomA) + wr * broomA;

      // parıltılar
      for (const s of sparkles) {
        const sa = smooth(sdCircle(u, v, s.x, s.y, s.r), aa);
        r = r * (1 - sa) + 255 * sa;
        g = g * (1 - sa) + 255 * sa;
        b = b * (1 - sa) + 255 * sa;
      }

      px[i] = clamp(Math.round(r), 0, 255);
      px[i + 1] = clamp(Math.round(g), 0, 255);
      px[i + 2] = clamp(Math.round(b), 0, 255);
      px[i + 3] = Math.round(255 * alpha);
    }
  }
  return px;
}

// --- PNG kodlayıcı ---
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit derinliği
  ihdr[9] = 6; // RGBA
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- ICO kodlayıcı (BMP girdili) ---
function encodeIco(size, rgba) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // tip: ikon
  header.writeUInt16LE(1, 4); // görüntü sayısı

  const xorSize = size * size * 4;
  const andSize = (size * size) / 8;
  const bmpSize = 40 + xorSize + andSize;

  const entry = Buffer.alloc(16);
  entry[0] = size === 256 ? 0 : size;
  entry[1] = size === 256 ? 0 : size;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(bmpSize, 8);
  entry.writeUInt32LE(22, 12);

  const bih = Buffer.alloc(40);
  bih.writeUInt32LE(40, 0);
  bih.writeInt32LE(size, 4);
  bih.writeInt32LE(size * 2, 8);
  bih.writeUInt16LE(1, 12);
  bih.writeUInt16LE(32, 14);
  bih.writeUInt32LE(xorSize + andSize, 20);

  const xor = Buffer.alloc(xorSize);
  for (let y = 0; y < size; y++) {
    const srcRow = size - 1 - y;
    for (let x = 0; x < size; x++) {
      const s = (srcRow * size + x) * 4;
      const d = (y * size + x) * 4;
      xor[d] = rgba[s + 2];
      xor[d + 1] = rgba[s + 1];
      xor[d + 2] = rgba[s];
      xor[d + 3] = rgba[s + 3];
    }
  }
  return Buffer.concat([header, entry, bih, xor, Buffer.alloc(andSize)]);
}

for (const size of [32, 128, 512]) {
  writeFileSync(join(iconsDir, `${size}x${size}.png`), encodePng(size, makePixels(size)));
}
writeFileSync(join(iconsDir, "icon.ico"), encodeIco(32, makePixels(32)));
console.log("ikonlar üretildi →", iconsDir);
