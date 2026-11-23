// Prints terrain height, water distance and district at world points.
//   node tools/probe.mjs x,z [x,z ...]
//   node tools/probe.mjs --grid x0,z0,x1,z1,step   (prints a height grid)
import { launch } from './launch.mjs';

const args = process.argv.slice(2);
const { page, close } = await launch({ query: 'w=320&h=180&noadapt&nooverlay&freeze', profileName: 'opus55-probe' });
if (args[0] === '--grid') {
  const [x0, z0, x1, z1, st] = args[1].split(',').map(Number);
  const rows = await page.evaluate((a) => {
    const w = window.__ctx.world; const out = [];
    for (let z = a[1]; z <= a[3]; z += a[4]) {
      const r = [];
      for (let x = a[0]; x <= a[2]; x += a[4]) r.push(Math.round(w.heightAt(x, z)));
      out.push(`z=${z}: ` + r.join(' '));
    }
    return out;
  }, [x0, z0, x1, z1, st]);
  console.log(`x from ${x0} to ${x1} step ${st}`);
  console.log(rows.join('\n'));
} else {
  const pts = args.map((s) => s.split(',').map(Number));
  const res = await page.evaluate((pts) => {
    const w = window.__ctx.world;
    return pts.map(([x, z]) => {
      const d = w.districtAt(x, z);
      return `${x},${z}: h=${w.heightAt(x, z).toFixed(1)} water=${w.waterDist(x, z).toFixed(0)} district=${d.index >= 0 ? w.districts[d.index].name : '-'}(${d.weight.toFixed(2)})`;
    });
  }, pts);
  console.log(res.join('\n'));
}
await close();
