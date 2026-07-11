// Headless smoke test: load the running dev server, capture console errors,
// WebGL/shader errors, and save a screenshot.
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL || 'http://localhost:5173/';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--headless=new',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
    '--window-size=1440,900',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const errors = [];
const logs = [];
page.on('console', (msg) => {
  const t = msg.type();
  logs.push(`[${t}] ${msg.text()}`);
  if (t === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise((r) => setTimeout(r, 3500)); // let textures load + a few frames

// Pull the on-screen readouts to confirm astronomy + rendering pipeline ran.
const readout = await page.evaluate(() => ({
  datetime: document.querySelector('#datetime')?.textContent,
  sunDec: document.querySelector('#sun-dec')?.textContent,
  moonPhase: document.querySelector('#moon-phase')?.textContent,
  moonDist: document.querySelector('#moon-dist')?.textContent,
  subsolar: document.querySelector('#subsolar')?.textContent,
}));

await page.screenshot({ path: 'scripts/screenshot.png' });

// Speed up time so bodies move, then test focus modes.
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.chip')].find((b) => b.textContent === 'Day/s');
  btn?.click();
});

await page.keyboard.press('Digit3'); // frame Sun (~50% of screen)
await new Promise((r) => setTimeout(r, 1000));
await page.screenshot({ path: 'scripts/screenshot-sun.png' });

await page.keyboard.press('Digit1'); // frame Earth (~50% of screen)
await new Promise((r) => setTimeout(r, 1000));
await page.screenshot({ path: 'scripts/screenshot-earth.png' });

await page.keyboard.press('Digit2'); // frame Moon (~50% of screen)
await new Promise((r) => setTimeout(r, 1000));
await page.screenshot({ path: 'scripts/screenshot-moon.png' });

// Free-look must stay available while tracking: drag to orbit around the Moon.
{
  const box = await (await page.$('#scene')).boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.5, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5 + 220, y, { steps: 20 });
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: 'scripts/screenshot-moon-orbit.png' });
}

console.log('--- console logs ---');
console.log(logs.join('\n') || '(none)');
console.log('--- readouts ---');
console.log(JSON.stringify(readout, null, 2));
console.log('--- errors ---');
console.log(errors.length ? errors.join('\n') : '(none)');

await browser.close();
process.exit(errors.length ? 1 : 0);
