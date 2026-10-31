import {
  sampleRoute, STATIONS, SIGNALS, TUNNEL, scenery, fields, rivers,
  regionAt, speedLimitChanges,
} from './route.js';
import { clamp, lerp, smoothstep, mulberry32, mod } from './util.js';
import { polyFill, polyStroke, roundedRect } from './drawlib.js';
import {
  drawSceneryObject, drawStation, drawSignal, drawSpeedBoard,
  drawCatenary, drawTunnelPortal,
} from './scenery.js';
import { TRAINS } from './trains.js';

const TAU = Math.PI * 2;

function makeRidge(seed, width, base, maxHeight) {
  const rng = mulberry32(seed);
  const pts = [{ x: -width * 0.2, y: base }];
  const peaks = [];
  let x = -width * 0.2;
  let up = true;
  while (x < width * 1.2) {
    x += 55 + rng() * 120;
    if (up) {
      const y = base - maxHeight * (0.38 + rng() * 0.62);
      pts.push({ x, y, peak: true });
      peaks.push({ x, y });
    } else {
      pts.push({ x, y: base - maxHeight * (0.03 + rng() * 0.13) });
    }
    up = !up;
  }
  pts.push({ x: width * 1.2, y: base });
  for (let i = 1; i < pts.length - 1; i++) {
    if (pts[i].peak) {
      pts[i].left = pts[i - 1];
      pts[i].right = pts[i + 1];
    }
  }
  return { pts, peaks, base, width };
}

function drawRidge(c, ridge, offset, color, alpha, snow) {
  const { pts, base } = ridge;
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(pts[0].x + offset, base + 500);
  for (const p of pts) c.lineTo(p.x + offset, p.y);
  c.lineTo(pts[pts.length - 1].x + offset, base + 500);
  c.closePath();
  c.fill();

  if (snow) {
    c.fillStyle = 'rgba(247,250,252,0.92)';
    for (const peak of ridge.peaks) {
      if (!peak.left || !peak.right) continue;
      const hgt = base - peak.y;
      if (hgt < snow * 0.45) continue;
      const bottom = peak.y + hgt * (0.28 + ((peak.x * 0.013) % 0.12));
      const leftX = peak.x - (peak.x - peak.left.x) * 0.38;
      const rightX = peak.x + (peak.right.x - peak.x) * 0.38;
      c.beginPath();
      c.moveTo(peak.x + offset, peak.y);
      c.lineTo(rightX + offset, bottom);
      c.lineTo((rightX + peak.x) / 2 + offset, bottom - hgt * 0.1);
      c.lineTo(peak.x + offset, bottom + hgt * 0.02);
      c.lineTo((leftX + peak.x) / 2 + offset, bottom - hgt * 0.08);
      c.lineTo(leftX + offset, bottom);
      c.closePath();
      c.fill();
    }
  }
  c.restore();
}

function makeCloudSprite() {
  const cv = document.createElement('canvas');
  cv.width = 320;
  cv.height = 160;
  const c = cv.getContext('2d');
  const blobs = [
    [90, 100, 62], [150, 84, 72], [210, 102, 55], [260, 112, 38], [55, 115, 34],
  ];
  for (const [x, y, r] of blobs) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.72)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.36)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
  }
  return cv;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.W = 1;
    this.H = 1;
    this.dpr = 1;
    this.cloudSprite = makeCloudSprite();
    this.clouds = [];
    const rnd = mulberry32(0x2f7a);
    for (let i = 0; i < 9; i++) {
      this.clouds.push({
        x: rnd(), y: 0.04 + rnd() * 0.28, s: 0.35 + rnd() * 0.9,
        a: 0.35 + rnd() * 0.45, speed: 0.0015 + rnd() * 0.004,
      });
    }
    this.ridges = null;
    this.resize(window.innerWidth, window.innerHeight, Math.min(2, window.devicePixelRatio || 1));
  }

  resize(width, height, dpr = 1) {
    this.W = Math.max(1, width);
    this.H = Math.max(1, height);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.canvas.style.width = `${this.W}px`;
    this.canvas.style.height = `${this.H}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.portrait = this.H > this.W * 1.1;
    this.fov = this.portrait ? 1.32 : 1.14;
    this.baseFocal = (this.W / 2) / Math.tan(this.fov / 2);
    this.buildRidges();
  }

  buildRidges() {
    const width = Math.max(2600, this.W * 2.4);
    const h = this.H;
    this.ridges = {
      far: makeRidge(0x99a1, width, h * 0.47, h * 0.31),
      mid: makeRidge(0x33b7, width, h * 0.49, h * 0.2),
      near: makeRidge(0x7c11, width, h * 0.54, h * 0.12),
    };
  }

  project(s, lat = 0, h = 0) {
    const p = sampleRoute(s);
    const ch = Math.cos(this.heading);
    const sh = Math.sin(this.heading);
    const px = p.x + Math.cos(p.heading) * lat;
    const pz = p.z - Math.sin(p.heading) * lat;
    const dx = px - this.camX;
    const dz = pz - this.camZ;
    const fwd = dx * sh + dz * ch;
    if (fwd < 0.9) return null;
    const right = dx * ch - dz * sh;
    const k = this.focal / fwd;
    return {
      x: this.W / 2 + right * k,
      y: this.horizon - ((p.elev + h) - (this.camElev + this.eye)) * k,
      k, d: fwd,
    };
  }

  render(state, time, dt) {
    const c = this.ctx;
    const camS = state.headS - 2.6;
    const p = sampleRoute(camS);
    this.camS = camS;
    this.camElev = p.elev;
    this.heading = p.heading;
    this.camLat = -0.55;
    this.camX = p.x + Math.cos(p.heading) * this.camLat;
    this.camZ = p.z - Math.sin(p.heading) * this.camLat;
    this.eye = 3.1;
    this.speedRatio = clamp(state.speed / 55, 0, 1.15);
    this.focal = this.baseFocal * (1 - this.speedRatio * 0.045);
    const bob = Math.sin(time * 7.3) * 0.45 * this.speedRatio + Math.sin(time * 2.1) * 0.35;
    this.horizon = this.H * (this.portrait ? 0.43 : 0.455) + bob;
    this.tunnelAmt = smoothstep(TUNNEL.start - 30, TUNNEL.start + 90, camS)
      * (1 - smoothstep(TUNNEL.end - 90, TUNNEL.end + 30, camS));
    this.time = time;

    this.drawSky(c, state, time, dt);
    this.drawMountains(c, state);
    this.drawGround(c, state);
    this.drawFields(c, state);
    this.drawTrack(c, state, time);
    drawTunnelPortal(this, time);
    this.drawScenery(c, state, time);
    this.drawStations(c, state, time);
    this.drawSignals(c, state, time);
    this.drawBoards(c, state);
    drawCatenary(this, time);
    this.drawTunnel(c, state, time);
    this.drawCab(c, state, time);
    state.tunnelAmt = this.tunnelAmt;
    this.drawEffects(c, state, time);
  }

  drawSky(c, state, time, dt) {
    const { W, H } = this;
    const horizon = this.horizon;
    const g = c.createLinearGradient(0, 0, 0, horizon + 40);
    g.addColorStop(0, '#3d7ba9');
    g.addColorStop(0.42, '#82b3cf');
    g.addColorStop(0.78, '#c9dfe4');
    g.addColorStop(1, '#f0ead7');
    c.fillStyle = g;
    c.fillRect(0, 0, W, horizon + 40);

    const sunX = W * 0.735 - Math.sin(this.heading) * W * 0.11;
    const sunY = H * 0.165;
    const halo = c.createRadialGradient(sunX, sunY, 0, sunX, sunY, W * 0.34);
    halo.addColorStop(0, 'rgba(255,247,217,0.55)');
    halo.addColorStop(0.25, 'rgba(255,241,198,0.2)');
    halo.addColorStop(1, 'rgba(255,240,200,0)');
    c.fillStyle = halo;
    c.fillRect(0, 0, W, horizon + 60);
    const core = c.createRadialGradient(sunX, sunY, 0, sunX, sunY, Math.max(22, W * 0.035));
    core.addColorStop(0, 'rgba(255,253,240,0.98)');
    core.addColorStop(0.4, 'rgba(255,246,206,0.65)');
    core.addColorStop(1, 'rgba(255,246,206,0)');
    c.fillStyle = core;
    c.beginPath();
    c.arc(sunX, sunY, Math.max(26, W * 0.05), 0, TAU);
    c.fill();

    for (const cloud of this.clouds) {
      cloud.x += cloud.speed * dt * 0.01;
      const cx = mod(cloud.x + this.heading * 0.02, 1.2) * W - W * 0.1;
      const cy = cloud.y * H;
      const scale = cloud.s * (W / 1400) * 1.25;
      c.globalAlpha = cloud.a;
      c.drawImage(this.cloudSprite, cx - 160 * scale, cy - 80 * scale, 320 * scale, 160 * scale);
    }
    c.globalAlpha = 1;

    // birds
    c.strokeStyle = 'rgba(38,46,47,0.4)';
    c.lineWidth = 1.1;
    for (let i = 0; i < 5; i++) {
      const bx = mod(0.17 + i * 0.13 + time * 0.004, 1.1) * W;
      const by = H * (0.2 + i * 0.026) + Math.sin(time * 0.7 + i) * 4;
      c.beginPath();
      c.moveTo(bx - 4, by);
      c.quadraticCurveTo(bx - 1, by - 3, bx, by);
      c.quadraticCurveTo(bx + 1, by - 3, bx + 4, by);
      c.stroke();
    }
  }

  drawMountains(c, state) {
    const { W, H } = this;
    const horizon = this.horizon;
    const width = this.ridges.far.width;
    const layers = [
      { r: this.ridges.far, off: -this.heading * 130 - this.camS * 0.0018, color: '#aec7d6', alpha: 0.9, snow: H * 0.28 },
      { r: this.ridges.mid, off: -this.heading * 320 - this.camS * 0.009, color: '#8ba8b0', alpha: 0.86, snow: 0 },
      { r: this.ridges.near, off: -this.heading * 620 - this.camS * 0.032, color: '#5e8169', alpha: 0.9, snow: 0 },
    ];
    for (const layer of layers) {
      const off = mod(layer.off, width);
      drawRidge(c, layer.r, off - width, layer.color, layer.alpha, layer.snow);
      drawRidge(c, layer.r, off, layer.color, layer.alpha, layer.snow);
      drawRidge(c, layer.r, off + width, layer.color, layer.alpha, layer.snow);
    }
    // aerial haze
    const haze = c.createLinearGradient(0, horizon - H * 0.12, 0, horizon + H * 0.13);
    haze.addColorStop(0, 'rgba(230,238,236,0)');
    haze.addColorStop(0.55, 'rgba(230,238,236,0.42)');
    haze.addColorStop(1, 'rgba(234,239,226,0)');
    c.fillStyle = haze;
    c.fillRect(0, horizon - H * 0.14, W, H * 0.3);
  }

  drawGround(c, state) {
    const { W, H } = this;
    const horizon = this.horizon;
    const region = regionAt(this.camS);
    const city = ['zurich', 'bern', 'baden', 'brugg', 'aarau', 'olten'].includes(region);
    const g = c.createLinearGradient(0, horizon, 0, H);
    if (city) {
      g.addColorStop(0, '#bcc1b4');
      g.addColorStop(0.3, '#9ba294');
      g.addColorStop(0.75, '#81887b');
      g.addColorStop(1, '#6a7165');
    } else {
      g.addColorStop(0, '#aec295');
      g.addColorStop(0.3, '#89a766');
      g.addColorStop(0.72, '#70934f');
      g.addColorStop(1, '#5b7d43');
    }
    c.fillStyle = g;
    c.fillRect(0, horizon, W, H - horizon + 2);

    // hazy horizon line
    const hz = c.createLinearGradient(0, horizon - 4, 0, horizon + 100);
    hz.addColorStop(0, 'rgba(238,242,232,0.55)');
    hz.addColorStop(1, 'rgba(238,242,232,0)');
    c.fillStyle = hz;
    c.fillRect(0, horizon - 4, W, 104);
  }

  drawFields(c, state) {
    const visible = fields.filter((f) => f.s1 > this.camS + 2 && f.s0 < this.camS + 2400);
    visible.sort((a, b) => b.s1 - a.s1);
    for (const f of visible) {
      const s0 = Math.max(f.s0, this.camS + 2);
      if (f.s1 <= s0) continue;
      const l0 = f.side * f.l0;
      const l1 = f.side * f.l1;
      const a = this.project(s0, l0, 0);
      const b = this.project(s0, l1, 0);
      const c1 = this.project(f.s1, l1, 0);
      const d = this.project(f.s1, l0, 0);
      if (!a || !b || !c1 || !d) continue;
      if (Math.max(a.x, b.x, c1.x, d.x) < -50 || Math.min(a.x, b.x, c1.x, d.x) > this.W + 50) continue;
      const alpha = clamp(1 - (a.d - 900) / 1900, 0.08, 1);
      c.globalAlpha = alpha;
      c.fillStyle = f.color;
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.lineTo(c1.x, c1.y);
      c.lineTo(d.x, d.y);
      c.closePath();
      c.fill();
      if (a.d < 800) {
        c.globalAlpha = alpha * 0.35;
        c.strokeStyle = '#3f5b33';
        c.lineWidth = Math.max(0.6, a.k * 0.06);
        c.beginPath();
        c.moveTo(b.x, b.y);
        c.lineTo(c1.x, c1.y);
        c.stroke();
      }
    }
    c.globalAlpha = 1;

    for (const river of rivers) {
      if (river.s1 < this.camS + 2) continue;
      const s0 = Math.max(river.s0, this.camS + 2);
      if (river.s1 <= s0) continue;
      const l0 = river.side * river.l0;
      const l1 = river.side * river.l1;
      const a = this.project(s0, l0, 0);
      const b = this.project(s0, l1, 0);
      const c1 = this.project(river.s1, l1, 0);
      const d = this.project(river.s1, l0, 0);
      if (!a || !b || !c1 || !d) continue;
      c.fillStyle = river.lake ? '#79a7b6' : '#6f9dae';
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.lineTo(c1.x, c1.y);
      c.lineTo(d.x, d.y);
      c.closePath();
      c.fill();
      c.strokeStyle = 'rgba(238,250,250,0.35)';
      c.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        const u = i / 6;
        const p1 = this.project(lerp(s0, river.s1, u), lerp(l0, l1, 0.2), 0);
        const p2 = this.project(lerp(s0, river.s1, u), lerp(l0, l1, 0.8), 0);
        if (p1 && p2 && p1.d < 1800) {
          c.beginPath();
          c.moveTo(p1.x, p1.y);
          c.lineTo(p2.x, p2.y);
          c.stroke();
        }
      }
    }
  }

  drawTrack(c, state, time) {
    const near = this.camS + 2.4;
    const far = this.camS + 2600;
    const strip = (lat0, lat1, h, color, step = 12) => {
      const a = [];
      const b = [];
      for (let s = near; s <= far; s += step) {
        const p0 = this.project(s, lat0, h);
        const p1 = this.project(s, lat1, h);
        if (p0 && p1) { a.push(p0); b.push(p1); }
      }
      if (a.length > 1) polyFill(c, [...a, ...b.slice().reverse()], color);
    };

    // Ballast shoulder, walking surface and the slightly darker centre.
    strip(-3.65, 3.65, 0.005, '#625c52', 16);
    strip(-3.1, 3.1, 0.035, '#8b8274', 10);
    strip(-2.35, 2.35, 0.045, '#82796a', 10);

    // Concrete cable troughs on both shoulders.
    for (const side of [-1, 1]) {
      strip(side * 3.16, side * 3.58, 0.10, '#9d9688', 14);
      const a = [];
      for (let s = near; s <= far; s += 20) {
        const p = this.project(s, side * 3.16, 0.10);
        if (p) a.push(p);
      }
      if (a.length > 1) polyStroke(c, a, 'rgba(77,73,65,0.6)', 1);
    }

    // Ballast stones: small, deterministic, only where they can be seen.
    const hash = (n) => {
      const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    };
    for (let s = near; s < this.camS + 260; s += 1.9) {
      for (let k = 0; k < 2; k++) {
        const r = hash(s * 3.1 + k * 17.3);
        const r2 = hash(s * 7.7 + k * 5.9);
        const lat = (r * 2 - 1) * 2.95;
        const p = this.project(s + r2 * 1.6, lat, 0.06);
        if (!p || p.d < 2) continue;
        const size = Math.max(0.6, Math.min(5, p.k * 0.045));
        c.fillStyle = r2 < 0.42 ? 'rgba(56,51,44,0.5)' : r2 < 0.8 ? 'rgba(162,154,138,0.42)' : 'rgba(196,188,169,0.35)';
        c.beginPath();
        c.ellipse(p.x, p.y, size, size * 0.55, r * 2, 0, TAU);
        c.fill();
      }
    }

    // Sleepers. Spacing tightens near the cab and opens up with distance so
    // the near field reads as a railway rather than a striped ramp.
    let s = near;
    while (s < far) {
      const d = s - this.camS;
      const step = d < 55 ? 0.62 : d < 150 ? 1.05 : d < 420 ? 2.0 : 4.8;
      const depth = Math.min(0.28, step * 0.42);
      const a = this.project(s, -1.32, 0.075);
      const b = this.project(s, 1.32, 0.075);
      const c1 = this.project(s + depth, 1.32, 0.075);
      const d1 = this.project(s + depth, -1.32, 0.075);
      if (a && b && c1 && d1) {
        c.fillStyle = ((s * 10) | 0) % 3 === 0 ? 'rgba(88,72,56,0.96)' : 'rgba(104,95,84,0.96)';
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.lineTo(c1.x, c1.y);
        c.lineTo(d1.x, d1.y);
        c.closePath();
        c.fill();
        if (d < 60) {
          c.strokeStyle = 'rgba(204,198,184,0.20)';
          c.lineWidth = Math.max(0.6, a.k * 0.012);
          c.beginPath();
          c.moveTo(a.x, a.y);
          c.lineTo(b.x, b.y);
          c.stroke();
        }
      }
      s += step;
    }

    // Two steel rails, seen from above: dark web, narrow polished head.
    for (const side of [-1, 1]) {
      const pts = [];
      for (let ss = near; ss <= far; ss += ss - this.camS < 70 ? 2.5 : 12) {
        const p = this.project(ss, side * 0.7175, 0.145);
        if (p) pts.push(p);
      }
      if (pts.length < 2) continue;
      const k = pts[0].k;
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(31,32,29,0.55)';
      c.lineWidth = Math.max(2, Math.min(30, k * 0.12));
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y + 1);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y + 1);
      c.stroke();

      c.strokeStyle = '#555a59';
      c.lineWidth = Math.max(1.2, Math.min(18, k * 0.072));
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
      c.stroke();

      c.strokeStyle = 'rgba(224,226,218,0.9)';
      c.lineWidth = Math.max(0.6, Math.min(4.5, k * 0.020));
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y - 0.7);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y - 0.7);
      c.stroke();
      c.lineCap = 'butt';
    }

    // kilometre posts
    for (let km = Math.ceil((this.camS + 40) / 1000) * 1000; km < this.camS + 1300; km += 1000) {
      const p = this.project(km, 4.4, 0);
      const q = this.project(km, 4.4, 1.15);
      if (p && q && p.d < 700) {
        c.strokeStyle = '#d7d0be';
        c.lineWidth = Math.max(1, p.k * 0.09);
        c.beginPath();
        c.moveTo(p.x, p.y);
        c.lineTo(q.x, q.y);
        c.stroke();
      }
    }
  }

  drawScenery(c, state, time) {
    const arr = scenery;
    let lo = 0;
    let hi = arr.length;
    const minS = this.camS + 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].s < minS) lo = mid + 1;
      else hi = mid;
    }
    const list = [];
    for (let i = lo; i < arr.length && arr[i].s < this.camS + 2700; i++) {
      const obj = arr[i];
      const p = this.project(obj.s, obj.lat, 0);
      if (!p || p.d > 2700 || p.d < 2) continue;
      list.push({ obj, p });
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const { obj, p } = list[i];
      const alpha = clamp(1 - (p.d - 1500) / 1800, 0.09, 1);
      drawSceneryObject(this, obj, p, alpha, time);
    }
  }

  drawStations(c, state, time) {
    const otherType = state.train === 'ic2000' ? 'twindexx' : 'ic2000';
    const list = STATIONS.filter((st) => st.platformEnd > this.camS + 2 && st.platformStart < this.camS + 2600);
    list.sort((a, b) => b.stopS - a.stopS);
    for (const st of list) {
      drawStation(this, st, state.time, time, otherType);
    }
  }

  drawSignals(c, state, time) {
    const list = SIGNALS.filter((s) => s.s > this.camS + 2 && s.s < this.camS + 1750);
    list.sort((a, b) => b.s - a.s);
    for (const sig of list) drawSignal(this, sig, time);
  }

  drawBoards(c, state) {
    const list = speedLimitChanges().filter((b) => b.s > this.camS + 6 && b.s < this.camS + 1400);
    list.sort((a, b) => b.s - a.s);
    for (const b of list) drawSpeedBoard(this, b);
  }

  drawTunnel(c, state, time) {
    const amt = this.tunnelAmt;
    if (amt < 0.01) return;
    const { W, H } = this;
    c.save();
    c.fillStyle = `rgba(5,9,10,${0.965 * amt})`;
    c.fillRect(0, 0, W, H);

    // tunnel tube rings
    c.lineWidth = 1.2;
    for (let d = 7; d < 230; d += 9) {
      const s = this.camS + d;
      const pts = [];
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * Math.PI;
        const lat = Math.cos(a) * 5.4;
        const h = 3.0 + Math.sin(a) * 4.2;
        const p = this.project(s, lat, h);
        if (p) pts.push(p);
      }
      if (pts.length < 3) continue;
      c.globalAlpha = amt * (0.5 * (1 - d / 260));
      c.strokeStyle = '#8d8273';
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
      c.stroke();
    }

    // headlight
    c.globalCompositeOperation = 'lighter';
    const hg = c.createRadialGradient(W * 0.5, H * 0.7, 0, W * 0.5, H * 0.72, W * 0.5);
    hg.addColorStop(0, `rgba(255,238,190,${0.22 * amt})`);
    hg.addColorStop(0.4, `rgba(255,230,170,${0.08 * amt})`);
    hg.addColorStop(1, 'rgba(255,230,170,0)');
    c.globalAlpha = 1;
    c.fillStyle = hg;
    c.fillRect(0, 0, W, H);

    // sodium lights
    for (let d = 18; d < 240; d += 26) {
      const p = this.project(this.camS + d, 0, 5.15);
      if (!p) continue;
      const r = Math.max(5, p.k * 1.4);
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.4);
      g.addColorStop(0, `rgba(255,210,130,${0.8 * amt})`);
      g.addColorStop(0.25, `rgba(255,196,100,${0.25 * amt})`);
      g.addColorStop(1, 'rgba(255,196,100,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(p.x, p.y, r * 3.4, 0, TAU);
      c.fill();
    }
    c.restore();
  }

  drawCab(c, state, time) {
    const { W, H } = this;
    const train = TRAINS[state.train] || TRAINS.ic2000;
    const x0 = W * (this.portrait ? 0.045 : 0.032);
    const x1 = W * (this.portrait ? 0.955 : 0.968);
    const top = H * (this.portrait ? 0.024 : 0.03);
    const bottom = H * (this.portrait ? 0.755 : 0.795);
    const r = Math.max(10, Math.min(W, H) * 0.022);

    // frame with a glass cut-out
    c.save();
    c.fillStyle = '#121518';
    c.beginPath();
    c.rect(0, 0, W, H);
    c.moveTo(x0 + r, top);
    c.lineTo(x1 - r, top);
    c.quadraticCurveTo(x1, top, x1, top + r);
    c.lineTo(x1, bottom);
    c.lineTo(x0, bottom);
    c.lineTo(x0, top + r);
    c.quadraticCurveTo(x0, top, x0 + r, top);
    c.closePath();
    const fg = c.createLinearGradient(0, 0, 0, H);
    fg.addColorStop(0, '#22282d');
    fg.addColorStop(0.45, '#14181b');
    fg.addColorStop(1, '#090b0d');
    c.fillStyle = fg;
    c.fill('evenodd');

    // inner highlight
    c.strokeStyle = 'rgba(255,255,255,0.10)';
    c.lineWidth = 1.2;
    c.strokeRect(x0 + 0.5, top + 0.5, x1 - x0 - 1, bottom - top - 1);

    // A-pillars
    c.fillStyle = 'rgba(8,10,12,0.55)';
    c.beginPath();
    c.moveTo(x0, top + H * 0.06);
    c.lineTo(x0 + W * (this.portrait ? 0.035 : 0.024), top);
    c.lineTo(x0 + W * (this.portrait ? 0.045 : 0.031), bottom);
    c.lineTo(x0, bottom);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(x1, top + H * 0.06);
    c.lineTo(x1 - W * (this.portrait ? 0.035 : 0.024), top);
    c.lineTo(x1 - W * (this.portrait ? 0.045 : 0.031), bottom);
    c.lineTo(x1, bottom);
    c.closePath();
    c.fill();

    // top visor
    const visor = c.createLinearGradient(0, top, 0, top + H * 0.065);
    visor.addColorStop(0, '#0d1012');
    visor.addColorStop(1, 'rgba(13,16,18,0)');
    c.fillStyle = visor;
    c.fillRect(x0, top, x1 - x0, H * 0.065);

    // train-specific nose sliver at the bottom of the glass
    const noseY = bottom - H * 0.014;
    const noseW = W * (train.id === 'twindexx' ? 0.34 : 0.38);
    const ng = c.createLinearGradient(0, noseY, 0, bottom);
    if (train.id === 'twindexx') {
      ng.addColorStop(0, '#e9e5dc');
      ng.addColorStop(0.35, '#d8232a');
      ng.addColorStop(1, '#95161d');
    } else {
      ng.addColorStop(0, '#e43a36');
      ng.addColorStop(0.5, '#bd1f27');
      ng.addColorStop(1, '#7e1218');
    }
    c.fillStyle = ng;
    c.beginPath();
    c.moveTo(W / 2 - noseW / 2, bottom);
    c.quadraticCurveTo(W / 2 - noseW * 0.28, noseY, W / 2, noseY);
    c.quadraticCurveTo(W / 2 + noseW * 0.28, noseY, W / 2 + noseW / 2, bottom);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.beginPath();
    c.ellipse(W / 2 - noseW * 0.16, noseY + H * 0.004, noseW * 0.12, H * 0.006, 0, 0, TAU);
    c.fill();

    // wipers
    c.strokeStyle = 'rgba(10,12,13,0.72)';
    c.lineWidth = Math.max(1.2, W * 0.0014);
    for (const side of [-1, 1]) {
      const bx = W / 2 + side * W * 0.18;
      c.beginPath();
      c.moveTo(bx, bottom - H * 0.005);
      c.lineTo(bx + side * W * 0.06, bottom - H * 0.105);
      c.stroke();
    }

    // glass reflections
    c.globalCompositeOperation = 'screen';
    const refl = c.createLinearGradient(x0, top, x1, bottom);
    refl.addColorStop(0, 'rgba(255,255,255,0.030)');
    refl.addColorStop(0.38, 'rgba(255,255,255,0.012)');
    refl.addColorStop(0.55, 'rgba(255,255,255,0.055)');
    refl.addColorStop(0.7, 'rgba(255,255,255,0.008)');
    refl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = refl;
    c.fillRect(x0, top, x1 - x0, bottom - top);
    c.globalCompositeOperation = 'source-over';

    // dashboard
    const dy = bottom;
    const dash = c.createLinearGradient(0, dy, 0, H);
    dash.addColorStop(0, '#252b30');
    dash.addColorStop(0.1, '#171b1f');
    dash.addColorStop(1, '#07090a');
    c.fillStyle = dash;
    c.beginPath();
    c.moveTo(0, H);
    c.lineTo(0, dy + H * 0.012);
    c.quadraticCurveTo(W * 0.5, dy - H * 0.025, W, dy + H * 0.012);
    c.lineTo(W, H);
    c.closePath();
    c.fill();

    // dashboard lip
    c.strokeStyle = train.trim;
    c.globalAlpha = 0.5;
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(x0, dy + H * 0.012);
    c.quadraticCurveTo(W * 0.5, dy - H * 0.022, x1, dy + H * 0.012);
    c.stroke();
    c.globalAlpha = 1;

    // subtle vents and a plaque
    c.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 6; i++) {
      const vx = W * 0.42 + i * W * 0.028;
      roundedRect(c, vx, H * 0.87, W * 0.019, H * 0.006, 2);
      c.fill();
    }
    c.fillStyle = 'rgba(236,232,220,0.5)';
    c.font = `600 ${Math.max(9, W * 0.0085)}px "Instrument Sans", sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(`${train.name.toUpperCase()}  ·  IR 16`, W / 2, H * 0.918);

    // vignette inside the glass
    const vg = c.createRadialGradient(W / 2, H * 0.44, H * 0.2, W / 2, H * 0.44, W * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.72, 'rgba(0,0,0,0.06)');
    vg.addColorStop(1, `rgba(0,0,0,${0.42 + this.speedRatio * 0.1})`);
    c.fillStyle = vg;
    c.beginPath();
    c.rect(x0, top, x1 - x0, bottom - top);
    c.fill();

    // speed streaks at the edge of the glass
    if (state.speed > 25) {
      const amount = clamp((state.speed - 25) / 30, 0, 1);
      c.strokeStyle = `rgba(255,255,255,${0.065 * amount})`;
      c.lineWidth = 1;
      for (let i = 0; i < 14; i++) {
        const yy = top + (bottom - top) * (0.12 + i * 0.055);
        const len = W * (0.02 + ((i * 37) % 11) * 0.006) * amount;
        const inset = W * 0.045;
        c.beginPath();
        c.moveTo(x0 + inset, yy);
        c.lineTo(x0 + inset + len, yy);
        c.moveTo(x1 - inset, yy);
        c.lineTo(x1 - inset - len, yy);
        c.stroke();
      }
    }
    c.restore();
  }

  drawEffects(c, state, time) {
    const { W, H } = this;
    // warm lens flare
    const sunX = W * 0.735 - Math.sin(this.heading) * W * 0.11;
    c.save();
    c.globalCompositeOperation = 'screen';
    const flare = c.createRadialGradient(sunX, H * 0.165, 0, sunX, H * 0.165, W * 0.14);
    flare.addColorStop(0, 'rgba(255,246,214,0.12)');
    flare.addColorStop(1, 'rgba(255,246,214,0)');
    c.fillStyle = flare;
    c.fillRect(0, 0, W, H);
    c.restore();

    // filmic vignette over the whole view
    const v = c.createRadialGradient(W / 2, H * 0.46, H * 0.3, W / 2, H * 0.5, Math.max(W, H) * 0.8);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(0.75, 'rgba(0,0,0,0.06)');
    v.addColorStop(1, 'rgba(0,0,0,0.3)');
    c.fillStyle = v;
    c.fillRect(0, 0, W, H);

    if (state.tunnelAmt > 0.6) {
      c.fillStyle = `rgba(4,6,7,${0.15 * state.tunnelAmt})`;
      c.fillRect(0, 0, W, H);
    }
  }
}

export { makeRidge, drawRidge };
