// Text for the airships' LED bands. A small atlas of its own (1024 x 1024, r8unorm with mips, one 128 px row per
// page), so the shared sign atlas is not repacked (review-1 fix 12). Invented brands and slogans, Chinese and Latin,
// in the voice of the city's other signage.
//
// I-020: the band shows pages instead of a scrolling ticker. Each ship has two pages (the Chinese brand, then the
// Latin line), and each page is fitted inside the band, so no word is ever cut at the band's ends. The shader maps
// one atlas width to BAND_TEX_M m of band, centred on the band's middle (hull z = BAND_MID), and reads it left to
// right from either side of the hull.

export const SKY_WORDS = [
  ['云端银行', 'CLOUDBANK'],
  ['天舟航天', 'TIANZHOU ORBITAL'],
  ['霓虹快递', 'NEON EXPRESS'],
];
export const PAGES_PER_SHIP = 2;
export const PAGE_ROWS = 8;          // atlas rows (6 used)
export const BAND_MID = 11;          // hull z (m): the band is fully lit from z = -36 to 58 (skyopsWgsl.js)
export const BAND_TEX_M = 100;       // m of band per atlas width (10.24 px per m, the same type scale as round 4)
export const W = 1024, ROW = 128, H = ROW * PAGE_ROWS; // atlas size (px)
export const TEXT_MAX = 880;         // px: 86 m, inside the 94 m fully lit band with 4 m to spare at each end
const SIZE = 108;                    // px type height (as in round 4), reduced only when a page would not fit

// atlas row of page p (0 Chinese, 1 Latin) of ship i
export function pageRow(i, p) { return i * PAGES_PER_SHIP + p; }

// The text of each page: the Chinese brand set between two diamonds, and the Latin line.
export function pageTexts() {
  const out = [];
  for (const [zh, en] of SKY_WORDS) out.push('◆  ' + zh + '  ◆', en);
  return out;
}

// Position along the band (m from its middle) of the hull-local point (x, z), increasing to the right as seen from
// outside that side of the hull. The same mapping as `s` in SKY_OPAQUE_WGSL (kept here for tools/skyops-test.mjs).
export function bandS(x, z) { return x > 0 ? BAND_MID - z : z - BAND_MID; }
// Half the widest page, in m along the band.
export const TEXT_HALF_M = TEXT_MAX / 2 * BAND_TEX_M / W;

// Font size that fits `text` in TEXT_MAX px, given its width at SIZE px.
export function fitSize(width) { return width > TEXT_MAX ? Math.floor(SIZE * TEXT_MAX / width) : SIZE; }

export function buildSkyAtlas(device) {
  const cv = new OffscreenCanvas(W, H);
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff';
  g.textBaseline = 'middle'; g.textAlign = 'center';
  const font = (s) => `bold ${s}px "Microsoft YaHei", "SimHei", "Segoe UI", sans-serif`;
  const sizes = [];
  pageTexts().forEach((text, r) => {
    g.font = font(SIZE);
    const S = fitSize(g.measureText(text).width);
    g.font = font(S);
    g.fillText(text, W / 2, r * ROW + ROW / 2 + S * 0.05);
    sizes.push(S);
  });
  const levels = Math.floor(Math.log2(W)) + 1;
  const tex = device.createTexture({ label: 'skyops-led-atlas', size: [W, H], format: 'r8unorm', mipLevelCount: levels, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
  let src = cv, w = W, h = H;
  for (let l = 0; l < levels; l++) {
    if (l > 0) {
      const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1);
      const c = new OffscreenCanvas(nw, nh);
      const cg = c.getContext('2d');
      cg.imageSmoothingQuality = 'high';
      cg.drawImage(src, 0, 0, nw, nh);
      src = c; w = nw; h = nh;
    }
    const d = src.getContext('2d').getImageData(0, 0, w, h).data;
    const bpr = Math.ceil(w / 256) * 256;
    const out = new Uint8Array(bpr * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * bpr + x] = d[(y * w + x) * 4];
    device.queue.writeTexture({ texture: tex, mipLevel: l }, out, { bytesPerRow: bpr }, [w, h]);
  }
  return { texture: tex, view: tex.createView(), sizes, rows: PAGE_ROWS };
}
