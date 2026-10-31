import { clamp, rgba } from './util.js';
import { fillQuad, polyFill, polyStroke } from './drawlib.js';

export const TRAINS = {
  ic2000: {
    id: 'ic2000',
    name: 'IC 2000',
    formation: 'Re 460 + 7 IC2000',
    short: 'Re 460',
    accent: '#d8232a',
    cab: '#171a1d',
    trim: '#d8232a',
    info: 'Double-decker IC set · 200 km/h',
  },
  twindexx: {
    id: 'twindexx',
    name: 'Twindexx',
    formation: 'RABe 502 · FV-Dosto',
    short: 'RABe 502',
    accent: '#d8232a',
    cab: '#202428',
    trim: '#e5e2da',
    info: 'Double-decker EMU · 200 km/h',
  },
};

/**
 * A parked / passing double-decker train seen from the side. Used at Zürich HB
 * and Bern so the other members of the SBB long-distance family are present.
 */
export function drawTrainSide(r, opts) {
  const { s0, s1, lat, type = 'ic2000', alpha = 1, t = 0 } = opts;
  const c = r.ctx;
  // Clip the rear of the set when the camera has already travelled past it.
  const startS = Math.max(s0, r.camS + 2.2);
  if (s1 <= startS) return;
  const a = r.project(startS, lat, 0);
  const b = r.project(s1, lat, 0);
  if (!a || !b) return;
  if (Math.abs(b.x - a.x) < 2 && Math.abs(a.y - b.y) < 2) return;

  const step = 12;
  const segments = Math.max(1, Math.ceil((s1 - startS) / step));
  const isTwi = type === 'twindexx';
  c.save();
  c.globalAlpha = alpha;

  for (let i = 0; i < segments; i++) {
    const sa = startS + ((s1 - startS) * i) / segments;
    const sb = startS + ((s1 - startS) * (i + 1)) / segments;
    const p0 = r.project(sa, lat, 0);
    const p1 = r.project(sb, lat, 0);
    if (!p0 || !p1) continue;
    if (Math.max(p0.x, p1.x) < -40 || Math.min(p0.x, p1.x) > r.W + 40) continue;

    const y = (h) => r.project(sa, lat, h);
    const yb = (h) => r.project(sb, lat, h);
    const bodyLo = 0.55, bodyHi = 4.25;
    // body
    fillQuad(c, y(bodyLo), yb(bodyLo), yb(bodyHi), y(bodyHi), isTwi ? '#e9e6de' : '#eeeae2');
    // lower red band
    fillQuad(c, y(0.55), yb(0.55), yb(1.05), y(1.05), '#c8232c');
    // window bands (lower + upper decks)
    fillQuad(c, y(1.25), yb(1.25), yb(1.95), y(1.95), 'rgba(38,50,56,0.92)');
    fillQuad(c, y(2.55), yb(2.55), yb(3.25), y(3.25), 'rgba(38,50,56,0.92)');
    // window dividers
    const segK = Math.abs(p1.x - p0.x);
    if (segK > 6) {
      c.strokeStyle = 'rgba(235,232,224,0.35)';
      c.lineWidth = Math.max(0.5, segK * 0.02);
      for (const yy of [1.6, 2.9]) {
        c.beginPath();
        c.moveTo(y(yy).x, y(yy).y);
        c.lineTo(yb(yy).x, yb(yy).y);
        c.stroke();
      }
    }
    // roof
    fillQuad(c, y(4.25), yb(4.25), yb(4.45), y(4.45), '#92958f');
    // doors every ~35 m
    if (((i + (isTwi ? 1 : 2)) % 3) === 0) {
      const dx0 = 0.18, dx1 = 0.82;
      const ds = sb - sa;
      const q0 = r.project(sa + ds * dx0, lat, 0.55);
      const q1 = r.project(sa + ds * dx1, lat, 0.55);
      const q2 = r.project(sa + ds * dx1, lat, 3.7);
      const q3 = r.project(sa + ds * dx0, lat, 3.7);
      if (q0 && q1 && q2 && q3) polyFill(c, [q0, q1, q2, q3], 'rgba(200,35,44,0.9)');
    }
    // bogie / shadow
    const sh0 = r.project(sa, lat, 0.15);
    const sh1 = r.project(sb, lat, 0.15);
    if (sh0 && sh1) {
      c.fillStyle = 'rgba(25,28,30,0.9)';
      c.beginPath();
      c.moveTo(sh0.x, sh0.y);
      c.lineTo(sh1.x, sh1.y);
      c.lineTo(sh1.x, sh1.y + Math.max(1, r.focal / 200));
      c.lineTo(sh0.x, sh0.y + Math.max(1, r.focal / 200));
      c.closePath();
      c.fill();
    }
  }

  // front face at the far end
  if (Math.abs(b.x - a.x) > 4) {
    const f0 = r.project(s1, lat - 1.4, 0.5);
    const f1 = r.project(s1, lat + 1.4, 0.5);
    const f2 = r.project(s1, lat + 1.4, 4.1);
    const f3 = r.project(s1, lat - 1.4, 4.1);
    if (f0 && f1 && f2 && f3) {
      polyFill(c, [f0, f1, f2, f3], isTwi ? '#d8232a' : '#c8232c');
      const w0 = r.project(s1, lat - 1.05, 2.5);
      const w1 = r.project(s1, lat + 1.05, 2.5);
      const w2 = r.project(s1, lat + 1.05, 3.6);
      const w3 = r.project(s1, lat - 1.05, 3.6);
      if (w0 && w1 && w2 && w3) polyFill(c, [w0, w1, w2, w3], '#263136');
    }
  }

  c.restore();
}
