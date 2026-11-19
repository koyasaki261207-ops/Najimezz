import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { deflateSync } from "node:zlib";

const SIZE = 512;
const OUTPUT_PATH = resolve(process.cwd(), "src-tauri/icons/icon.png");

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function insideRoundedRect(x, y, left, top, width, height, radius) {
  const right = left + width;
  const bottom = top + height;
  if (x < left || x > right || y < top || y > bottom) return false;
  const cx = Math.max(left + radius, Math.min(x, right - radius));
  const cy = Math.max(top + radius, Math.min(y, bottom - radius));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function insideEllipse(x, y, cx, cy, rx, ry) {
  const nx = (x - cx) / rx;
  const ny = (y - cy) / ry;
  return nx * nx + ny * ny <= 1;
}

function renderPixel(x, y) {
  const inOuter = insideRoundedRect(x, y, 24, 24, 464, 464, 112);
  if (!inOuter) return [0, 0, 0, 0];

  let r = 240;
  let g = 244;
  let b = 255;

  const inBody = insideRoundedRect(x, y, 108, 152, 296, 224, 88);
  const inLeftEar = insideEllipse(x, y, 168, 168, 48, 56);
  const inRightEar = insideEllipse(x, y, 344, 168, 48, 56);

  if (inBody || inLeftEar || inRightEar) {
    r = 12;
    g = 14;
    b = 20;

    if (y > 304 && inBody) {
      const t = Math.max(0, Math.min(1, (x - 108) / 296));
      const v = Math.max(0, Math.min(1, (y - 304) / 72));
      const gr = Math.round(16 + t * 145);
      const gg = Math.round(182 - t * 116);
      const gb = Math.round(255 - t * 10);
      r = Math.round(r * (1 - v) + gr * v);
      g = Math.round(g * (1 - v) + gg * v);
      b = Math.round(b * (1 - v) + gb * v);
    }

    const leftEye = insideEllipse(x, y, 212, 256, 20, 34);
    const rightEye = insideEllipse(x, y, 300, 256, 20, 34);
    if (leftEye || rightEye) {
      r = 255;
      g = 255;
      b = 255;
    }
  }

  return [r, g, b, 255];
}

function createPng() {
  const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
  for (let y = 0; y < SIZE; y++) {
    const rowOffset = y * (1 + SIZE * 4);
    raw[rowOffset] = 0;
    for (let x = 0; x < SIZE; x++) {
      const [r, g, b, a] = renderPixel(x, y);
      const px = rowOffset + 1 + x * 4;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const compressed = deflateSync(raw);

  return Buffer.concat([
    signature,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, createPng());
console.log(`Generated base icon at ${OUTPUT_PATH}`);
