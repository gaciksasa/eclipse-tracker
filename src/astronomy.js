// Accurate ephemeris helpers built on astronomy-engine.
//
// Coordinate conventions used across the app:
//   * We work in the equatorial-of-date frame (EQD). Its Z axis is the
//     Earth's instantaneous rotation axis, X points at the vernal equinox.
//   * RA/Dec cartesian:  x = cos(dec)cos(ra), y = cos(dec)sin(ra), z = sin(dec)
//   * We then map EQD -> three.js world (Y-up) with worldFromEqd():
//       world = ( x_eqd, z_eqd, -y_eqd )
//     so the north celestial pole (Earth's axis) is world +Y, and RA=0 is +X.
//   * Earth's daily spin is world Y rotation equal to Greenwich Apparent
//     Sidereal Time (GAST), which makes sub-solar longitude come out correct.
import * as Astronomy from 'astronomy-engine';
import { Vector3 } from 'three';

// Length units: 1 scene unit = 1 Earth radius.
export const AU_IN_EARTH_RADII = 23481.0665; // 1 AU / mean Earth radius
export const EARTH_RADIUS_KM = 6371.0;
const DEG = Math.PI / 180;
const HOURS_TO_RAD = Math.PI / 12; // 2π / 24

// Convert an EQD cartesian vector (astronomy-engine {x,y,z} in AU) to a
// three.js world-space Vector3, scaled to Earth radii.
export function worldFromEqd(v) {
  return new Vector3(v.x, v.z, -v.y).multiplyScalar(AU_IN_EARTH_RADII);
}

// Direction only (unit vector) in world space from an EQD vector.
export function worldDirFromEqd(v) {
  return new Vector3(v.x, v.z, -v.y).normalize();
}

// Geocentric EQD position vector for a body at a given Date.
function geoEqd(body, date) {
  const time = Astronomy.MakeTime(date);
  const eqj = Astronomy.GeoVector(body, time, true); // corrected for aberration
  const rot = Astronomy.Rotation_EQJ_EQD(time);
  return Astronomy.RotateVector(rot, eqj); // {x,y,z} in AU, EQD frame
}

// Greenwich Apparent Sidereal Time in radians (Earth's Y-rotation angle).
export function gastRadians(date) {
  return Astronomy.SiderealTime(Astronomy.MakeTime(date)) * HOURS_TO_RAD;
}

// Full snapshot of the sky for one instant. All the animation and the UI
// readouts are driven from this single object.
export function computeEphemeris(date) {
  const time = Astronomy.MakeTime(date);

  const sunEqd = geoEqd(Astronomy.Body.Sun, date);
  const moonEqd = geoEqd(Astronomy.Body.Moon, date);

  const sunDist = Math.hypot(sunEqd.x, sunEqd.y, sunEqd.z); // AU
  const moonDist = Math.hypot(moonEqd.x, moonEqd.y, moonEqd.z); // AU

  // Equatorial-of-date RA/Dec for readouts.
  const sunEq = Astronomy.Equator(
    Astronomy.Body.Sun, time, new Astronomy.Observer(0, 0, 0), true, true,
  );
  const moonEq = Astronomy.Equator(
    Astronomy.Body.Moon, time, new Astronomy.Observer(0, 0, 0), true, true,
  );

  const illum = Astronomy.Illumination(Astronomy.Body.Moon, time);
  const moonPhaseAngle = Astronomy.AngleFromSun(Astronomy.Body.Moon, time); // 0..180 (elongation)

  const gast = gastRadians(date);

  // Sub-solar geographic point: where the Sun is at the zenith.
  const subSolarLat = sunEq.dec;
  let subSolarLon = sunEq.ra * 15 - (gast / Math.PI * 180); // deg
  subSolarLon = ((subSolarLon + 540) % 360) - 180;

  return {
    date,
    gast,
    sun: {
      dir: worldDirFromEqd(sunEqd),
      world: worldFromEqd(sunEqd),
      distAU: sunDist,
      distKm: sunDist * 149597870.7,
      ra: sunEq.ra, // hours
      dec: sunEq.dec, // degrees
    },
    moon: {
      dir: worldDirFromEqd(moonEqd),
      world: worldFromEqd(moonEqd),
      distAU: moonDist,
      distEarthRadii: moonDist * AU_IN_EARTH_RADII,
      distKm: moonDist * 149597870.7,
      ra: moonEq.ra,
      dec: moonEq.dec,
      phaseAngle: illum.phase_angle, // deg, 0=full, 180=new
      illumination: illum.phase_fraction, // 0..1 lit fraction
      elongation: moonPhaseAngle, // deg from Sun
      phaseName: moonPhaseName(moonPhaseAngle, illum.phase_fraction, date),
    },
    subSolar: { lat: subSolarLat, lon: subSolarLon },
  };
}

// ---- Eclipse search ---------------------------------------------------
// Builds a chronological list of upcoming solar and lunar eclipses starting at
// `fromDate`. Each entry carries the peak instant plus the phase geometry we
// need to jump to and observe the shadow crossing.
export function findEclipses(fromDate, count = 16) {
  const start = Astronomy.MakeTime(fromDate);

  const solar = [];
  let s = Astronomy.SearchGlobalSolarEclipse(start);
  for (let i = 0; i < count; i++) {
    // Where it is visible: for total/annular the library gives the greatest-
    // eclipse point directly; for a partial (axis misses Earth) we compute the
    // sub-shadow ground point ourselves so every entry has a real location.
    const where = Number.isFinite(s.latitude) && Number.isFinite(s.longitude)
      ? { lat: s.latitude, lon: s.longitude, scope: 'central' }
      : { ...solarShadowGeoPoint(s.peak), scope: 'partial' };
    // Partial phases of a solar eclipse fan out ~55° around the central point.
    where.regions = visibleRegions(where.lat, where.lon, 55, 6);
    solar.push({
      kind: 'solar',
      type: s.kind, // 'partial' | 'annular' | 'total'
      peak: s.peak.date,
      obscuration: s.obscuration,
      where,
      // A solar eclipse sweeps the globe over a few hours; give a fixed lead.
      leadMin: 100,
    });
    s = Astronomy.NextGlobalSolarEclipse(s.peak);
  }

  const lunar = [];
  let l = Astronomy.SearchLunarEclipse(start);
  for (let i = 0; i < count; i++) {
    // A lunar eclipse is visible from the whole night hemisphere; the best
    // vantage is where the Moon is at the zenith (the sub-lunar point).
    const sub = subPointAt(Astronomy.Body.Moon, l.peak);
    lunar.push({
      kind: 'lunar',
      type: l.kind, // 'penumbral' | 'partial' | 'total'
      peak: l.peak.date,
      obscuration: l.obscuration,
      // A lunar eclipse is seen from the whole night side: everything within
      // ~85° of the sub-lunar point (i.e. wherever the Moon is above the horizon).
      where: {
        lat: sub.lat,
        lon: sub.lon,
        scope: 'nightside',
        regions: visibleRegions(sub.lat, sub.lon, 85, 6),
      },
      // Begin just as the Moon enters the Earth's penumbra.
      leadMin: (l.sd_penum || 60) + 10,
    });
    l = Astronomy.NextLunarEclipse(l.peak);
  }

  return [...solar, ...lunar]
    .sort((a, b) => a.peak - b.peak)
    .slice(0, count);
}

// How the Sun looks from a given surface point at `date`: the apparent angular
// radii of the Sun and Moon (degrees) and the Moon's centre offset relative to
// the Sun's centre on the sky (dx = east, dy = north, degrees). Feeding these
// straight into two circles reproduces the real eclipse appearance (partial /
// annular / total) for that observer at that instant.
export function solarEclipseView(lat, lon, date) {
  const t = Astronomy.MakeTime(date);
  const obs = new Astronomy.Observer(lat, lon, 0);
  const sun = Astronomy.Equator(Astronomy.Body.Sun, t, obs, true, true);
  const moon = Astronomy.Equator(Astronomy.Body.Moon, t, obs, true, true);
  const KM_PER_AU = 149597870.7;
  const SUN_KM = 695700;
  const MOON_KM = 1737.4;
  const sunR = Math.asin(SUN_KM / (sun.dist * KM_PER_AU)) / DEG;
  const moonR = Math.asin(MOON_KM / (moon.dist * KM_PER_AU)) / DEG;
  let dra = (moon.ra - sun.ra) * 15; // hours -> degrees
  dra = ((dra + 540) % 360) - 180;
  const dx = dra * Math.cos(sun.dec * DEG);
  const dy = moon.dec - sun.dec;
  return { sunR, moonR, dx, dy, sep: Math.hypot(dx, dy) };
}

// Coarse continent/ocean centroids used to turn an eclipse-centre coordinate
// into friendly place names ("Europe, North Africa, …"). Deliberately broad —
// the exact footprint is given by the coordinates; this is a readability aid.
const REGIONS = [
  { n: 'North America', lat: 45, lon: -100 },
  { n: 'Central America', lat: 15, lon: -88 },
  { n: 'South America', lat: -15, lon: -60 },
  { n: 'Greenland', lat: 72, lon: -42 },
  { n: 'the Arctic', lat: 82, lon: 0 },
  { n: 'Europe', lat: 50, lon: 15 },
  { n: 'North Africa', lat: 25, lon: 12 },
  { n: 'Central Africa', lat: 2, lon: 20 },
  { n: 'Southern Africa', lat: -26, lon: 25 },
  { n: 'the Middle East', lat: 29, lon: 44 },
  { n: 'northern Asia', lat: 65, lon: 100 },
  { n: 'Central Asia', lat: 45, lon: 68 },
  { n: 'South Asia', lat: 22, lon: 80 },
  { n: 'East Asia', lat: 36, lon: 112 },
  { n: 'Southeast Asia', lat: 5, lon: 110 },
  { n: 'Australia', lat: -25, lon: 134 },
  { n: 'the Pacific', lat: -5, lon: -170 },
  { n: 'the Atlantic', lat: 15, lon: -40 },
  { n: 'the Indian Ocean', lat: -25, lon: 80 },
  { n: 'Antarctica', lat: -78, lon: 0 },
];

// Great-circle distance (degrees) between two geographic points.
function greatCircleDeg(la1, lo1, la2, lo2) {
  const r = Math.PI / 180;
  const dLat = (la2 - la1) * r;
  const dLon = (lo2 - lo1) * r;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h))) / r;
}

// Region names whose centroid lies within `radiusDeg` of (lat, lon), nearest
// first, capped to `max` entries.
function visibleRegions(lat, lon, radiusDeg, max) {
  return REGIONS
    .map((r) => ({ n: r.n, d: greatCircleDeg(lat, lon, r.lat, r.lon) }))
    .filter((r) => r.d <= radiusDeg)
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map((r) => r.n);
}

// Geographic point (deg) at which a body stands in the zenith at `time`:
// latitude = declination, longitude = right ascension - sidereal time.
function subPointAt(body, time) {
  const eq = Astronomy.Equator(body, time, new Astronomy.Observer(0, 0, 0), true, true);
  const lat = eq.dec;
  let lon = (eq.ra - Astronomy.SiderealTime(time)) * 15; // hours -> degrees
  lon = ((lon % 360) + 540) % 360 - 180;
  return { lat, lon };
}

// Ground point directly under the Sun–Moon shadow axis at `time` (greatest
// eclipse). Intersects the axis with the Earth sphere when it strikes, else
// takes the axis' closest approach (grazing partial). Works in the EQD frame
// so declination/RA of the point map straight to geographic lat/lon.
function solarShadowGeoPoint(time) {
  const sun = geoEqd(Astronomy.Body.Sun, time.date);
  const moon = geoEqd(Astronomy.Body.Moon, time.date);
  const Re = 1 / AU_IN_EARTH_RADII; // Earth radius in AU
  const a = { x: moon.x - sun.x, y: moon.y - sun.y, z: moon.z - sun.z };
  const al = Math.hypot(a.x, a.y, a.z);
  a.x /= al; a.y /= al; a.z /= al;
  const b = moon.x * a.x + moon.y * a.y + moon.z * a.z;
  const c = moon.x * moon.x + moon.y * moon.y + moon.z * moon.z - Re * Re;
  const disc = b * b - c;
  const t = disc >= 0 ? -b - Math.sqrt(disc) : -b;
  const p = { x: moon.x + a.x * t, y: moon.y + a.y * t, z: moon.z + a.z * t };
  const pl = Math.hypot(p.x, p.y, p.z);
  const lat = Math.asin(p.z / pl) * 180 / Math.PI;
  let lon = (Math.atan2(p.y, p.x) * 12 / Math.PI - Astronomy.SiderealTime(time)) * 15;
  lon = ((lon % 360) + 540) % 360 - 180;
  return { lat, lon };
}

// Rough phase name derived from elongation and whether it is waxing/waning.
function moonPhaseName(elongation, illumination, date) {
  const later = Astronomy.AngleFromSun(
    Astronomy.Body.Moon, Astronomy.MakeTime(new Date(date.getTime() + 3600 * 1000)),
  );
  const waxing = later > elongation;
  if (illumination < 0.03) return 'New Moon';
  if (illumination > 0.97) return 'Full Moon';
  if (Math.abs(illumination - 0.5) < 0.06) {
    return waxing ? 'First Quarter' : 'Last Quarter';
  }
  if (illumination < 0.5) return waxing ? 'Waxing Crescent' : 'Waning Crescent';
  return waxing ? 'Waxing Gibbous' : 'Waning Gibbous';
}
