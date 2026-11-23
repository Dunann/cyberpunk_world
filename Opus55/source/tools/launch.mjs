// Shared helpers: static server for out/dev.html and a headed Chrome with WebGPU on the discrete GPU.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, '..');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));

export function serve(dir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const f = path.join(dir, u === '/' ? 'dev.html' : u);
      if (!f.startsWith(dir) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ file = 'out/dev.html', query = '', width = 1280, height = 760, profileName = 'opus55-chrome-profile' } = {}) {
  const dir = path.join(root, path.dirname(file));
  const { server, port } = await serve(dir);
  const profile = path.join(os.tmpdir(), profileName);
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    defaultViewport: null,
    userDataDir: profile,
    protocolTimeout: 600000,
    args: [
      `--window-size=${width},${height}`,
      '--force_high_performance_gpu',
      '--enable-webgpu-developer-features',
      '--enable-unsafe-webgpu',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--enable-precise-memory-info',
      '--no-first-run', '--no-default-browser-check',
    ],
  });
  const page = (await browser.pages())[0] || (await browser.newPage());
  const logs = [];
  page.on('console', (m) => {
    const t = m.text();
    logs.push(`[${m.type()}] ${t}`);
    if (m.type() === 'error' || m.type() === 'warn' || m.type() === 'warning') console.log(`  page ${m.type()}: ${t.slice(0, 600)}`);
  });
  page.on('pageerror', (e) => { logs.push(`[pageerror] ${e.message}`); console.log('  pageerror:', e.message); });
  const url = `http://127.0.0.1:${port}/${path.basename(file)}?${query}`;
  const t0 = Date.now();
  await page.goto(url);
  for (;;) {
    const state = await page.evaluate(() => ({ ready: !!window.__ready, dev: !!window.__capture, text: document.getElementById('loadText')?.textContent || '' }));
    if (state.ready && state.dev) break;
    if (state.text.startsWith('Error') || state.text.includes('not available')) { await browser.close(); server.close(); throw new Error('Load failed: ' + state.text); }
    if (Date.now() - t0 > 240000) { await browser.close(); server.close(); throw new Error('Timed out waiting for the scene to load: ' + state.text); }
    await sleep(250);
  }
  const info = await page.evaluate(() => window.__info());
  console.log(`  adapter: ${info.adapter} (vendor ${info.vendor}), format ${info.format}, lights ${info.lights}, lots ${info.lots}, timestamps ${info.timestamp}, load ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return { browser, page, server, info, logs, close: async () => { await browser.close(); server.close(); } };
}
