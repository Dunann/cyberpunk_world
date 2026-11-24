// Screen masks of the land-use plan (I-016) for eval poses: every built or park texel of the plan, projected
// with the real camera as a vertical stroke from the ground to the height things can reach there (infill
// buildings: their top; parks: 20 m), dilated by --pad pixels. Occlusion is ignored (the mask is generous).
// File names match capture.mjs, so `pixdiff.mjs --mask` can use them.
//   node tools/planmask.mjs --poses-file ../eval/poses-v1.json --ids G1,G4 --out out/masks [--pad 24]
import fs from 'node:fs';
import path from 'node:path';
import { launch, root } from './launch.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const W = 2560, H = 1440;
const out = path.resolve(root, opt('out', 'out/masks'));
fs.mkdirSync(out, { recursive: true });
const set = JSON.parse(fs.readFileSync(path.resolve(root, opt('poses-file', '../eval/poses-v1.json')), 'utf8'));
const only = (opt('ids', '') || '').split(',').filter(Boolean);
const { page, close } = await launch({ file: opt('file', 'out/dev.html'), profileName: opt('profile', 'opus55-I016-mask'), query: `w=${W}&h=${H}&noadapt&nooverlay&freeze&quality=high` });
for (const p of set) {
  if (only.length && !only.includes(p.id)) continue;
  await page.evaluate((q) => {
    const w = window.__ctx.world;
    const y = q.rel ? w.heightAt(q.pos[0], q.pos[2]) + q.pos[1] : q.pos[1];
    const dx = q.target[0] - q.pos[0], dy = q.target[1] - y, dz = q.target[2] - q.pos[2];
    window.__ctx.time = q.t;
    window.__setCam(q.pos[0], y, q.pos[2], Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
  }, p);
  await page.evaluate(() => window.__frames(3));
  const b64 = await page.evaluate(async (a) => {
    const [Wd, Hd, pad] = a;
    const ctx = window.__ctx, w = ctx.world, plan = w.plan, M = ctx.renderer.viewProjNJ;
    const oc = new OffscreenCanvas(Wd, Hd);
    const g = oc.getContext('2d');
    g.fillStyle = 'black'; g.fillRect(0, 0, Wd, Hd);
    g.strokeStyle = 'white'; g.lineWidth = pad * 2; g.lineCap = 'round';
    const proj = (x, y, z) => {
      const cx = M[0] * x + M[4] * y + M[8] * z + M[12], cy = M[1] * x + M[5] * y + M[9] * z + M[13], cw = M[3] * x + M[7] * y + M[11] * z + M[15];
      if (cw < 1) return null;
      return [(cx / cw * 0.5 + 0.5) * Wd, (1 - (cy / cw * 0.5 + 0.5)) * Hd];
    };
    const tops = new Map();
    for (const L of w.infillLots) tops.set(L, L.top || L.maxTop);
    const stroke = (x, z, h0, h1) => {
      const a = proj(x, h0, z), b = proj(x, h1, z);
      if (!a || !b) return;
      if ((a[0] < -pad && b[0] < -pad) || (a[0] > Wd + pad && b[0] > Wd + pad) || (a[1] < -pad && b[1] < -pad) || (a[1] > Hd + pad && b[1] > Hd + pad)) return;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    };
    const B = { x0: -720, z0: -1400, x1: 2040, z1: 1260 };
    for (let z = B.z0; z < B.z1; z += 6) for (let x = B.x0; x < B.x1; x += 6) {
      const c = plan.coverAt(x, z);
      if (c.built <= 0 && c.park <= 0) continue;
      const h = Math.max(w.heightAt(x, z), 0);
      stroke(x, z, h, h + (c.built > 0 ? 20 : 20));
    }
    for (const L of w.infillLots) {
      for (let u = -0.5; u <= 0.5; u += 0.25) for (let v = -0.5; v <= 0.5; v += 0.25) {
        const c = Math.cos(L.angle), s = Math.sin(L.angle);
        const x = L.x + u * L.w * c - v * L.d * s, z = L.z + u * L.w * s + v * L.d * c;
        stroke(x, z, L.gMin, tops.get(L) + 2);
      }
    }
    const blob = await oc.convertToBlob({ type: 'image/png' });
    return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
  }, [W, H, +opt('pad', 24)]);
  const file = path.join(out, `${p.id}-${p.name}.png`);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log('  saved', file);
}
await close();
