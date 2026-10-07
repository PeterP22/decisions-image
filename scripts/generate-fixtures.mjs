// Deterministic synthetic drawings. No external images, dependencies, or real data.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
const width = 640, height = 480;
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  const payload = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(payload));
  return Buffer.concat([size, payload, crc]);
}
function draw(name) {
  const pixels = Buffer.alloc((width * 3 + 1) * height);
  function rect(x, y, w, h, color) {
    for (let py = Math.max(0, y); py < Math.min(height, y + h); py++) for (let px = Math.max(0, x); px < Math.min(width, x + w); px++) {
      const offset = py * (width * 3 + 1) + 1 + px * 3;
      color.forEach((value, channel) => pixels[offset + channel] = value);
    }
  }
  function line(x1, y1, x2, y2, thickness, color) {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let i = 0; i <= steps; i++) rect(Math.round(x1 + (x2 - x1) * i / steps), Math.round(y1 + (y2 - y1) * i / steps), thickness, thickness, color);
  }
  rect(0, 0, width, height, [233, 234, 224]);
  rect(102, 390, 455, 15, [207, 209, 199]);
  rect(114, 110, 413, 280, [89, 61, 39]);
  rect(119, 115, 403, 270, [190, 139, 83]);
  rect(121, 117, 399, 58, [206, 160, 104]);
  rect(300, 115, 39, 270, [224, 191, 134]);
  line(120, 177, 520, 177, 3, [116, 81, 47]);
  rect(164, 245, 98, 76, [243, 237, 214]);
  for (let i = 0; i < 13; i++) rect(172 + i * 6, 279, 2 + (i % 2), 28, [64, 62, 54]);
  rect(172, 257, 65, 4, [123, 117, 99]);
  if (name === 'damaged') {
    line(420, 177, 382, 215, 13, [48, 37, 30]);
    line(382, 215, 430, 240, 12, [48, 37, 30]);
    line(430, 240, 398, 292, 14, [48, 37, 30]);
    line(398, 292, 449, 316, 11, [48, 37, 30]);
    line(429, 240, 474, 232, 7, [48, 37, 30]);
  }
  if (name === 'unclear') {
    // Occlusion makes the damage question ambiguous; fixture probability is illustrative.
    rect(270, 90, 283, 325, [128, 142, 136]);
    for (let x = 282; x < 550; x += 15) line(x, 95, x, 406, 4, [151, 163, 155]);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
mkdirSync(new URL('../samples/', import.meta.url), { recursive: true });
for (const name of ['intact', 'damaged', 'unclear']) writeFileSync(new URL(`../samples/${name}.png`, import.meta.url), draw(name));
console.log('Generated three synthetic 640 x 480 parcel images.');
