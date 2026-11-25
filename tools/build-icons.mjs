// Playwright is a dev-only dependency; resolve it from wherever it is installed.
async function loadPlaywright() {
  const tries = ['playwright', '/tmp/node_modules/playwright/index.js'];
  for (const t of tries) {
    try { return (await import(t)).default ?? await import(t); } catch {}
  }
  throw new Error('Playwright not found. Run: npm i -D playwright');
}
const pw = await loadPlaywright();
const { chromium } = pw;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const svg = fs.readFileSync(path.join(ROOT,'assets','icon.svg'),'utf8');
const browser = await chromium.launch();

// sizes: favicon 32/48, apple-touch 180, PWA 192/512, maskable 512 (with safe padding)
const jobs = [
  { out:'assets/icon-32.png',   size:32,  pad:0 },
  { out:'assets/icon-48.png',   size:48,  pad:0 },
  { out:'assets/icon-180.png',  size:180, pad:0 },
  { out:'assets/icon-192.png',  size:192, pad:0 },
  { out:'assets/icon-512.png',  size:512, pad:0 },
  // maskable: Android crops to a circle/squircle; keep art inside the 80% safe zone
  { out:'assets/icon-maskable-512.png', size:512, pad:0.14 },
];

for (const j of jobs) {
  const page = await (await browser.newContext({ viewport:{width:j.size,height:j.size}, deviceScaleFactor:1 })).newPage();
  const inner = j.pad ? Math.round(j.size * (1 - j.pad*2)) : j.size;
  const body = j.pad
    ? `<div style="width:${j.size}px;height:${j.size}px;background:#080d16;display:flex;align-items:center;justify-content:center">
         <div style="width:${inner}px;height:${inner}px">${svg.replace('width="512" height="512"', `width="${inner}" height="${inner}"`)}</div>
       </div>`
    : `<div style="width:${j.size}px;height:${j.size}px">${svg.replace('width="512" height="512"', `width="${j.size}" height="${j.size}"`)}</div>`;
  await page.setContent(`<html><body style="margin:0;background:transparent">${body}</body></html>`);
  await page.waitForTimeout(150);
  await page.screenshot({ path:path.join(ROOT,j.out), omitBackground:!j.pad });
  await page.close();
}
await browser.close();
console.log('icons written');
