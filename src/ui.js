// Builds the HTML control/readout overlay and wires it to the TimeEngine.
import { describeScale } from './timeEngine.js';

const PRESETS = [
  { label: 'Real-time', scale: 1 },
  { label: 'Min/s', scale: 60 },
  { label: 'Hour/s', scale: 3600 },
  { label: 'Day/s', scale: 86400 },
  { label: 'Week/s', scale: 604800 },
];

const fmt2 = (n) => String(n).padStart(2, '0');
const rad2deg = (r) => (r * 180) / Math.PI;

export function createUI(timeEngine, { onFocus, onEclipseSelect } = {}) {
  const root = document.getElementById('ui');

  root.innerHTML = `
    <div class="col-left">
    <div class="panel clock-panel">
      <div class="title">Eclipse Tracker</div>
      <div id="datetime" class="datetime">--</div>
      <div id="datetime-local" class="datetime-local">--</div>

      <div class="controls">
        <button id="btn-back" class="ctl" title="Step back">⏮</button>
        <button id="btn-play" class="ctl play">⏸</button>
        <button id="btn-fwd" class="ctl" title="Step forward">⏭</button>
        <button id="btn-now" class="ctl now">Now</button>
      </div>

      <div class="speed">
        <div class="speed-row">
          <input id="speed" type="range" min="0" max="6.5" step="0.05" value="1.778" />
          <span id="speed-label" class="speed-label">min / s</span>
        </div>
        <div id="presets" class="presets"></div>
      </div>
    </div>

    <div class="panel focus-panel">
      <div class="fp-title">Focus</div>
      <div class="seg" id="focus-seg">
        <button data-focus="earth" class="seg-btn" style="border-radius: 10px 0 0 10px;"  >Earth</button>
        <button data-focus="moon" class="seg-btn">Moon</button>
        <button data-focus="sun" class="seg-btn">Sun</button>
        <button data-focus="iss" class="seg-btn" style="border-radius: 0 10px 10px 0;">ISS</button>
      </div>
    </div>

    <div class="panel data-panel">
      <div class="section">☀️ Sun</div>
      <div class="kv"><span>Right ascension</span><b id="sun-ra">--</b></div>
      <div class="kv"><span>Declination</span><b id="sun-dec">--</b></div>
      <div class="kv"><span>Distance</span><b id="sun-dist">--</b></div>

      <div class="section">🌙 Moon</div>
      <div class="kv"><span>Phase</span><b id="moon-phase">--</b></div>
      <div class="kv"><span>Illumination</span><b id="moon-illum">--</b></div>
      <div class="kv"><span>Right ascension</span><b id="moon-ra">--</b></div>
      <div class="kv"><span>Declination</span><b id="moon-dec">--</b></div>
      <div class="kv"><span>Distance</span><b id="moon-dist">--</b></div>
      <div class="kv"><span>Elongation</span><b id="moon-elong">--</b></div>

      <div class="section">🌍 Earth</div>
      <div class="kv"><span>Sub-solar lat/lon</span><b id="subsolar">--</b></div>
      <div class="kv"><span>Sidereal time</span><b id="gast">--</b></div>
    </div>
    </div>

    <div class="col-right">
    <div class="panel eclipse-panel">
      <div class="ep-head">
        <span>Eclipses</span>
        <span id="ep-count" class="ep-count">--</span>
      </div>
      <div class="ep-filters">
        <div class="ep-group" id="ep-body">
          <button class="fchip active" data-body="all">All</button>
          <button class="fchip" data-body="solar">☀️ Solar</button>
          <button class="fchip" data-body="lunar">🌙 Lunar</button>
        </div>
        <div class="ep-group" id="ep-type">
          <button class="fchip active" data-type="all">All types</button>
          <button class="fchip" data-type="total">Total</button>
          <button class="fchip" data-type="annular">Annular</button>
          <button class="fchip" data-type="partial">Partial</button>
          <button class="fchip" data-type="penumbral">Penumbral</button>
        </div>
        <div class="ep-region-row">
          <label for="ep-region">Visible in</label>
          <select id="ep-region"><option value="all">All regions</option></select>
        </div>
      </div>
      <div id="eclipse-list" class="eclipse-list"></div>
    </div>

    <div id="sun-view" class="panel sun-view" hidden>
      <div class="sv-title">View from greatest eclipse</div>
      <canvas id="sun-view-canvas" width="220" height="220"></canvas>
      <div id="sun-view-caption" class="sv-caption">--</div>
    </div>
    </div>

    <div id="mobile-backdrop" class="mobile-backdrop"></div>
    <button id="mobile-close" class="mobile-close" aria-label="Close">✕</button>
    <div id="mobile-bar" class="mobile-bar">
      <button class="mbtn" data-panel="clock-panel">Time</button>
      <button class="mbtn" data-panel="focus-panel">Focus</button>
      <button class="mbtn" data-panel="data-panel">Data</button>
      <button class="mbtn" data-panel="eclipse-panel">Eclipses</button>
    </div>
  `;

  const $ = (id) => root.querySelector(id);

  // --- Mobile: collapse each card into an icon that opens it as a dialog ---
  const mobileBackdrop = $('#mobile-backdrop');
  const mobileClose = $('#mobile-close');
  let openMobilePanelEl = null;

  function openMobilePanel(cls) {
    const p = root.querySelector(`.${cls}`);
    if (!p) return;
    if (openMobilePanelEl && openMobilePanelEl !== p) {
      openMobilePanelEl.classList.remove('mobile-open');
    }
    p.classList.add('mobile-open');
    openMobilePanelEl = p;
    mobileBackdrop.classList.add('show');
    mobileClose.classList.add('show');
  }
  function closeMobilePanel() {
    if (openMobilePanelEl) openMobilePanelEl.classList.remove('mobile-open');
    openMobilePanelEl = null;
    mobileBackdrop.classList.remove('show');
    mobileClose.classList.remove('show');
  }
  root.querySelectorAll('#mobile-bar .mbtn').forEach((btn) => {
    btn.addEventListener('click', () => openMobilePanel(btn.dataset.panel));
  });
  mobileBackdrop.addEventListener('click', closeMobilePanel);
  mobileClose.addEventListener('click', closeMobilePanel);

  // --- Time controls ---------------------------------------------------
  const playBtn = $('#btn-play');
  const speed = $('#speed');
  const speedLabel = $('#speed-label');
  // The exact magnitude chosen via a preset chip (null once the slider is
  // dragged manually). Tracked explicitly because the range input snaps its
  // value to the nearest step, which would otherwise break preset matching.
  let activeScale = 60; // matches the slider's default value (~Min/s)

  const applyScale = () => {
    const scale = Math.pow(10, parseFloat(speed.value));
    timeEngine.setScale(scale);
    speedLabel.textContent = describeScale(scale);
    highlightPreset();
  };

  speed.addEventListener('input', () => {
    activeScale = null; // manual drag deselects any preset
    applyScale();
  });

  playBtn.addEventListener('click', () => {
    const playing = timeEngine.togglePlay();
    playBtn.textContent = playing ? '⏸' : '▶';
    playBtn.classList.toggle('paused', !playing);
  });

  $('#btn-now').addEventListener('click', () => timeEngine.setNow());
  $('#btn-back').addEventListener('click', () => timeEngine.step(-3600));
  $('#btn-fwd').addEventListener('click', () => timeEngine.step(3600));

  // Preset speed chips.
  const presetsEl = $('#presets');
  const presetButtons = PRESETS.map((p) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = p.label;
    b.addEventListener('click', () => {
      activeScale = p.scale;
      speed.value = Math.log10(p.scale).toFixed(3);
      applyScale();
    });
    presetsEl.appendChild(b);
    return { el: b, scale: p.scale };
  });

  function highlightPreset() {
    presetButtons.forEach(({ el, scale: s }) => {
      el.classList.toggle('active', activeScale === s);
    });
  }

  // Focus selector (mirrors clicking a body in the 3D view).
  const focusSeg = $('#focus-seg');
  const focusButtons = Array.from(focusSeg.querySelectorAll('.seg-btn'));
  focusButtons.forEach((b) => {
    b.addEventListener('click', () => { onFocus?.(b.dataset.focus); closeMobilePanel(); });
  });
  function setFocusButtons(target) {
    focusButtons.forEach((b) => b.classList.toggle('active', b.dataset.focus === target));
  }

  // --- Eclipse browser (separate card with body/type filters) ----------
  const eclipseListEl = $('#eclipse-list');
  const countEl = $('#ep-count');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let allEclipses = [];
  let bodyFilter = 'all'; // 'all' | 'solar' | 'lunar'
  let typeFilter = 'all'; // 'all' | 'total' | 'annular' | 'partial' | 'penumbral'
  let regionFilter = 'all'; // 'all' | a visibility region name

  function renderEclipses() {
    const list = allEclipses.filter((e) =>
      (bodyFilter === 'all' || e.kind === bodyFilter) &&
      (typeFilter === 'all' || e.type === typeFilter) &&
      (regionFilter === 'all' || (e.where.regions || []).includes(regionFilter)));

    countEl.textContent = `${list.length}`;
    eclipseListEl.innerHTML = '';

    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ep-empty';
      empty.textContent = 'No eclipses match these filters.';
      eclipseListEl.appendChild(empty);
      return;
    }

    list.forEach((ecl) => {
      const d = ecl.peak;
      const dateStr = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
      const timeStr = `${fmt2(d.getUTCHours())}:${fmt2(d.getUTCMinutes())} UTC`;
      const typeCap = ecl.type.charAt(0).toUpperCase() + ecl.type.slice(1);

      const w = ecl.where;
      const loc = latLonStr(w.lat, w.lon);
      const regions = w.regions && w.regions.length ? w.regions.join(', ') : loc;
      let coordText;
      if (w.scope === 'central') {
        coordText = `${ecl.type === 'annular' ? 'Annularity' : 'Totality'} at ${loc}`;
      } else if (w.scope === 'partial') {
        coordText = `Greatest (partial) at ${loc}`;
      } else {
        coordText = `Moon overhead ${loc} · whole night side`;
      }

      const row = document.createElement('button');
      row.className = `eclipse-item ${ecl.kind}`;
      row.innerHTML = `
        <span class="ec-ico">${ecl.kind === 'solar' ? '☀️' : '🌙'}</span>
        <span class="ec-main">
          <span class="ec-date">${dateStr} · ${timeStr}</span>
          <span class="ec-sub">${typeCap} ${ecl.kind}</span>
          <span class="ec-loc">📍 Visible in ${regions}</span>
          <span class="ec-coord">${coordText}</span>
        </span>
        <span class="ec-badge ec-${ecl.type}">${typeCap}</span>`;
      row.addEventListener('click', () => { onEclipseSelect?.(ecl); closeMobilePanel(); });
      eclipseListEl.appendChild(row);
    });
  }

  const bindFilterGroup = (sel, attr, set) => {
    const buttons = Array.from(root.querySelectorAll(`${sel} .fchip`));
    buttons.forEach((btn) => btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.toggle('active', b === btn));
      set(btn.dataset[attr]);
      renderEclipses();
    }));
  };
  bindFilterGroup('#ep-body', 'body', (v) => { bodyFilter = v; });
  bindFilterGroup('#ep-type', 'type', (v) => { typeFilter = v; });

  const regionSelect = $('#ep-region');
  regionSelect.addEventListener('change', () => {
    regionFilter = regionSelect.value;
    renderEclipses();
  });

  // Rebuild the region dropdown from every region referenced by the eclipses,
  // preserving the current selection where possible.
  function populateRegions() {
    const set = new Set();
    allEclipses.forEach((e) => (e.where.regions || []).forEach((r) => set.add(r)));
    const regions = Array.from(set).sort((a, b) => a.localeCompare(b));
    const current = regionSelect.value || 'all';
    regionSelect.innerHTML = '<option value="all">All regions</option>'
      + regions.map((r) => `<option value="${r}">${r}</option>`).join('');
    regionSelect.value = regions.includes(current) ? current : 'all';
    regionFilter = regionSelect.value;
  }

  function setEclipses(list) {
    allEclipses = list;
    populateRegions();
    renderEclipses();
  }

  applyScale();

  // --- Readout elements ------------------------------------------------
  const el = {
    datetime: $('#datetime'),
    datetimeLocal: $('#datetime-local'),
    sunRa: $('#sun-ra'),
    sunDec: $('#sun-dec'),
    sunDist: $('#sun-dist'),
    moonPhase: $('#moon-phase'),
    moonIllum: $('#moon-illum'),
    moonRa: $('#moon-ra'),
    moonDec: $('#moon-dec'),
    moonDist: $('#moon-dist'),
    moonElong: $('#moon-elong'),
    subsolar: $('#subsolar'),
    gast: $('#gast'),
  };

  function raStr(hours) {
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    const s = Math.round(((hours - h) * 60 - m) * 60);
    return `${fmt2(h)}h ${fmt2(m)}m ${fmt2(s)}s`;
  }
  function decStr(deg) {
    const sign = deg < 0 ? '−' : '+';
    const a = Math.abs(deg);
    const d = Math.floor(a);
    const m = Math.round((a - d) * 60);
    return `${sign}${d}° ${fmt2(m)}′`;
  }
  function latLonStr(lat, lon) {
    const ns = lat >= 0 ? 'N' : 'S';
    const ew = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(1)}°${ns}, ${Math.abs(lon).toFixed(1)}°${ew}`;
  }

  function update(eph) {
    const d = eph.date;
    el.datetime.textContent =
      `${d.getUTCFullYear()}-${fmt2(d.getUTCMonth() + 1)}-${fmt2(d.getUTCDate())} ` +
      `${fmt2(d.getUTCHours())}:${fmt2(d.getUTCMinutes())}:${fmt2(d.getUTCSeconds())} UTC`;
    el.datetimeLocal.textContent = 'Local: ' + d.toLocaleString('en-GB');

    el.sunRa.textContent = raStr(eph.sun.ra);
    el.sunDec.textContent = decStr(eph.sun.dec);
    el.sunDist.textContent = `${eph.sun.distAU.toFixed(4)} AU (${(eph.sun.distKm / 1e6).toFixed(2)} million km)`;

    el.moonPhase.textContent = eph.moon.phaseName;
    el.moonIllum.textContent = `${(eph.moon.illumination * 100).toFixed(1)} %`;
    el.moonRa.textContent = raStr(eph.moon.ra);
    el.moonDec.textContent = decStr(eph.moon.dec);
    el.moonDist.textContent = `${Math.round(eph.moon.distKm).toLocaleString('en-US')} km`;
    el.moonElong.textContent = `${eph.moon.elongation.toFixed(1)}°`;

    el.subsolar.textContent = latLonStr(eph.subSolar.lat, eph.subSolar.lon);
    el.gast.textContent = `${(rad2deg(eph.gast) / 15).toFixed(3)} h`;
  }

  // Keep play button state in sync if toggled elsewhere (keyboard).
  // Programmatically select a speed preset (used when focusing a body).
  function setSpeed(scale) {
    activeScale = scale;
    speed.value = Math.log10(scale).toFixed(3);
    applyScale();
  }

  function syncPlay(playing) {
    playBtn.textContent = playing ? '⏸' : '▶';
    playBtn.classList.toggle('paused', !playing);
  }

  // --- Live "view from greatest eclipse" thumbnail ----------------------
  const sunViewEl = $('#sun-view');
  const sunCanvas = $('#sun-view-canvas');
  const sunCtx = sunCanvas.getContext('2d');
  const sunCaption = $('#sun-view-caption');

  function hideSunView() {
    if (!sunViewEl.hidden) sunViewEl.hidden = true;
    if (openMobilePanelEl === sunViewEl) closeMobilePanel();
  }

  // `v` is the output of solarEclipseView(): angular radii + Moon offset (deg).
  function drawSunView(v, label) {
    sunViewEl.hidden = false;
    const W = sunCanvas.width;
    const H = sunCanvas.height;
    const cx = W / 2;
    const cy = H / 2;
    // Scale so the Sun disc comfortably fills the frame.
    const px = (W * 0.34) / v.sunR;

    sunCtx.clearRect(0, 0, W, H);

    // Faint sky + corona glow around the Sun.
    const glow = sunCtx.createRadialGradient(cx, cy, v.sunR * px * 0.6, cx, cy, v.sunR * px * 2.2);
    glow.addColorStop(0, 'rgba(255, 210, 120, 0.55)');
    glow.addColorStop(1, 'rgba(255, 210, 120, 0)');
    sunCtx.fillStyle = glow;
    sunCtx.fillRect(0, 0, W, H);

    // Sun disc.
    sunCtx.beginPath();
    sunCtx.arc(cx, cy, v.sunR * px, 0, Math.PI * 2);
    sunCtx.fillStyle = '#ffdf7a';
    sunCtx.shadowColor = 'rgba(255, 200, 90, 0.9)';
    sunCtx.shadowBlur = 24;
    sunCtx.fill();
    sunCtx.shadowBlur = 0;

    // Moon disc: dark, offset by (dx east, dy north). Screen y is inverted,
    // and east (increasing RA) points left on the sky, so flip dx too.
    const mx = cx - v.dx * px;
    const my = cy - v.dy * px;
    sunCtx.beginPath();
    sunCtx.arc(mx, my, v.moonR * px, 0, Math.PI * 2);
    sunCtx.fillStyle = '#0a0d16';
    sunCtx.fill();

    sunCaption.textContent = label;
  }

  return {
    update, syncPlay, setFocus: setFocusButtons, setSpeed, setEclipses,
    drawSunView, hideSunView,
  };
}
