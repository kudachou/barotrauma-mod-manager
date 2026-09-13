/**
 * 生成应用图标（build/icon.png + build/icon.ico），与界面同款配色（青绿→天蓝 + 深色船锚）。
 * 纯 Node 实现：手写 PNG 编码 + 把 PNG 包进 ICO 容器，不依赖任何图形库。
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const S = 256;
const OUT_DIR = path.join(__dirname, '..', 'build');

/* ----------------------------- PNG 编码 ----------------------------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ------------------------------ 形状 ------------------------------ */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = clamp(x, x0 + r, x1 - r);
  const cy = clamp(y, y0 + r, y1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function inAnnulus(x, y, cx, cy, rOut, rIn) {
  const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
  return d2 <= rOut * rOut && d2 >= rIn * rIn;
}

function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const s = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
  const t = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  if (s < 0 !== t < 0) return false;
  const u = (cx - bx) * (py - by) - (cy - by) * (px - bx);
  return u < 0 === s < 0;
}

/** 船锚字形（与界面侧栏 logo 同款造型） */
function inGlyph(x, y) {
  // 顶部圆环
  if (inAnnulus(x, y, 128, 58, 16, 8.5)) return true;
  // 竖杆
  if (inRoundRect(x, y, 123.5, 68, 132.5, 196, 4.5)) return true;
  // 横杆
  if (inRoundRect(x, y, 95, 92, 161, 103, 5.5)) return true;
  // 底部 U 形弧
  const dx = x - 128;
  const dy = y - 138;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d <= 61 && d >= 50 && dy > -20) return true;
  // 两侧锚爪
  if (inTriangle(x, y, 66, 128, 84, 110, 90, 146)) return true;
  if (inTriangle(x, y, 190, 128, 172, 110, 166, 146)) return true;
  return false;
}

/** 圆角方形底板 */
function inPlate(x, y) {
  return inRoundRect(x, y, 8, 8, S - 8, S - 8, 54);
}

/* ------------------------------ 渲染 ------------------------------ */

const SS = 4; // 每像素 4x4 超采样，抗锯齿

function render() {
  const rgba = Buffer.alloc(S * S * 4);

  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      let plateCov = 0;
      let glyphCov = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = px + (sx + 0.5) / SS;
          const y = py + (sy + 0.5) / SS;
          if (inPlate(x, y)) plateCov++;
          if (inGlyph(x, y)) glyphCov++;
        }
      }

      const n = SS * SS;
      const plateA = plateCov / n;
      const glyphA = glyphCov / n;
      const i = (py * S + px) * 4;

      if (plateA === 0) continue;

      // 140° 渐变：青绿 → 天蓝
      const t = clamp((px * 0.64 + py * 0.77) / (S * 1.05), 0, 1);
      let r = lerp(0x4f, 0x38, t);
      let g = lerp(0xd1, 0xbd, t);
      let b = lerp(0xc5, 0xf8, t);

      // 深色船锚（#04222b）盖在渐变上
      const ga = glyphA * plateA;
      if (ga > 0) {
        r = lerp(r, 0x04, ga);
        g = lerp(g, 0x22, ga);
        b = lerp(b, 0x2b, ga);
      }

      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b);
      rgba[i + 3] = Math.round(plateA * 255);
    }
  }
  return rgba;
}

/* ------------------------- 打包成 ICO（内嵌 PNG） ------------------------- */

function makeICO(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count

  const entry = Buffer.alloc(16);
  entry[0] = 0; // width 0 = 256
  entry[1] = 0; // height 0 = 256
  entry[2] = 0; // palette
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8); // 数据长度
  entry.writeUInt32LE(6 + 16, 12); // 数据偏移

  return Buffer.concat([header, entry, png]);
}

const png = encodePNG(S, S, render());
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), png);
fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), makeICO(png));

console.log(`icon.png  ${png.length} B`);
console.log(`icon.ico  ${makeICO(png).length} B`);
console.log('输出目录: ' + OUT_DIR);
