// Downloads realistic planetary textures into public/textures.
// Sources are free-to-use (Solar System Scope, CC-BY 4.0) with three.js
// example textures as fallbacks. Run with: npm run textures
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'public', 'textures');

// Each entry: local filename -> ordered list of candidate URLs.
const SSS = 'https://www.solarsystemscope.com/textures/download';
const THREE = 'https://raw.githubusercontent.com/mrdoob/three.js/r169/examples/textures';

// Earth maps use the 8K Solar System Scope sets for crisp detail when zoomed
// in, falling back to 2K / three.js textures if a high-res source is missing.
const ASSETS = {
  'earth_day.jpg': [`${SSS}/8k_earth_daymap.jpg`, `${SSS}/2k_earth_daymap.jpg`, `${THREE}/planets/earth_atmos_2048.jpg`],
  'earth_night.jpg': [`${SSS}/8k_earth_nightmap.jpg`, `${SSS}/2k_earth_nightmap.jpg`],
  'earth_clouds.jpg': [`${SSS}/8k_earth_clouds.jpg`, `${SSS}/2k_earth_clouds.jpg`],
  'earth_specular.jpg': [`${SSS}/8k_earth_specular_map.jpg`, `${SSS}/2k_earth_specular_map.jpg`, `${THREE}/planets/earth_specular_2048.jpg`],
  'earth_normal.jpg': [`${SSS}/8k_earth_normal_map.jpg`, `${SSS}/2k_earth_normal_map.jpg`, `${THREE}/planets/earth_normal_2048.jpg`],
  'moon.jpg': [`${SSS}/8k_moon.jpg`, `${SSS}/2k_moon.jpg`, `${THREE}/planets/moon_1024.jpg`],
  'stars.jpg': [`${SSS}/8k_stars_milky_way.jpg`, `${SSS}/2k_stars_milky_way.jpg`],
  'sun.jpg': [`${SSS}/2k_sun.jpg`],
};

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 2000) throw new Error(`suspiciously small (${buf.length} bytes)`);
  return buf;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  let ok = 0;
  let fail = 0;
  for (const [name, urls] of Object.entries(ASSETS)) {
    const dest = path.join(OUT, name);
    if (existsSync(dest) && (await stat(dest)).size > 2000) {
      console.log(`✓ ${name} (cached)`);
      ok++;
      continue;
    }
    let done = false;
    for (const url of urls) {
      try {
        const buf = await download(url);
        await writeFile(dest, buf);
        console.log(`✓ ${name}  <-  ${url}  (${(buf.length / 1024).toFixed(0)} KB)`);
        ok++;
        done = true;
        break;
      } catch (err) {
        console.warn(`  … failed ${url}: ${err.message}`);
      }
    }
    if (!done) {
      console.error(`✗ ${name}: all sources failed`);
      fail++;
    }
  }
  console.log(`\nDone. ${ok} ok, ${fail} failed.`);
  if (fail > 0) process.exitCode = 1;
}

main();
