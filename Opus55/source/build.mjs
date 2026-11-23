// Builds the single-file deliverable.
//   node build.mjs        -> ../index.html (minified, no dev tools)
//   node build.mjs --dev  -> out/dev.html  (readable, with capture/benchmark tools)
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dev = process.argv.includes('--dev');

// Strip comments and indentation from WGSL template literals (marked with /* wgsl */).
const wgslMinify = {
  name: 'wgsl-minify',
  setup(build) {
    build.onLoad({ filter: /\.js$/ }, async (args) => {
      let src = await fs.promises.readFile(args.path, 'utf8');
      if (!dev) {
        src = src.replace(/\/\* wgsl \*\/ `([\s\S]*?)`/g, (m, body) => {
          const out = body.split('\n')
            .map((l) => {
              // keep ${...} interpolations intact; remove // comments outside them
              const i = l.indexOf('//');
              if (i >= 0 && !l.slice(0, i).includes('${') ) l = l.slice(0, i);
              return l.trim().replace(/\s{2,}/g, ' ');
            })
            .filter((l) => l.length > 0)
            .join('\n');
          return '`' + out + '`';
        });
      }
      return { contents: src, loader: 'js' };
    });
  },
};

const result = await esbuild.build({
  entryPoints: [path.join(here, 'src/main.js')],
  bundle: true,
  format: 'esm',
  minify: !dev,
  write: false,
  target: 'es2022',
  define: { __DEV__: dev ? 'true' : 'false' },
  plugins: [wgslMinify],
  legalComments: 'none',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const template = fs.readFileSync(path.join(here, 'template.html'), 'utf8');
const html = template.replace('/*BUNDLE*/', () => js);
const outFile = dev ? path.join(here, 'out/dev.html') : path.join(here, '../index.html');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html);
console.log(`${path.relative(process.cwd(), outFile)}  ${(html.length / 1024).toFixed(1)} KB`);
