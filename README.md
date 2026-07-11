# Eclipse Tracker — Sun · Earth · Moon

A realistic, real-time 3D simulation of the Sun, Earth, and Moon with **astronomically accurate** positions for any date and time, plus **solar and lunar eclipse prediction and visualization**. Built with [Three.js](https://threejs.org/), using [astronomy-engine](https://github.com/cosinekitty/astronomy) for ephemerides and [satellite.js](https://github.com/shashwatak/satellite-js) for live ISS tracking.

## Features

### Accurate astronomy
- **Real ephemerides** — the Sun and Moon are placed from equatorial-of-date (RA/Dec) coordinates. Moon phase, illumination, elongation, and true distance are computed exactly.
- **Earth rotation** locked to true sidereal time (GAST), so the sub-solar point (latitude/longitude) comes out correct.
- **True-to-scale system** — 1 scene unit = 1 mean Earth radius (6371 km). The Sun is rendered as a real-size sphere at its real distance and acts as the light source. A logarithmic depth buffer keeps precision across the enormous range from Earth's surface to the Sun.

| Body | Radius (units) | Distance |
| --- | --- | --- |
| Earth | 1 | — |
| Moon | 0.2727 | ~60 (perigee ↔ apogee, real) |
| Sun | 109.2 | ~23,481 (real) |

### Realistic Earth
- Day/night textures (city lights on the night side), a separate drifting cloud layer, ocean specular highlights, an atmospheric halo, and a true terminator (day/night boundary).
- A dramatic **orbital sunrise/sunset** glow along the terminator, especially striking when viewed from the ISS with the Sun behind the atmosphere.

### Eclipses
- **Eclipse browser** — a scrollable list of upcoming solar and lunar eclipses (from the current instant), each showing date/time (UTC), type, and where it is visible.
- **Filters** — by body (Solar / Lunar), by type (Total / Annular / Partial / Penumbral), and by **visibility region** (e.g. Europe, North Africa).
- **Watch an eclipse** — click an entry to jump to just before the peak, frame the affected body, and play at ~10 min/s while the shadow sweeps across.
  - For a **solar eclipse** the camera looks straight down the shadow axis so the umbra crosses the centre of Earth's disc.
  - For a **lunar eclipse** the Moon is oriented so its illuminated (then reddening) side faces you.
- **Analytical shadows** — solar and lunar eclipse shadows are computed in the Earth/Moon shaders (umbra/penumbra disk overlap). The Moon's shadow falling on Earth also darkens the cloud tops, so it reads as one continuous patch.
- **Live "view from greatest eclipse"** — during a solar eclipse a small thumbnail shows the Sun as seen from the point of greatest eclipse, animating the Moon's disc across it with a live phase/coverage caption.

### International Space Station
- The ISS is positioned from real orbital elements (TLE) propagated with SGP4, at its true altitude (~410 km) and 51.6° inclination.
- On startup the app fetches the latest element set from Celestrak for an accurate ground track, falling back to a bundled TLE when offline.
- A detailed glTF model (`public/models/iss.glb`) is used, and a **Focus → ISS** button flies the camera to it.

### Controls & data
- **Time engine** — play/pause, a logarithmic speed slider, and speed presets (Real-time, Min/s, Hour/s, Day/s, Week/s). Step ±1 hour, or jump to *Now*.
- **Focus** — click Earth, Moon, Sun, or the ISS (or use the Focus buttons / number keys) and the camera flies so the body is centred and fills ~50% of the screen height. Free-look (orbit + zoom) stays available, and the camera keeps tracking the body as it moves. Focusing a body also selects a sensible default speed (Min/s for the ISS, Hour/s for Earth, Week/s for Moon/Sun).
- **Data panel** — live UTC/local time, Sun and Moon RA/Dec and distances, Moon phase/illumination/elongation, sub-solar latitude/longitude, and sidereal time.
- **Responsive UI** — on mobile each card collapses into a labelled button that opens it as a dialog; the eclipse thumbnail stays visible as a small floating card during a solar eclipse.

## Getting started

```bash
npm install
npm run textures   # download textures into public/textures (run once)
npm run dev        # http://localhost:5173
```

The `npm run textures` step pulls high-resolution (up to 8K) Earth/Moon/Sun/star maps from Solar System Scope, falling back to lower-res sources when needed. Textures are cached, so re-running it only fetches what's missing.

### Production build

```bash
npm run build
npm run preview
```

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `→` / `←` | Step time by ±1 hour |
| `N` | Jump to the current instant |
| `1` / `2` / `3` / `4` | Focus: Earth / Moon / Sun / ISS |
| `Esc` / `0` | Stop tracking (camera stays put) |
| Mouse | Rotate (drag) and zoom (wheel) — always available |

## Deployment

The app is a static Vite site. A [`render.yaml`](./render.yaml) blueprint is included for [Render.com](https://render.com):

1. On Render, choose **New → Blueprint** and connect this repository.
2. Render reads `render.yaml`, runs `npm ci && npm run build`, and publishes `./dist`.

Vite copies everything in `public/` (textures + `iss.glb`) into `dist/`, so all assets ship with the build — no runtime download is required.

## Project structure

```
src/
  main.js         Renderer, scene, camera, focus/framing, animation loop
  celestial.js    Builds the Sun/Earth/Moon/ISS/stars scene objects
  astronomy.js    Ephemeris + eclipse search & visibility (astronomy-engine)
  iss.js          ISS position from TLE via SGP4 (satellite.js)
  timeEngine.js   Simulated clock: play/pause, speed, stepping
  ui.js           HTML control/readout overlay + eclipse browser
  shaders.js      GLSL for Earth surface/atmosphere/clouds and eclipse shadows
scripts/
  download-textures.mjs   Fetches planetary textures into public/textures
public/
  textures/       Earth, Moon, Sun, and star maps
  models/iss.glb  ISS 3D model
```

## Tech stack

- [Three.js](https://threejs.org/) — 3D rendering, custom GLSL shaders, `OrbitControls`, `GLTFLoader`
- [astronomy-engine](https://github.com/cosinekitty/astronomy) — ephemerides and eclipse search
- [satellite.js](https://github.com/shashwatak/satellite-js) — SGP4 propagation of ISS TLE data
- [Vite](https://vitejs.dev/) — dev server and build

## Credits

Textures: [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0) with fallbacks from the Three.js repository.
