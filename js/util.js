export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const smoothstep = (a, b, v) => {
  const t = clamp(invLerp(a, b, v), 0, 1);
  return t * t * (3 - 2 * t);
};
export const mod = (n, m) => ((n % m) + m) % m;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pad2 = (n) => String(Math.floor(n)).padStart(2, '0');

/** Seconds since the start of the run -> 09:02:00 style clock. */
export function clockText(seconds, baseHour = 9, baseMinute = 2) {
  const total = Math.max(0, Math.floor(seconds)) + baseMinute * 60 + baseHour * 3600;
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor(total / 60) % 60;
  const s = total % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

export function deltaText(seconds) {
  const sec = Math.round(seconds);
  if (sec === 0) return '0:00';
  const sign = sec > 0 ? '+' : '−';
  const abs = Math.abs(sec);
  return `${sign}${Math.floor(abs / 60)}:${pad2(abs % 60)}`;
}

export function durationText(seconds) {
  const sec = Math.max(0, Math.round(seconds));
  return `${Math.floor(sec / 60)}:${pad2(sec % 60)}`;
}

export const kmhToMs = (v) => v / 3.6;
export const msToKmh = (v) => v * 3.6;

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/** Interpolate two hex colours. */
export function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
  const bl = Math.round(lerp(pa & 255, pb & 255, t));
  return `rgb(${r},${g},${bl})`;
}

export function rgba(hex, alpha) {
  const p = parseInt(hex.slice(1), 16);
  return `rgba(${(p >> 16) & 255},${(p >> 8) & 255},${p & 255},${alpha})`;
}
