// Pixel diff of two capture folders (PNG): mean absolute difference per 64-px tile, per image.
//   node tools/pixdiff.mjs <dirA> <dirB> [--tile 64] [--noise <dirA2>] [--heat <outDir>] [--mask <dirOfMasks>]
// --noise: a second capture of A (same build, same session) to learn the capture noise per tile; a tile of B
//          "changes" when its difference exceeds the largest A-vs-A2 difference of that image plus 0.5 levels.
// --heat:  writes a heat map PNG per image (tile difference, white = 8 levels or more).
// --mask:  PNG masks with the same file names; tiles with any mask pixel set are reported separately.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const [dirA, dirB] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const T = +opt('tile', 64);

export function readPNG(file) {
  const buf = fs.readFileSync(file);
  let o = 8, w = 0, h = 0, ct = 0, bd = 0;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  if (bd !== 8 || (ct !== 6 && ct !== 2)) throw new Error(`${file}: unsupported PNG (bit depth ${bd}, colour type ${ct})`);
  const bpp = ct === 6 ? 4 : 3, stride = w * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(w * h * 4);
  const prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 255;
    }
    for (let x = 0; x < w; x++) { const s = x * bpp, d = (y * w + x) * 4; px[d] = cur[s]; px[d + 1] = cur[s + 1]; px[d + 2] = cur[s + 2]; px[d + 3] = 255; }
    prev.set(cur);
  }
  return { w, h, px };
}

function writePNG(file, w, h, gray) {
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w + 1)] = 0; for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = gray[y * w + x]; }
  const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii'); data.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + data.length)), 8 + data.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc(b) { let c = 0xffffffff; for (const v of b) c = CRC[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function tileDiff(A, B) {
  const tw = Math.ceil(A.w / T), th = Math.ceil(A.h / T);
  const out = new Float32Array(tw * th);
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    let s = 0, n = 0;
    for (let y = ty * T; y < Math.min((ty + 1) * T, A.h); y++) for (let x = tx * T; x < Math.min((tx + 1) * T, A.w); x++) {
      const i = (y * A.w + x) * 4;
      s += Math.abs(A.px[i] - B.px[i]) + Math.abs(A.px[i + 1] - B.px[i + 1]) + Math.abs(A.px[i + 2] - B.px[i + 2]);
      n += 3;
    }
    out[ty * tw + tx] = s / n;
  }
  return { tw, th, d: out };
}

if (dirA && dirB) {
  const files = fs.readdirSync(dirA).filter((f) => f.endsWith('.png') && fs.existsSync(path.join(dirB, f)));
  const noiseDir = opt('noise', ''), heat = opt('heat', ''), maskDir = opt('mask', '');
  if (heat) fs.mkdirSync(heat, { recursive: true });
  console.log(`| Image | mean diff | max tile | noise max tile | tiles over noise${maskDir ? ' (outside mask / inside)' : ''} |`);
  console.log(`|---|---|---|---|---|`);
  for (const f of files) {
    const A = readPNG(path.join(dirA, f)), B = readPNG(path.join(dirB, f));
    const td = tileDiff(A, B);
    let noise = 0;
    if (noiseDir && fs.existsSync(path.join(noiseDir, f))) { const N = tileDiff(A, readPNG(path.join(noiseDir, f))); noise = Math.max(...N.d); }
    let mask = null;
    if (maskDir && fs.existsSync(path.join(maskDir, f))) {
      const M = readPNG(path.join(maskDir, f));
      mask = new Uint8Array(td.d.length);
      for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) if (M.px[(y * M.w + x) * 4] > 127) mask[Math.floor(y / T) * td.tw + Math.floor(x / T)] = 1;
    }
    const thr = noise + 0.5;
    let over = 0, overIn = 0;
    td.d.forEach((v, i) => { if (v > thr) { if (mask && mask[i]) overIn++; else over++; } });
    const mean = td.d.reduce((a, b) => a + b, 0) / td.d.length;
    console.log(`| ${f} | ${mean.toFixed(3)} | ${Math.max(...td.d).toFixed(2)} | ${noiseDir ? noise.toFixed(2) : '-'} | ${over}${mask ? ' / ' + overIn : ''} of ${td.d.length} |`);
    if (heat) {
      const g = new Uint8Array(td.tw * td.th);
      td.d.forEach((v, i) => { g[i] = Math.min(255, Math.round(v / 8 * 255)); });
      writePNG(path.join(heat, f), td.tw, td.th, g);
    }
  }
}
