// Tauri'nin Windows kaynak gömme adımı için gereken icon.ico ile
// Linux paketlemede kullanılan PNG'leri harici bağımlılık olmadan üretir.
import { deflateSync, crc32 } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "src-tauri", "icons");
mkdirSync(iconsDir, { recursive: true });

function makePixels(size) {
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const t = y / (size - 1);
      let r = Math.round(16 + 20 * t);
      let g = Math.round(150 - 60 * t);
      let b = Math.round(136 - 30 * t);
      // beyaz çapraz "süpürge izi"
      const d = Math.abs(x + y - size);
      if (d < size * 0.09) {
        r = g = b = 245;
      }
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }
  return px;
}

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
  ihdr[9] = 6; // renk tipi: RGBA
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filtre: none
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function encodeIco(size, rgba) {
  // BMP girdili tek görüntülük ICO
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // tip: ikon
  header.writeUInt16LE(1, 4); // görüntü sayısı

  const xorSize = size * size * 4;
  const andSize = (size * size) / 8;
  const bmpSize = 40 + xorSize + andSize;

  const entry = Buffer.alloc(16);
  entry[0] = size === 256 ? 0 : size;
  entry[1] = size === 256 ? 0 : size;
  entry.writeUInt16LE(1, 4); // düzlem
  entry.writeUInt16LE(32, 6); // bit/piksel
  entry.writeUInt32LE(bmpSize, 8);
  entry.writeUInt32LE(22, 12); // veri ofseti

  const bih = Buffer.alloc(40);
  bih.writeUInt32LE(40, 0);
  bih.writeInt32LE(size, 4);
  bih.writeInt32LE(size * 2, 8); // XOR + AND maskesi için çift yükseklik
  bih.writeUInt16LE(1, 12);
  bih.writeUInt16LE(32, 14);
  bih.writeUInt32LE(0, 16);
  bih.writeUInt32LE(xorSize + andSize, 20);

  // BMP alttan üste, BGRA sıralı
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

for (const size of [32, 128]) {
  writeFileSync(join(iconsDir, `${size}x${size}.png`), encodePng(size, makePixels(size)));
}
writeFileSync(join(iconsDir, "icon.ico"), encodeIco(32, makePixels(32)));
console.log("ikonlar üretildi →", iconsDir);
