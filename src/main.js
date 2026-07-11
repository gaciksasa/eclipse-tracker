import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { computeEphemeris, findEclipses, solarEclipseView } from './astronomy.js';
import { issWorldPosition, loadIssTle } from './iss.js';
import { createWorld } from './celestial.js';
import { TimeEngine } from './timeEngine.js';
import { createUI } from './ui.js';

// ---- Renderer ---------------------------------------------------------
const canvas = document.getElementById('scene');
// Logarithmic depth buffer keeps precision across the huge range from the
// Earth's surface (~1 unit) out to the true-scale Sun (~23,481 units).
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  logarithmicDepthBuffer: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// Eclipses are computed analytically in the Earth/Moon shaders, so no shadow
// maps are needed.
renderer.shadowMap.enabled = false;
// Built-in materials get sRGB output encoding automatically; the custom
// ShaderMaterials below encode to sRGB manually, so keep tone mapping off
// to keep the whole scene consistent.
renderer.toneMapping = THREE.NoToneMapping;

// ---- Scene & camera ---------------------------------------------------
const scene = new THREE.Scene();
// Near plane is tiny (~13 m) so the true-scale ISS (~100 m) can be viewed up
// close; the logarithmic depth buffer keeps precision across the huge range.
const camera = new THREE.PerspectiveCamera(
  45, window.innerWidth / window.innerHeight, 2e-6, 200000,
);
camera.position.set(3.2, 2.2, 7.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 1.5e-5; // ~95 m, close enough to inspect the ISS
controls.maxDistance = 60000;
controls.target.set(0, 0, 0);

// ---- World, clock, UI -------------------------------------------------
const world = createWorld(scene, renderer);
const time = new TimeEngine(new Date());

// Pull the latest ISS orbital elements (falls back to a bundled TLE offline).
loadIssTle();

const ui = createUI(time, {
  onFocus: (target) => frameBody(target),
  onEclipseSelect: (ecl) => watchEclipse(ecl),
});

// Populate the eclipse browser with the eclipses following the current instant.
ui.setEclipses(findEclipses(time.date));

// Sim speed used while watching an eclipse (sim seconds per real second). A
// solar eclipse's umbra sweeps a whole hemisphere in a few hours, so 30 min/s
// shows the crossing at a good pace; the Moon reddens more slowly for a lunar.
const ECLIPSE_WATCH_SPEED = { solar: 10 * 60, lunar: 10 * 60 };

// Direction (Earth-centre -> surface) of the point the Sun–Moon shadow axis
// strikes at `date`. Looking along it puts the umbra at the centre of the
// Earth's disc. Falls back to the axis' closest approach if it misses Earth
// (a grazing partial eclipse).
function solarShadowViewDir(date) {
  const eph = computeEphemeris(date);
  const m = eph.moon.world;
  const a = m.clone().sub(eph.sun.world).normalize(); // shadow travel axis
  const b = m.dot(a);
  const disc = b * b - (m.lengthSq() - 1); // ray (m, a) vs unit Earth sphere
  const dir = disc >= 0
    ? m.clone().addScaledVector(a, -b - Math.sqrt(disc)) // near-side hit
    : m.clone().addScaledVector(a, -b); // closest approach (misses Earth)
  return dir.lengthSq() > 1e-9 ? dir.normalize() : eph.sun.dir.clone();
}

// Jump to just before an eclipse's peak, frame the body the shadow falls on
// (Earth for a solar eclipse, the Moon for a lunar one) and start playing at a
// speed suited to watching the shadow move.
function watchEclipse(ecl) {
  const start = new Date(ecl.peak.getTime() - ecl.leadMin * 60 * 1000);
  // Set the clock first so framing uses the eclipse-time geometry.
  time.setDate(start);
  // A solar eclipse also drives the live "view from greatest eclipse" thumbnail.
  activeSolarEclipse = ecl.kind === 'solar' ? ecl : null;
  if (ecl.kind === 'solar') {
    // Aim so the umbra's path crosses the centre of the Earth's disc: look
    // straight down at the surface point the shadow axis strikes at the peak.
    frameBody('earth', solarShadowViewDir(ecl.peak), true);
  } else {
    // Watch the Moon from its sunward side so the illuminated (then reddening)
    // hemisphere always faces the user; from there Earth's shadow, centred on
    // the anti-solar axis, also crosses the centre of the Moon's disc.
    const eph = computeEphemeris(start);
    frameBody('moon', eph.sun.dir);
  }
  ui.setSpeed(ECLIPSE_WATCH_SPEED[ecl.kind]);
  if (!time.playing) ui.syncPlay(time.togglePlay());
}

// Phase / coverage caption for the Sun-view thumbnail from the disc geometry.
function sunViewCaption(v) {
  if (v.sep >= v.sunR + v.moonR) return 'Moon approaching / leaving the Sun';
  let phase;
  if (v.sep <= Math.abs(v.sunR - v.moonR)) phase = v.moonR >= v.sunR ? 'Total' : 'Annular';
  else phase = 'Partial';
  const cover = Math.min(1, (v.sunR + v.moonR - v.sep) / (2 * v.sunR));
  return `${phase} · ${Math.round(cover * 100)}% of Sun covered`;
}

world.update(computeEphemeris(time.date), 0);

// ---- Focus / framing --------------------------------------------------
// Selecting Earth/Moon/Sun (via a button, a click, or 1/2/3) flies the camera
// so the body is centered and fills ~50% of the screen height. Free-look
// (OrbitControls) stays enabled the whole time, and the camera keeps tracking
// the selected body as it moves so it stays centered while you orbit/zoom.
const UP = new THREE.Vector3(0, 1, 0);
// ISS half-extent in Earth radii (~55 m) used for tight framing.
const ISS_FRAME_RADIUS = 1e-5;
const FRAME_RADIUS = { earth: 1, moon: 0.2727, sun: 109.2, iss: ISS_FRAME_RADIUS };

// Default time speed applied when a body is focused (seconds of sim per second).
const FOCUS_SPEED = { iss: 60, earth: 3600, moon: 604800, sun: 604800 };

let selected = null; // null | 'earth' | 'moon' | 'sun' | 'iss'
// The solar eclipse currently being watched, if any (drives the Sun thumbnail).
let activeSolarEclipse = null;
const prevBodyPos = new THREE.Vector3();

function bodyPosition(target, eph) {
  if (target === 'moon') return eph.moon.world;
  if (target === 'sun') return eph.sun.world;
  if (target === 'iss') {
    return issWorldPosition(eph.date) || world.iss.position.clone();
  }
  return new THREE.Vector3(0, 0, 0); // Earth is at the origin
}

function frameBody(target, viewDir, keepEclipse = false) {
  // Any manual framing dismisses the eclipse thumbnail; watchEclipse keeps it.
  if (!keepEclipse) {
    activeSolarEclipse = null;
    ui.hideSunView();
  }
  const eph = computeEphemeris(time.date);
  const bodyPos = bodyPosition(target, eph);
  const r = FRAME_RADIUS[target];
  // Distance at which the body's diameter spans ~50% of the vertical FOV.
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const dist = r / Math.sin(vFov * 0.25);
  // `viewDir` (body -> camera) forces a specific vantage, e.g. pointing toward
  // the Sun so the lit hemisphere faces the user; otherwise keep the current
  // viewing direction.
  let dir;
  if (viewDir) {
    dir = viewDir.clone().normalize();
  } else {
    dir = camera.position.clone().sub(bodyPos);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0.3, 1);
    dir.normalize();
  }
  camera.position.copy(bodyPos).addScaledVector(dir, dist);
  controls.target.copy(bodyPos);
  controls.update();
  selected = target;
  prevBodyPos.copy(bodyPos);
  ui.setFocus(target);
  // Pick a sensible default time speed for the focused body.
  if (FOCUS_SPEED[target]) ui.setSpeed(FOCUS_SPEED[target]);
}

function deselect() {
  selected = null;
  activeSolarEclipse = null;
  ui.hideSunView();
  ui.setFocus(null);
}

// Click-to-select with drag detection so orbiting doesn't trigger selection.
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
let pointerDown = null;

renderer.domElement.addEventListener('pointerdown', (e) => {
  pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!pointerDown) return;
  const moved = Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y);
  const dt = performance.now() - pointerDown.t;
  pointerDown = null;
  if (moved > 6 || dt > 500) return; // treat as a drag, not a click

  const rect = renderer.domElement.getBoundingClientRect();
  pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);
  const hits = raycaster.intersectObjects(
    [world.earth, world.moon, world.sun, world.iss], true,
  );
  if (hits.length) {
    let obj = hits[0].object;
    // Resolve an ISS sub-mesh back to the station group.
    while (obj && obj !== world.iss && obj.parent && obj.parent !== scene) obj = obj.parent;
    if (obj === world.iss) frameBody('iss');
    else frameBody(hits[0].object === world.moon ? 'moon' : hits[0].object === world.sun ? 'sun' : 'earth');
  } else {
    deselect();
  }
});

// Keyboard shortcuts.
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') {
    e.preventDefault();
    ui.syncPlay(time.togglePlay());
  } else if (e.code === 'ArrowRight') {
    time.step(3600);
  } else if (e.code === 'ArrowLeft') {
    time.step(-3600);
  } else if (e.code === 'KeyN') {
    time.setNow();
  } else if (e.code === 'Digit1') {
    frameBody('earth');
  } else if (e.code === 'Digit2') {
    frameBody('moon');
  } else if (e.code === 'Digit3') {
    frameBody('sun');
  } else if (e.code === 'Digit4') {
    frameBody('iss');
  } else if (e.code === 'Escape' || e.code === 'Digit0') {
    deselect();
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Animation loop ---------------------------------------------------
let uiAccumulator = 0;
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const date = time.tick();
  const eph = computeEphemeris(date);

  const simSeconds = time.simTime / 1000;
  // Slow relative drift of the cloud layer over the surface (~1 rev / 4.6 days).
  const cloudDrift = simSeconds * (Math.PI * 2 / 400000);
  world.update(eph, cloudDrift);

  // Position the ISS from SGP4 and keep its zenith (+Y) pointing outward.
  const issPos = issWorldPosition(date);
  if (issPos) {
    world.iss.visible = true;
    world.iss.position.copy(issPos);
    world.iss.quaternion.setFromUnitVectors(UP, issPos.clone().normalize());
  } else {
    world.iss.visible = false;
  }

  // Throttle the (relatively expensive) DOM readout updates to ~10 Hz.
  uiAccumulator += clock.getDelta();
  if (uiAccumulator > 0.1) {
    ui.update(eph);
    // Live Sun-as-seen-from-greatest-eclipse thumbnail during a solar eclipse.
    if (activeSolarEclipse) {
      const dtMin = Math.abs(date.getTime() - activeSolarEclipse.peak.getTime()) / 60000;
      if (dtMin > activeSolarEclipse.leadMin + 180) {
        activeSolarEclipse = null;
        ui.hideSunView();
      } else {
        const w = activeSolarEclipse.where;
        const v = solarEclipseView(w.lat, w.lon, date);
        ui.drawSunView(v, sunViewCaption(v));
      }
    }
    uiAccumulator = 0;
  }

  if (selected) {
    // Track the selected body: move the camera and target by the body's
    // displacement so it stays centered while free-look stays available.
    const bodyPos = bodyPosition(selected, eph);
    const delta = bodyPos.clone().sub(prevBodyPos);
    camera.position.add(delta);
    controls.target.add(delta);
    prevBodyPos.copy(bodyPos);
  }
  controls.update();
  renderer.render(scene, camera);
}

// Start focused on Earth by default (same as clicking the Earth button).
frameBody('earth');

animate();
