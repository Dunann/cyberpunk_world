// Neon sign glyph atlas, rendered at init with Canvas2D using system fonts (the only Canvas2D texture we create).
// rg8unorm: R = crisp glyph mask (white on black), G = blurred mask (glow halo). Mips are generated with Canvas2D.

const W = 4096, H = 3072;
const PAD = 18;

// Shop words (hillside / old town / urban). Real Chinese signage vocabulary.
export const SHOP_WORDS = [
  '火锅', '面馆', '小面', '药房', '茶馆', '夜市', '酒吧', '网吧', '按摩', '当铺', '电器', '宾馆', '书店', '烧烤', '串串',
  '麻辣烫', '奶茶', '足浴', '理发', '超市', '便利店', '金店', '酒店', '旅馆', '典当', '牙科', '诊所', '手机维修', '饺子',
  '拉面', '烤鸭', '茶楼', '歌厅', '影院', '游戏厅', '棋牌', '洗衣', '照相', '眼镜', '五金', '钟表', '中药', '推拿', '美甲',
  '小龙虾', '豆花', '抄手', '重庆小面', '老火锅', '夜宵', '大排档', '海鲜', '烧腊', '甜品', '咖啡', '网咖', '电玩城', '麻将',
  '发廊', '药店', '火锅城', '好吃街', '江湖菜', '酸辣粉', '冰粉', '卤菜', '旅社', '招待所', '粮油', '烟酒', '水果', '花店',
  '彩票', '数码', '通讯', '鞋城', '服装', '针灸', '凉面', '米线', '豆浆', '包子', '馄饨', '火锅底料', '串串香', '烤鱼', '鸡公煲',
];
export const BUND_WORDS = ['银行', '饭店', '外滩', '和平饭店', '海关', '大楼', '珠宝', '钟表行', '洋行', '咖啡馆', '百货', '剧院'];
export const STEPPE_CN = ['蒙古包', '奶茶馆', '烤全羊', '手把肉', '马奶酒', '草原', '敖包', '那达慕', '蒙餐', '羊肉馆', '皮具', '银器'];
// Traditional Mongolian script (vertical): Mongol, food, tea, shop, book, airag, ger, horse, hotel, good, steppe, market
export const MONGOL_WORDS = ['ᠮᠣᠩᠭᠣᠯ', 'ᠬᠣᠭᠣᠯᠠ', 'ᠴᠠᠢ', 'ᠳᠡᠯᠭᠡᠭᠦᠷ', 'ᠨᠣᠮ', 'ᠠᠢᠷᠠᠭ', 'ᠭᠡᠷ', 'ᠮᠣᠷᠢ', 'ᠪᠠᠭᠤᠳᠠᠯ', 'ᠰᠠᠶᠢᠨ', 'ᠲᠠᠯᠠ', 'ᠵᠠᠬᠠ'];
// Bilingual steppe signs: Mongolian column + Chinese column (as in Inner Mongolia)
export const MONGOL_PAIRS = [['ᠮᠣᠩᠭᠣᠯ', '蒙古'], ['ᠬᠣᠭᠣᠯᠠ', '饭馆'], ['ᠴᠠᠢ', '奶茶'], ['ᠳᠡᠯᠭᠡᠭᠦᠷ', '商店'], ['ᠨᠣᠮ', '书店'], ['ᠠᠢᠷᠠᠭ', '马奶酒'], ['ᠭᠡᠷ', '蒙古包'], ['ᠮᠣᠷᠢ', '马具'], ['ᠪᠠᠭᠤᠳᠠᠯ', '宾馆'], ['ᠰᠠᠶᠢᠨ', '欢迎'], ['ᠲᠠᠯᠠ', '草原'], ['ᠵᠠᠬᠠ', '市场']];
export const LATIN_WORDS = ['NOODLE', 'HOTEL', 'BAR', 'KTV', '24H', 'OPEN', 'CAFE', 'PAWN', 'MASSAGE', 'TEA', 'CYBER', 'RAMEN', 'KARAOKE', 'DRAGON', 'LOTUS', 'NEON', 'CLUB', 'LIVE'];
export const BIG_WORDS = ['霓虹', '山城', '重庆', '不夜城', '龙', '福', '發', '囍', '江湖', '火锅', '好吃', '夜市', '欢迎光临', '营业中', '24小时'];
export const STATION_WORDS = ['李子坝', '李子坝站', '佛图关', '大坪', '牛角沱', '较场口', '南坪', '上新街', '五里店', '江北城', '大剧院', '红土地', '2号线', '6号线', '2', '长江索道', '山城人家'];

const CJK_FONTS = ['bold {S}px "Microsoft YaHei", "SimHei", sans-serif', 'bold {S}px "SimHei", "Microsoft YaHei", sans-serif', '{S}px "KaiTi", "STKaiti", "Microsoft YaHei", serif', 'bold {S}px "FangSong", "Microsoft YaHei", serif'];
const LATIN_FONT = 'bold {S}px "Segoe UI", "Arial", sans-serif';
const MONGOL_FONT = '{S}px "Mongolian Baiti", "Noto Sans Mongolian", sans-serif';

export function buildSignAtlas(device) {
  const cv = new OffscreenCanvas(W, H);
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff'; g.strokeStyle = '#fff';
  g.textBaseline = 'middle'; g.textAlign = 'center';
  const entries = new Map(); // key -> entry
  const specs = [];           // measured first, then packed tallest-first (shelf packing)
  const cjkLen = (t) => [...t].length;

  const addH = (text, font, S, stroke) => {
    g.font = font.replace('{S}', S);
    const tw = g.measureText(text).width;
    specs.push({ key: 'H:' + text, w: tw + PAD * 2 + 6, h: S * 1.25 + PAD * 2, e: { text, vertical: false, n: cjkLen(text) }, draw: (r) => {
      g.font = font.replace('{S}', S);
      g.lineWidth = Math.max(2, S * 0.07); g.lineJoin = 'round';
      if (stroke) g.strokeText(text, r.x + r.w / 2, r.y + r.h / 2 + S * 0.04);
      else g.fillText(text, r.x + r.w / 2, r.y + r.h / 2 + S * 0.04);
    } });
  };
  const addV = (text, font, S) => {
    const chars = [...text];
    const step = S * 1.08;
    specs.push({ key: 'V:' + text, w: S * 1.15 + PAD * 2, h: chars.length * step + PAD * 2, e: { text, vertical: true, n: chars.length }, draw: (r) => {
      g.font = font.replace('{S}', S);
      chars.forEach((c, i) => g.fillText(c, r.x + r.w / 2, r.y + PAD + step * (i + 0.5) + S * 0.04));
    } });
  };
  // Mongolian: drawn horizontally then rotated 90 degrees clockwise (top-to-bottom script)
  const addM = (text, S) => {
    g.font = MONGOL_FONT.replace('{S}', S);
    const tw = g.measureText(text).width;
    specs.push({ key: 'V:' + text, w: S * 1.05 + PAD * 2, h: tw + PAD * 2 + 8, e: { text, vertical: true, n: 1, mongol: true }, draw: (r) => {
      g.font = MONGOL_FONT.replace('{S}', S);
      g.save(); g.translate(r.x + r.w / 2, r.y + r.h / 2); g.rotate(Math.PI / 2); g.fillText(text, 0, 0); g.restore();
    } });
  };
  // bilingual vertical sign: Mongolian (rotated) column left, Chinese column right
  const addPair = (mn, cn, S) => {
    g.font = MONGOL_FONT.replace('{S}', S * 2.0);
    const tw = g.measureText(mn).width;
    const chars = [...cn];
    const step = S * 1.08;
    const hh = Math.max(tw + 10, chars.length * step) + PAD * 2;
    specs.push({ key: 'V:' + mn + cn, w: S * 1.9 + S * 1.15 + PAD * 2, h: hh, e: { text: mn + cn, vertical: true, n: 0, mongol: true }, draw: (r) => {
      g.font = MONGOL_FONT.replace('{S}', S * 2.0);
      g.save(); g.translate(r.x + PAD + S * 0.95, r.y + hh / 2); g.rotate(Math.PI / 2); g.fillText(mn, 0, 0); g.restore();
      g.font = CJK_FONTS[0].replace('{S}', S);
      const y0 = r.y + PAD + ((hh - PAD * 2) - chars.length * step) / 2;
      chars.forEach((c, i) => g.fillText(c, r.x + PAD + S * 1.9 + S * 0.575, y0 + step * (i + 0.5) + S * 0.04));
    } });
  };

  // horizontal bilingual sign: a short vertical Mongolian column (scaled to the sign height) left of Chinese text
  const addPairH = (mn, cn, S) => {
    const hh = S * 1.7 + PAD * 2;
    g.font = CJK_FONTS[0].replace('{S}', S);
    const cw = g.measureText(cn).width;
    specs.push({ key: 'H:' + mn + cn, w: S * 1.1 + cw + PAD * 2 + 20, h: hh, e: { text: mn + cn, vertical: false, n: 0, mongol: true }, draw: (r) => {
      g.font = MONGOL_FONT.replace('{S}', S * 1.5);
      const tw = g.measureText(mn).width;
      const k = Math.min(1, (hh - PAD * 2) / tw);
      g.save(); g.translate(r.x + PAD + S * 0.55, r.y + hh / 2); g.rotate(Math.PI / 2); g.scale(k, k); g.fillText(mn, 0, 0); g.restore();
      g.font = CJK_FONTS[0].replace('{S}', S);
      g.fillText(cn, r.x + PAD + S * 1.1 + 20 + cw / 2, r.y + hh / 2 + S * 0.04);
    } });
  };

  const S = 72;
  MONGOL_PAIRS.forEach(([m, c]) => addPairH(m, c, 64));
  BIG_WORDS.forEach((t, i) => { addH(t, CJK_FONTS[i % 2], 104); addV(t, CJK_FONTS[i % 2], 104); });
  STATION_WORDS.forEach((t) => { addH(t, CJK_FONTS[0], 80); if ([...t].length > 1) addV(t, CJK_FONTS[0], 80); });
  LATIN_WORDS.forEach((t, i) => addH(t, LATIN_FONT, 70, i % 2 === 0));
  BUND_WORDS.forEach((t) => { addH(t, CJK_FONTS[2], S); addV(t, CJK_FONTS[2], S); });
  STEPPE_CN.forEach((t, i) => { addV(t, CJK_FONTS[i % 2], S); addH(t, CJK_FONTS[i % 2], S); });
  MONGOL_WORDS.forEach((t) => addM(t, 130));
  MONGOL_PAIRS.forEach(([m, c]) => addPair(m, c, 66));
  SHOP_WORDS.forEach((t, i) => { const f = CJK_FONTS[i % CJK_FONTS.length]; addV(t, f, S); addH(t, f, S); });
  // pack tallest first into shelves
  specs.forEach((p, i) => { p.i = i; p.w = Math.ceil(p.w); p.h = Math.ceil(p.h); });
  specs.sort((a, b) => b.h - a.h || a.i - b.i);
  let x = 0, y = 0, rowH = 0, dropped = 0;
  for (const p of specs) {
    if (x + p.w > W) { x = 0; y += rowH; rowH = 0; }
    if (y + p.h > H) { dropped++; continue; }
    const r = { x, y, w: p.w, h: p.h };
    x += p.w; rowH = Math.max(rowH, p.h);
    p.draw(r);
    entries.set(p.key, { ...p.e, rect: r });
  }
  if (dropped) console.warn('sign atlas full: dropped', dropped, 'entries');
  // glow channel
  const cg = new OffscreenCanvas(W, H);
  const gg = cg.getContext('2d');
  gg.filter = 'blur(7px)';
  gg.drawImage(cv, 0, 0);
  gg.filter = 'none';
  // brighten the glow a little so it reaches ~1 inside strokes
  gg.globalCompositeOperation = 'lighter';
  gg.filter = 'blur(3px)';
  gg.drawImage(cv, 0, 0);

  const levels = Math.floor(Math.log2(Math.max(W, H))) + 1;
  const tex = device.createTexture({ label: 'sign-atlas', size: [W, H], format: 'rg8unorm', mipLevelCount: levels, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
  let srcA = cv, srcB = cg, w = W, h = H;
  for (let l = 0; l < levels; l++) {
    if (l > 0) {
      const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1);
      const a = new OffscreenCanvas(nw, nh), b = new OffscreenCanvas(nw, nh);
      const ga = a.getContext('2d'), gb = b.getContext('2d');
      ga.imageSmoothingQuality = 'high'; gb.imageSmoothingQuality = 'high';
      ga.drawImage(srcA, 0, 0, nw, nh); gb.drawImage(srcB, 0, 0, nw, nh);
      srcA = a; srcB = b; w = nw; h = nh;
    }
    const da = srcA.getContext('2d').getImageData(0, 0, w, h).data;
    const db = srcB.getContext('2d').getImageData(0, 0, w, h).data;
    const out = new Uint8Array(w * h * 2);
    for (let i = 0, n = w * h; i < n; i++) { out[i * 2] = da[i * 4]; out[i * 2 + 1] = db[i * 4]; }
    device.queue.writeTexture({ texture: tex, mipLevel: l }, out, { bytesPerRow: w * 2 }, [w, h]);
  }
  for (const e of entries.values()) {
    const r = e.rect;
    e.uv = [r.x / W, r.y / H, r.w / W, r.h / H];
    e.aspect = r.w / r.h; // width / height
  }
  return { texture: tex, view: tex.createView(), entries, find: (text, vertical) => entries.get((vertical ? 'V:' : 'H:') + text) || entries.get((vertical ? 'H:' : 'V:') + text) };
}
