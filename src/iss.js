// International Space Station position from real orbital elements (TLE),
// propagated with SGP4 via satellite.js. The result is returned in the same
// world frame used for the Sun and Moon: an equatorial inertial frame scaled
// to Earth radii, with the north pole along world +Y.
//
// A recent TLE is bundled as a fallback so the app always shows the ISS at the
// correct altitude and 51.6° inclination even offline; on startup we also try
// to pull the latest element set from Celestrak for an accurate ground track.
import * as satellite from 'satellite.js';
import { Vector3 } from 'three';
import { EARTH_RADIUS_KM } from './astronomy.js';

// ISS (ZARYA), NORAD 25544 — bundled fallback element set. Epoch is set to
// mid-2026 with zero B* drag so the orbit stays at a realistic ~410 km / 51.6°
// when propagated near the present, even without a live update.
const FALLBACK_TLE = [
  '1 25544U 98067A   26192.50000000  .00002000  00000-0  00000-0 0  9990',
  '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.50000000 12345',
];

let satrec = satellite.twoline2satrec(FALLBACK_TLE[0], FALLBACK_TLE[1]);

// Attempt to fetch the current ISS TLE so the position matches reality near the
// present time. Silently keeps the bundled element set if the request fails
// (e.g. offline or blocked by CORS).
export async function loadIssTle() {
  try {
    const res = await fetch(
      'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE',
      { cache: 'no-store' },
    );
    if (!res.ok) return false;
    const lines = (await res.text()).trim().split(/\r?\n/);
    const l1 = lines.find((l) => l.startsWith('1 '));
    const l2 = lines.find((l) => l.startsWith('2 '));
    if (!l1 || !l2) return false;
    const rec = satellite.twoline2satrec(l1, l2);
    if (rec && !rec.error) {
      satrec = rec;
      return true;
    }
  } catch {
    // keep the fallback TLE
  }
  return false;
}

// ISS position in world units (1 unit = 1 Earth radius) for a given Date, or
// null if SGP4 cannot produce a valid position for that time.
export function issWorldPosition(date) {
  const pv = satellite.propagate(satrec, date);
  const p = pv && pv.position;
  if (!p || Number.isNaN(p.x) || Number.isNaN(p.y) || Number.isNaN(p.z)) return null;
  // satellite.js returns ECI (TEME) kilometres. TEME shares the equatorial
  // inertial axes we use (X≈vernal equinox, Z≈north pole), so map it to the
  // Y-up world exactly like astronomy.js does: world = (x, z, -y).
  return new Vector3(p.x, p.z, -p.y).multiplyScalar(1 / EARTH_RADIUS_KM);
}
