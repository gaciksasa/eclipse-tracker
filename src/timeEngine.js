// Manages the simulated clock: play/pause, variable speed (forward & reverse),
// and jumping to an arbitrary instant. `timeScale` is simulated seconds per
// real second (e.g. 3600 => one hour of sky motion per real second).
export class TimeEngine {
  constructor(startDate = new Date()) {
    this.simTime = startDate.getTime(); // ms
    this.timeScale = 60; // default: 1 minute per second
    this.playing = true;
    this._lastReal = performance.now();
  }

  // Advance the simulated clock. Call once per animation frame.
  tick() {
    const now = performance.now();
    const dtReal = (now - this._lastReal) / 1000; // seconds
    this._lastReal = now;
    if (this.playing) {
      this.simTime += dtReal * this.timeScale * 1000;
    }
    return this.date;
  }

  get date() {
    return new Date(this.simTime);
  }

  setDate(date) {
    this.simTime = date.getTime();
  }

  setNow() {
    this.simTime = Date.now();
  }

  setScale(scale) {
    this.timeScale = scale;
  }

  togglePlay() {
    this.playing = !this.playing;
    this._lastReal = performance.now();
    return this.playing;
  }

  // Nudge the clock by a fixed number of simulated seconds (used while paused).
  step(seconds) {
    this.simTime += seconds * 1000;
  }
}

// Human-readable label for a time scale (sim seconds per real second).
export function describeScale(scale) {
  const a = Math.abs(scale);
  const sign = scale < 0 ? '−' : '';
  if (a === 0) return 'stop';
  if (a < 1) return `${sign}${a.toFixed(2)}× real`;
  if (a < 60) return `${sign}${format(a)} s / s`;
  if (a < 3600) return `${sign}${format(a / 60)} min / s`;
  if (a < 86400) return `${sign}${format(a / 3600)} h / s`;
  if (a < 86400 * 30) return `${sign}${format(a / 86400)} days / s`;
  if (a < 86400 * 365) return `${sign}${format(a / (86400 * 30))} mo / s`;
  return `${sign}${format(a / (86400 * 365))} yr / s`;
}

function format(v) {
  return v >= 10 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '');
}
