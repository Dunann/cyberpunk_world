// Builds a blind pairwise-judging folder from two evaluation runs.
//   node make-pairs.mjs --a <baseline run folder> --b <candidate run folder> --out <judge folder> --key <key file outside the judge folder>
// For every image ID present in both runs, copies the two images as <ID>-X.jpg and <ID>-Y.jpg with a random
// assignment, and writes the mapping to the key file (which the judge must never see).
//   node make-pairs.mjs --score <judge JSON file> --key <key file> [--targets A1,A2]
// Converts a judge's verdict JSON into candidate wins/losses using the key, and applies the adoption rule.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const idOf = (f) => f.replace(/\.jpg$/, '').replace(/^(burst-u\d+-\d+|[A-Z]\d+).*$/, '$1');

if (opt('score')) {
  const key = JSON.parse(fs.readFileSync(opt('key'), 'utf8'));
  const raw = fs.readFileSync(opt('score'), 'utf8');
  const json = JSON.parse((raw.match(/```json\s*([\s\S]*?)```/) || [null, raw])[1]);
  const targets = (opt('targets', '') || '').split(',').filter(Boolean);
  const rows = []; let tW = 0, tN = 0, clearLossElsewhere = 0;
  for (const [id, v] of Object.entries(json)) {
    const cand = key[id]; if (!cand) continue;
    const res = v.verdict === 'tie' ? 'tie' : v.verdict === cand ? 'win' : 'loss';
    rows.push(`${id}\t${res}\t${v.margin}`);
    if (targets.includes(id)) { tN++; if (res === 'win') tW++; }
    else if (res === 'loss' && v.margin === 'clear') clearLossElsewhere++;
  }
  console.log(rows.join('\n'));
  const adopt = tN > 0 && tW / tN >= 2 / 3 && clearLossElsewhere === 0;
  console.log(`targets won ${tW}/${tN}, clear losses elsewhere ${clearLossElsewhere} -> ${adopt ? 'ADOPT' : 'do not adopt'}`);
  process.exit(0);
}

const a = opt('a'), b = opt('b'), out = opt('out'), keyFile = opt('key');
fs.mkdirSync(out, { recursive: true });
const ims = (d) => Object.fromEntries(fs.readdirSync(d).filter((f) => f.endsWith('.jpg')).map((f) => [idOf(f), f]));
const A = ims(a), B = ims(b), key = {};
for (const id of Object.keys(A)) {
  if (!B[id]) continue;
  const candIsX = Math.random() < 0.5;
  fs.copyFileSync(path.join(candIsX ? b : a, candIsX ? B[id] : A[id]), path.join(out, `${id}-X.jpg`));
  fs.copyFileSync(path.join(candIsX ? a : b, candIsX ? A[id] : B[id]), path.join(out, `${id}-Y.jpg`));
  key[id] = candIsX ? 'X' : 'Y';
}
fs.writeFileSync(keyFile, JSON.stringify(key, null, 2));
console.log(`${Object.keys(key).length} pairs written to ${out}`);
