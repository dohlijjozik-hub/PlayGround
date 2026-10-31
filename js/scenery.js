import {
  STATIONS, TUNNEL, sampleRoute, regionAt, ROUTE_LENGTH,
} from './route.js';
import { clamp, lerp, smoothstep, rgba, mod, mulberry32, clockText } from './util.js';
import {
  pathThrough, fillQuad, polyFill, polyStroke, quadPoint, shade, roundedRect, lerpPt,
} from './drawlib.js';
import { drawTrainSide } from './trains.js';

// ---------------------------------------------------------------------------
// Scenery art. Everything is drawn from a cab-height camera, so objects are
// billboarded or built from a handful of projected faces. No bitmaps.
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;

const PALETTE = {
  houseWalls: ['#DED4BE', '#E9E1CE', '#CBBFA8', '#D8C6AC'],
  houseRoofs: ['#7A4E3A', '#5C4034', '#8A5A3C', '#4C413D'],
  cityWalls: ['#C9C6BA', '#B7B5AA', '#D4CFC2', '#A9ABA4'],
  oldWalls: ['#C8AE84', '#D5BE95', '#BCA37C', '#CBB891'],
  oldRoofs: ['#6E4A3A', '#5A3F34', '#7D5642', '#514039'],
};

function shadeTree(ctx, h, alpha, type, seed) {
  const trunkW = Math.max(0.16, h * 0.045);
  ctx.fillStyle = rgba('#67452c', alpha);
  ctx.fillRect(-trunkW / 2, -h * 0.45, trunkW, h * 0.45);

  if (type === 'pine') {
    const levels = 3;
    for (let i = 0; i < levels; i++) {
      const y = -h * (0.34 + i * 0.2);
      const w = h * (0.44 - i * 0.1);
      const top = y - h * 0.34;
      ctx.beginPath();
      ctx.moveTo(0, top);
      ctx.lineTo(w, y);
      ctx.lineTo(-w, y);
      ctx.closePath();
      ctx.fillStyle = i === 0 ? rgba('#2f5b3b', alpha) : rgba(i === 1 ? '#386b44' : '#417a4b', alpha);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(-h * 0.06, -h * 0.96);
    ctx.lineTo(-h * 0.34, -h * 0.48);
    ctx.lineTo(h * 0.02, -h * 0.55);
    ctx.closePath();
    ctx.fillStyle = rgba('#5f8f58', alpha * 0.25);
    ctx.fill();
  } else {
    const crownY = -h * 0.68;
    const r = h * 0.31;
    const colors = ['#416e38', '#4e7f40', '#5c8f49'];
    for (let i = 0; i < 3; i++) {
      const a = i * 2.2 + seed * 4;
      const ox = Math.cos(a) * r * 0.38;
      const oy = Math.sin(a) * r * 0.3;
      ctx.beginPath();
      ctx.arc(ox, crownY + oy, r * (1 - i * 0.08), 0, TAU);
      ctx.fillStyle = rgba(colors[i], alpha);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(-r * 0.3, crownY - r * 0.25, r * 0.42, 0, TAU);
    ctx.fillStyle = rgba('#7aa35e', alpha * 0.55);
    ctx.fill();
  }
}

function drawTree(r, obj, p, alpha, t) {
  const h = obj.h * obj.size;
  if (p.k * h < 1.5) return;
  ctx(r);
  const c = r.ctx;
  c.save();
  c.globalAlpha = alpha;
  c.translate(p.x, p.y);
  c.scale(p.k, p.k);
  // ground shadow
  c.beginPath();
  c.ellipse(0.2, 0, h * 0.34, h * 0.075, 0, 0, TAU);
  c.fillStyle = 'rgba(39,58,35,0.18)';
  c.fill();
  shadeTree(c, h, 1, obj.type, obj.seed);
  c.restore();
}

const ctx = (r) => r.ctx;

function drawCow(r, obj, p, alpha) {
  if (p.k < 0.55) return;
  const c = r.ctx;
  c.save();
  c.globalAlpha = alpha;
  c.translate(p.x, p.y);
  c.scale(p.k, p.k);
  const s = obj.size;
  c.fillStyle = '#f1ead9';
  c.beginPath();
  c.ellipse(0, -0.85 * s, 0.72 * s, 0.44 * s, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#7a4c30';
  c.beginPath();
  c.ellipse(-0.18 * s, -0.92 * s, 0.32 * s, 0.24 * s, 0.4, 0, TAU);
  c.fill();
  c.beginPath();
  c.ellipse(0.36 * s, -0.78 * s, 0.22 * s, 0.14 * s, -0.2, 0, TAU);
  c.fill();
  c.fillStyle = '#2f2a26';
  c.fillRect(-0.5 * s, -0.58 * s, 0.13 * s, 0.58 * s);
  c.fillRect(0.4 * s, -0.58 * s, 0.13 * s, 0.58 * s);
  c.beginPath();
  c.arc(0.68 * s, -1.02 * s, 0.23 * s, 0, TAU);
  c.fillStyle = '#f1ead9';
  c.fill();
  c.fillStyle = '#2f2a26';
  c.beginPath();
  c.arc(0.76 * s, -1.06 * s, 0.045 * s, 0, TAU);
  c.fill();
  c.restore();
}

function drawHaybale(r, obj, p, alpha) {
  if (p.k < 0.5) return;
  const c = r.ctx;
  c.save();
  c.globalAlpha = alpha;
  c.translate(p.x, p.y);
  c.scale(p.k, p.k);
  const s = obj.size;
  c.fillStyle = '#b99a58';
  c.beginPath();
  c.ellipse(0, -0.55 * s, 0.7 * s, 0.55 * s, 0, 0, TAU);
  c.fill();
  c.strokeStyle = '#8f743f';
  c.lineWidth = 0.06;
  for (let i = -2; i <= 2; i++) {
    c.beginPath();
    c.ellipse(0, -0.55 * s, 0.7 * s, 0.55 * s, 0, i * 0.4, i * 0.4 + 0.3);
    c.stroke();
  }
  c.restore();
}

function drawFence(r, obj, p, alpha) {
  if (p.k < 0.4) return;
  const c = r.ctx;
  const n = Math.max(2, Math.round(obj.w / 2.6));
  const s0 = obj.s - obj.w / 2;
  const posts = [];
  for (let i = 0; i <= n; i++) {
    const q = r.project(s0 + (obj.w * i) / n, obj.lat, 1.15);
    const b = r.project(s0 + (obj.w * i) / n, obj.lat, 0);
    if (q && b) posts.push({ q, b });
  }
  if (posts.length < 2) return;
  c.save();
  c.globalAlpha = alpha * 0.9;
  c.strokeStyle = '#6d5a44';
  c.lineWidth = Math.max(0.6, p.k * 0.055);
  for (const post of posts) {
    c.beginPath();
    c.moveTo(post.b.x, post.b.y);
    c.lineTo(post.q.x, post.q.y);
    c.stroke();
  }
  c.strokeStyle = '#8a7358';
  c.lineWidth = Math.max(0.5, p.k * 0.045);
  for (const level of [0.45, 0.9]) {
    c.beginPath();
    posts.forEach((post, i) => {
      const y = post.b.y + (post.q.y - post.b.y) * level;
      if (i === 0) c.moveTo(post.b.x, y);
      else c.lineTo(post.b.x, y);
    });
    c.stroke();
  }
  c.restore();
}

function drawFlag(r, obj, p, alpha, t) {
  if (p.k < 0.45) return;
  const h = obj.h;
  const c = r.ctx;
  c.save();
  c.globalAlpha = alpha;
  c.translate(p.x, p.y);
  c.scale(p.k, p.k);
  c.strokeStyle = '#8b8e88';
  c.lineWidth = 0.07;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(0, -h);
  c.stroke();
  const wave = Math.sin(t * 2.3 + obj.seed * 8) * 0.12;
  c.beginPath();
  c.moveTo(0, -h);
  c.quadraticCurveTo(1.1, -h + 0.15 + wave, 2.2, -h + 0.05);
  c.lineTo(2.2, -h + 1.15);
  c.quadraticCurveTo(1.1, -h + 1.25 - wave, 0, -h + 1.25);
  c.closePath();
  c.fillStyle = '#d92b2b';
  c.fill();
  c.fillStyle = '#fff';
  c.fillRect(0.95, -h + 0.5, 0.3, 0.9);
  c.fillRect(0.65, -h + 0.8, 0.9, 0.3);
  c.restore();
}

function drawLamp(r, obj, p, alpha) {
  if (p.k < 0.5) return;
  const c = r.ctx;
  c.save();
  c.globalAlpha = alpha;
  c.translate(p.x, p.y);
  c.scale(p.k, p.k);
  c.strokeStyle = '#4f5450';
  c.lineWidth = 0.09;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(0, -obj.h);
  c.quadraticCurveTo(0.1, -obj.h - 0.4, 0.75, -obj.h - 0.4);
  c.stroke();
  c.fillStyle = '#e8d9a7';
  c.beginPath();
  c.ellipse(0.78, -obj.h - 0.33, 0.22, 0.1, 0, 0, TAU);
  c.fill();
  c.restore();
}

function drawWindmill(r, obj, p, alpha, t) {
  if (p.k < 0.3) return;
  const c = r.ctx;
  c.save();
  c.globalAlpha = alpha;
  c.translate(p.x, p.y);
  c.scale(p.k, p.k);
  c.fillStyle = '#d6d3c8';
  c.beginPath();
  c.moveTo(-1.6, 0);
  c.lineTo(-0.9, -obj.h);
  c.lineTo(0.9, -obj.h);
  c.lineTo(1.6, 0);
  c.closePath();
  c.fill();
  c.fillStyle = '#8f918a';
  c.beginPath();
  c.moveTo(-1.1, 0);
  c.lineTo(-0.7, -obj.h * 0.92);
  c.lineTo(0.6, -obj.h * 0.92);
  c.lineTo(1.0, 0);
  c.closePath();
  c.fill();
  c.save();
  c.translate(0, -obj.h);
  c.rotate(t * 0.55 + obj.seed);
  c.strokeStyle = '#e8e4d9';
  c.lineWidth = 0.28;
  for (let i = 0; i < 3; i++) {
    c.rotate(TAU / 3);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(0, -10.5);
    c.stroke();
  }
  c.fillStyle = '#eeeae0';
  c.beginPath();
  c.arc(0, 0, 0.65, 0, TAU);
  c.fill();
  c.restore();
  c.restore();
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

function wallsFor(obj) {
  if (obj.type === 'cityblock') {
    return {
      wall: PALETTE.cityWalls[obj.v % PALETTE.cityWalls.length],
      roof: PALETTE.houseRoofs[obj.v % PALETTE.houseRoofs.length],
      flat: true,
    };
  }
  if (obj.oldtown) {
    return {
      wall: PALETTE.oldWalls[obj.v % PALETTE.oldWalls.length],
      roof: PALETTE.oldRoofs[obj.v % PALETTE.oldRoofs.length],
      flat: false,
    };
  }
  return {
    wall: PALETTE.houseWalls[obj.v % PALETTE.houseWalls.length],
    roof: PALETTE.houseRoofs[obj.v % PALETTE.houseRoofs.length],
    flat: false,
  };
}

function drawBuilding(r, obj, p, alpha, opts = {}) {
  const c = r.ctx;
  const wall = opts.wall || wallsFor(obj).wall;
  const roof = opts.roof || wallsFor(obj).roof;
  const flat = opts.flat ?? wallsFor(obj).flat;
  const s0 = obj.s - obj.w / 2;
  const s1 = obj.s + obj.w / 2;
  const l0 = obj.lat - obj.d / 2;
  const l1 = obj.lat + obj.d / 2;
  const sideLat = obj.lat >= 0 ? l0 : l1;
  const h = obj.h;

  const b0 = r.project(s0, sideLat, 0);
  const b1 = r.project(s1, sideLat, 0);
  const t0 = r.project(s0, sideLat, h);
  const t1 = r.project(s1, sideLat, h);
  if (!b0 || !b1 || !t0 || !t1) return;

  const wpx = Math.abs(b1.x - b0.x);
  if (wpx < 1.2) return;

  c.save();
  c.globalAlpha = alpha;

  // track-facing side
  fillQuad(c, b0, b1, t1, t0, shade(wall, 0));
  // subtle vertical shading
  const grad = c.createLinearGradient(b0.x, 0, b1.x, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.10)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.10)');
  fillQuad(c, b0, b1, t1, t0, grad);

  // near end
  const n0 = r.project(s0, l0, 0);
  const n1 = r.project(s0, l1, 0);
  const n2 = r.project(s0, l1, h);
  const n3 = r.project(s0, l0, h);
  if (n0 && n1 && n2 && n3 && r.camS < s0) {
    fillQuad(c, n0, n1, n2, n3, shade(wall, -18));
    // End-face windows and entrance doors, so a station hall never reads as a
    // blank wall when it is close to the camera.
    const q = [n0, n1, n2, n3];
    const cols = Math.max(1, Math.min(6, Math.floor(obj.d / 3.1)));
    const rows = Math.max(1, Math.min(4, Math.floor(h / 3.4)));
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const u0 = (col + 0.24) / cols;
        const u1 = (col + 0.76) / cols;
        const v0 = 0.2 + row * (0.55 / rows);
        const v1 = v0 + 0.28 / rows + 0.07;
        const lit = ((obj.seed * 613 + row * 29 + col * 13) % 9) < 2;
        polyFill(c, [quadPoint(q, u0, v0), quadPoint(q, u1, v0), quadPoint(q, u1, v1), quadPoint(q, u0, v1)],
          lit ? '#d8b56f' : 'rgba(57,72,78,0.8)');
      }
    }
    // ground floor entrance
    const d0 = quadPoint(q, 0.42, 0);
    const d1 = quadPoint(q, 0.58, 0);
    const d2 = quadPoint(q, 0.58, 0.15);
    const d3 = quadPoint(q, 0.42, 0.15);
    polyFill(c, [d0, d1, d2, d3], 'rgba(30,38,40,0.88)');
  }

  // foundation
  const f0 = r.project(s0, sideLat, 0.55);
  const f1 = r.project(s1, sideLat, 0.55);
  if (f0 && f1) {
    c.globalAlpha = alpha * 0.65;
    fillQuad(c, b0, b1, f1, f0, shade(wall, -34));
    c.globalAlpha = alpha;
  }

  // windows
  if (wpx > 26) {
    const q = [b0, b1, t1, t0];
    const cols = Math.max(1, Math.min(5, Math.floor(obj.w / 3.6)));
    const rows = Math.max(1, Math.min(4, Math.floor(h / 3.4)));
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const u0 = (col + 0.28) / cols;
        const u1 = (col + 0.72) / cols;
        const v0 = 0.2 + row * (0.58 / rows);
        const v1 = v0 + 0.26 / rows + 0.08;
        const lit = ((obj.seed * 977 + row * 31 + col * 17) % 11) < 2;
        const qq = [
          quadPoint(q, u0, v0), quadPoint(q, u1, v0),
          quadPoint(q, u1, v1), quadPoint(q, u0, v1),
        ];
        polyFill(c, qq, lit ? '#d8b56f' : 'rgba(57,72,78,0.82)');
        if (!lit) {
          c.globalAlpha = alpha * 0.35;
          polyFill(c, [qq[0], qq[1], lerpPt(qq[1], qq[2], 0.5), lerpPt(qq[0], qq[3], 0.5)], '#9fb4b8');
          c.globalAlpha = alpha;
        }
      }
    }
  }

  // roof
  if (flat) {
    const r0 = r.project(s0, l0, h);
    const r1 = r.project(s1, l0, h);
    const r2 = r.project(s1, l1, h);
    const r3 = r.project(s0, l1, h);
    if (r0 && r1 && r2 && r3) {
      polyFill(c, [r0, r1, r2, r3], shade(roof, 8));
      polyStroke(c, [r0, r1, r2, r3], 'rgba(0,0,0,0.18)', Math.max(0.5, p.k * 0.03));
    }
    // parapet
    const pr = r.project(s1, sideLat, h);
    if (pr) {
      c.strokeStyle = 'rgba(255,255,255,0.16)';
      c.lineWidth = Math.max(0.5, p.k * 0.05);
      c.beginPath();
      c.moveTo(t0.x, t0.y);
      c.lineTo(t1.x, t1.y);
      c.stroke();
    }
  } else {
    const rh = Math.min(4.2, Math.max(1.8, h * 0.36));
    const ridgeLat = obj.lat;
    const e0 = r.project(s0, sideLat, h);
    const e1 = r.project(s1, sideLat, h);
    const g0 = r.project(s0, ridgeLat, h + rh);
    const g1 = r.project(s1, ridgeLat, h + rh);
    if (e0 && e1 && g0 && g1) {
      fillQuad(c, e0, e1, g1, g0, roof);
      c.globalAlpha = alpha * 0.35;
      fillQuad(c, e0, e1, lerpPt(e1, g1, 0.15), lerpPt(e0, g0, 0.15), '#ffffff');
      c.globalAlpha = alpha;
      c.strokeStyle = 'rgba(0,0,0,0.24)';
      c.lineWidth = Math.max(0.5, p.k * 0.04);
      c.beginPath();
      c.moveTo(g0.x, g0.y);
      c.lineTo(g1.x, g1.y);
      c.stroke();
    }
    if (r.camS < s0) {
      const ga = r.project(s0, l0, h);
      const gb = r.project(s0, l1, h);
      const gc = r.project(s0, ridgeLat, h + rh);
      if (ga && gb && gc) {
        polyFill(c, [ga, gb, gc], shade(wall, -8));
        polyStroke(c, [ga, gb, gc], 'rgba(0,0,0,0.15)', Math.max(0.5, p.k * 0.03));
      }
    }
  }

  c.restore();
}

function drawChurch(r, obj, p, alpha) {
  const nave = { ...obj, type: 'house', w: obj.w, d: obj.d, h: obj.h };
  drawBuilding(r, nave, p, alpha, { wall: '#e3dccb', roof: '#6f4d3d' });
  const towerS = obj.s - obj.w / 2 - 1.5;
  const tp = r.project(towerS, obj.lat, 0);
  if (!tp) return;
  const h = obj.h + 10;
  const c = r.ctx;
  c.save();
  c.globalAlpha = alpha;
  c.translate(tp.x, tp.y);
  c.scale(tp.k, tp.k);
  const w = 4.2;
  c.fillStyle = '#e9e2d2';
  c.fillRect(-w / 2, -h, w, h);
  c.fillStyle = '#d3c9b7';
  c.fillRect(0, -h, w / 2, h);
  c.fillStyle = '#5a5148';
  c.fillRect(-w / 2 + 0.8, -h + 2.2, 1.1, 2.2);
  c.fillRect(0.4, -h + 2.2, 1.1, 2.2);
  // clock
  c.beginPath();
  c.arc(0, -h * 0.68, 1.15, 0, TAU);
  c.fillStyle = '#f1ebda';
  c.fill();
  c.strokeStyle = '#3a3833';
  c.lineWidth = 0.15;
  c.stroke();
  c.beginPath();
  c.moveTo(0, -h * 0.68);
  c.lineTo(0, -h * 0.68 - 0.7);
  c.moveTo(0, -h * 0.68);
  c.lineTo(0.55, -h * 0.68 + 0.25);
  c.stroke();
  // spire
  c.beginPath();
  c.moveTo(-w * 0.72, -h);
  c.lineTo(0, -h - 8.5);
  c.lineTo(w * 0.72, -h);
  c.closePath();
  c.fillStyle = '#4f6b5d';
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.12)';
  c.beginPath();
  c.moveTo(-w * 0.72, -h);
  c.lineTo(0, -h - 8.5);
  c.lineTo(0, -h);
  c.closePath();
  c.fill();
  c.strokeStyle = '#313d37';
  c.lineWidth = 0.12;
  c.beginPath();
  c.moveTo(0, -h - 8.5);
  c.lineTo(0, -h - 9.4);
  c.moveTo(-0.5, -h - 9);
  c.lineTo(0.5, -h - 9);
  c.stroke();
  c.restore();
}

function drawCastle(r, obj, p, alpha) {
  const c = r.ctx;
  // mound
  const base = r.project(obj.s, obj.lat, 0);
  if (base) {
    c.save();
    c.globalAlpha = alpha * 0.8;
    c.fillStyle = '#4e6c43';
    c.beginPath();
    c.ellipse(base.x, base.y, 20 * base.k, 4.2 * base.k, 0, 0, TAU);
    c.fill();
    c.restore();
  }
  drawBuilding(r, { ...obj, type: 'cityblock', oldtown: true, v: 1 }, p, alpha, {
    wall: '#bcae92', roof: '#5f4a3c', flat: false,
  });
  // two towers
  for (const [ds, w] of [[-obj.w * 0.34, 3.8], [obj.w * 0.3, 4.6]]) {
    const tp = r.project(obj.s + ds, obj.lat + obj.d * 0.32, 0);
    if (!tp) continue;
    c.save();
    c.globalAlpha = alpha;
    c.translate(tp.x, tp.y);
    c.scale(tp.k, tp.k);
    const h = obj.h + 7;
    c.fillStyle = '#c3b393';
    c.fillRect(-w / 2, -h, w, h);
    c.fillStyle = '#9e8e73';
    c.fillRect(0, -h, w / 2, h);
    // crenellations
    for (let i = -1; i <= 1; i++) {
      c.fillStyle = '#b4a486';
      c.fillRect(i * w * 0.35 - w * 0.12, -h - 1.1, w * 0.24, 1.1);
    }
    c.fillStyle = '#4f4a40';
    c.fillRect(-w * 0.16, -h + 2.2, w * 0.3, 1.8);
    c.restore();
  }
}

function drawTower(r, obj, p, alpha) {
  if (p.k < 0.4) return;
  const c = r.ctx;
  const h = obj.h;
  const w = obj.w;
  c.save();
  c.globalAlpha = alpha;
  c.translate(p.x, p.y);
  c.scale(p.k, p.k);
  c.fillStyle = '#c7b18b';
  c.fillRect(-w / 2, -h, w, h);
  c.fillStyle = '#ab9673';
  c.fillRect(0, -h, w / 2, h);
  // arched passage
  c.fillStyle = '#3b3731';
  c.beginPath();
  c.moveTo(-1.6, 0);
  c.lineTo(-1.6, -4.2);
  c.quadraticCurveTo(0, -6.2, 1.6, -4.2);
  c.lineTo(1.6, 0);
  c.closePath();
  c.fill();
  // clock
  c.beginPath();
  c.arc(0, -h * 0.64, 2.5, 0, TAU);
  c.fillStyle = '#dfc477';
  c.fill();
  c.strokeStyle = '#4c3f2a';
  c.lineWidth = 0.28;
  c.stroke();
  c.beginPath();
  c.arc(0, -h * 0.64, 1.9, 0, TAU);
  c.strokeStyle = '#8f7441';
  c.lineWidth = 0.12;
  c.stroke();
  c.strokeStyle = '#3c3428';
  c.lineWidth = 0.26;
  c.beginPath();
  c.moveTo(0, -h * 0.64);
  c.lineTo(0, -h * 0.64 - 1.4);
  c.moveTo(0, -h * 0.64);
  c.lineTo(0.9, -h * 0.64 + 0.5);
  c.stroke();
  // roof
  c.beginPath();
  c.moveTo(-w * 0.7, -h);
  c.lineTo(0, -h - 6.5);
  c.lineTo(w * 0.7, -h);
  c.closePath();
  c.fillStyle = '#5d4438';
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.12)';
  c.beginPath();
  c.moveTo(-w * 0.7, -h);
  c.lineTo(0, -h - 6.5);
  c.lineTo(0, -h);
  c.closePath();
  c.fill();
  c.restore();
}

export function drawSceneryObject(r, obj, p, alpha, t) {
  const hpx = obj.h * p.k;
  if (p.x < -hpx * 3 - 80 || p.x > r.W + hpx * 3 + 80) return;
  switch (obj.type) {
    case 'tree':
    case 'pine':
      drawTree(r, obj, p, alpha, t);
      break;
    case 'cow':
      drawCow(r, obj, p, alpha);
      break;
    case 'haybale':
      drawHaybale(r, obj, p, alpha);
      break;
    case 'fence':
      drawFence(r, obj, p, alpha);
      break;
    case 'flag':
      drawFlag(r, obj, p, alpha, t);
      break;
    case 'lamp':
      drawLamp(r, obj, p, alpha);
      break;
    case 'windmill':
      drawWindmill(r, obj, p, alpha, t);
      break;
    case 'house':
    case 'barn':
    case 'farm':
    case 'cityblock':
      drawBuilding(r, obj, p, alpha);
      break;
    case 'church':
      drawChurch(r, obj, p, alpha);
      break;
    case 'castle':
      drawCastle(r, obj, p, alpha);
      break;
    case 'tower':
      drawTower(r, obj, p, alpha);
      break;
  }
}

// ---------------------------------------------------------------------------
// Stations
// ---------------------------------------------------------------------------

const PEOPLE = new Map();

function peopleFor(st) {
  if (PEOPLE.has(st.id)) return PEOPLE.get(st.id);
  let seed = 0;
  for (const ch of st.code) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  let a = seed || 1;
  const rng = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const list = [];
  const count = st.terminal ? 16 : 8;
  for (let i = 0; i < count; i++) {
    list.push({
      s: st.platformStart + 22 + rng() * (st.platformEnd - st.platformStart - 44),
      lat: 5.3 + rng() * 4.2,
      h: 1.58 + rng() * 0.26,
      coat: ['#2f3a45', '#6b3b36', '#41574a', '#7c6a4d', '#34363b', '#8c4a3e'][Math.floor(rng() * 6)],
      bag: rng() < 0.25,
      phase: rng() * 6,
    });
  }
  PEOPLE.set(st.id, list);
  return list;
}

function platformSurface(r, s0, s1, l0, l1, h, color, step = 9) {
  const c = r.ctx;
  const start = Math.max(s0, r.camS + 2);
  if (s1 <= start) return;
  const left = [];
  const right = [];
  for (let s = start; s <= s1 + 0.001; s += step) {
    const ss = Math.min(s, s1);
    const a = r.project(ss, l0, h);
    const b = r.project(ss, l1, h);
    if (a && b) { left.push(a); right.push(b); }
  }
  if (left.length < 2) return;
  polyFill(c, [...left, ...right.reverse()], color);
  return left;
}

// ---------------------------------------------------------------------------
// Station-specific architecture. The real IR 16 stops each have a strong
// identity: Zürich's glazed train shed, Bern's sandstone hall, Olten's wide
// junction, Aarau's yellow station, and the smaller Mittelland platforms.
// ---------------------------------------------------------------------------

const STATION_LOOK = {
  zurich: {
    wall: '#ddd5c3', roof: '#5d5952', h: 16, w: 42, d: 16, lat: 21,
    flat: false, sign: 'ZÜRICH HB', accent: '#d8232a', shed: 'glass',
    bridge: true, bridgeOffset: 96, buildingOffset: 38,
  },
  baden: {
    wall: '#dedbd1', roof: '#6f7578', h: 9.6, w: 27, d: 12, lat: 18.5,
    flat: true, sign: 'BADEN', accent: '#d8232a', shed: null,
    bridge: true, bridgeOffset: -150, buildingOffset: 22,
  },
  brugg: {
    wall: '#dbd1bd', roof: '#655048', h: 8.6, w: 23, d: 11, lat: 18,
    flat: false, sign: 'BRUGG AG', accent: '#d8232a', shed: null,
    bridge: true, bridgeOffset: -158, buildingOffset: 18,
  },
  aarau: {
    wall: '#e6d3a0', roof: '#61483a', h: 11, w: 30, d: 13, lat: 19,
    flat: false, sign: 'AARAU', accent: '#d8232a', shed: null,
    bridge: true, bridgeOffset: -168, buildingOffset: 24,
  },
  olten: {
    wall: '#d0c9b9', roof: '#5b5851', h: 12, w: 35, d: 15, lat: 20,
    flat: true, sign: 'OLTEN', accent: '#d8232a', shed: null,
    bridge: true, bridgeOffset: -142, buildingOffset: 28,
  },
  bern: {
    wall: '#c5a17b', roof: '#5a4034', h: 15, w: 40, d: 16, lat: 21,
    flat: false, sign: 'BERN', accent: '#d8232a', shed: 'hall',
    bridge: true, bridgeOffset: -205, buildingOffset: 42,
  },
  default: {
    wall: '#d8ccb5', roof: '#655048', h: 9.5, w: 24, d: 12, lat: 18.5,
    flat: false, sign: 'SBB', accent: '#d8232a', shed: null,
    bridge: false, bridgeOffset: 0, buildingOffset: 12,
  },
};

/** A second track beside the platform, on which the other train set waits. */
function drawSiding(r, ps, pe, lat) {
  const c = r.ctx;
  const start = Math.max(ps, r.camS + 2);
  if (pe <= start) return;
  const left = [];
  const right = [];
  for (let s = start; s <= pe + 0.001; s += 12) {
    const ss = Math.min(s, pe);
    const a = r.project(ss, lat - 1.85, 0.02);
    const b = r.project(ss, lat + 1.85, 0.02);
    if (a && b) { left.push(a); right.push(b); }
  }
  if (left.length > 1) polyFill(c, [...left, ...right.reverse()], '#777064');
  for (const off of [-0.72, 0.72]) {
    const pts = [];
    for (let s = start; s <= pe; s += 8) {
      const p = r.project(s, lat + off, 0.15);
      if (p) pts.push(p);
    }
    if (pts.length > 1) {
      polyStroke(c, pts, '#45423c', Math.max(1.3, pts[0].k * 0.13));
      polyStroke(c, pts.map((p) => ({ x: p.x, y: p.y - 0.6 })), 'rgba(224,217,201,0.8)', Math.max(0.6, pts[0].k * 0.05));
    }
  }
}

function drawPaving(r, ps, pe, l0, l1) {
  const c = r.ctx;
  const start = Math.max(ps, r.camS + 2);
  if (pe <= start) return;
  c.save();
  c.strokeStyle = 'rgba(66, 70, 65, 0.28)';
  c.lineWidth = 1;
  for (let s = start; s <= pe; s += 7) {
    const a = r.project(s, l0, 0.577);
    const b = r.project(s, l1, 0.577);
    if (a && b && a.d < 900) {
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    }
  }
  const a = r.project(start, (l0 + l1) / 2, 0.577);
  const b = r.project(pe, (l0 + l1) / 2, 0.577);
  if (a && b) {
    c.strokeStyle = 'rgba(66, 70, 65, 0.13)';
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
  }
  c.restore();
}

function drawStationBuilding(r, st, side, dStation) {
  if (dStation < -320 || dStation > 2450) return;
  const c = r.ctx;
  const look = STATION_LOOK[st.id] || STATION_LOOK.default;
  const bS = st.stopS + look.buildingOffset;
  const base = r.project(bS, side * look.lat, 0);
  if (!base) return;
  drawBuilding(r, {
    s: bS, lat: side * look.lat, w: look.w, d: look.d, h: look.h,
    v: st.id === 'bern' ? 4 : st.id === 'aarau' ? 2 : 1,
    oldtown: st.id === 'bern' || st.id === 'aarau',
    type: 'cityblock', seed: 0.33,
  }, base, 1, { wall: look.wall, roof: look.roof, flat: look.flat });

  const wallLat = side * (look.lat - look.d / 2);
  const signH = look.h * (st.terminal ? 0.61 : 0.66);
  const sp = r.project(bS + look.w * 0.06, wallLat - side * 0.15, signH);
  if (sp && sp.d < 1800) drawFacadeSign(r, sp, look.sign, look.accent, look.h);

  // The station clock lives on the façade of the two terminal halls.
  if (st.terminal && sp) {
    const k = sp.k;
    const cx = sp.x;
    const cy = sp.y - 1.25 * look.h * k * 0.55;
    const rad = Math.max(4, 1.05 * k);
    if (k > 2.2) {
      c.fillStyle = '#f4f0e5';
      c.beginPath();
      c.arc(cx, cy, rad, 0, TAU);
      c.fill();
      c.strokeStyle = '#34322e';
      c.lineWidth = Math.max(1, k * 0.07);
      c.stroke();
      const total = 9 * 3600 + 2 * 60 + r.time;
      const minA = ((total / 60) % 60) / 60 * TAU - Math.PI / 2;
      c.strokeStyle = '#24221f';
      c.lineWidth = Math.max(1, k * 0.08);
      c.beginPath();
      c.moveTo(cx, cy);
      c.lineTo(cx + Math.cos(minA) * rad * 0.7, cy + Math.sin(minA) * rad * 0.7);
      c.stroke();
    }
  }

  // Entrance canopy, drawn as a deep awning along the platform wall.
  const a0 = r.project(bS - look.w * 0.33, wallLat, 3.45);
  const a1 = r.project(bS + look.w * 0.33, wallLat, 3.45);
  const b0 = r.project(bS - look.w * 0.33, wallLat - side * 2.6, 3.25);
  const b1 = r.project(bS + look.w * 0.33, wallLat - side * 2.6, 3.25);
  if (a0 && a1 && b0 && b1) {
    polyFill(c, [a0, a1, b1, b0], look.flat ? '#444b4c' : '#6f4b3d');
    polyStroke(c, [b0, b1], look.accent, Math.max(1.5, base.k * 0.09));
  }

  // Zürich's office wing and Bern's clock tower silhouette.
  if (st.id === 'zurich') {
    drawBuilding(r, {
      s: bS + 58, lat: side * 35, w: 28, d: 20, h: 25, v: 2,
      oldtown: false, type: 'cityblock', seed: 0.71,
    }, r.project(bS + 58, side * 35, 0), 0.94);
  }
  if (st.id === 'bern') {
    const tp = r.project(bS - look.w * 0.46, side * look.lat, 0);
    if (tp && tp.k > 0.7) {
      const tw = 5.4 * tp.k;
      const th = 25 * tp.k;
      c.fillStyle = '#b89470';
      c.fillRect(tp.x - tw / 2, tp.y - th, tw, th);
      c.fillStyle = '#a5825f';
      c.fillRect(tp.x, tp.y - th, tw / 2, th);
      c.fillStyle = '#5a4034';
      c.beginPath();
      c.moveTo(tp.x - tw * 0.64, tp.y - th);
      c.lineTo(tp.x, tp.y - th - 3.2 * tp.k);
      c.lineTo(tp.x + tw * 0.64, tp.y - th);
      c.closePath();
      c.fill();
    }
  }
}

function drawFacadeSign(r, p, text, accent, stationH) {
  const c = r.ctx;
  const k = p.k;
  if (k < 1.1) return;
  const fs = clamp(1.05 * k, 7, 46);
  c.save();
  c.font = `700 ${fs}px "Instrument Sans", sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const tw = c.measureText(text).width;
  const pad = fs * 0.52;
  const w = tw + pad * 2 + fs * 0.7;
  const hh = fs * 1.55;
  const x = p.x - w / 2;
  const y = p.y - hh / 2;
  c.fillStyle = '#124f89';
  c.fillRect(x, y, w, hh);
  c.fillStyle = accent;
  c.fillRect(x, y, fs * 0.3, hh);
  c.strokeStyle = 'rgba(255,255,255,0.65)';
  c.lineWidth = Math.max(0.8, fs * 0.045);
  c.strokeRect(x, y, w, hh);
  c.fillStyle = '#f7f5ee';
  c.fillText(text, p.x + fs * 0.24, p.y + fs * 0.03);
  if (fs > 12) {
    c.font = `500 ${fs * 0.28}px "IBM Plex Mono", monospace`;
    c.fillStyle = 'rgba(255,255,255,0.78)';
    c.fillText('SBB CFF FFS', p.x + fs * 0.24, y + hh + fs * 0.42);
  }
  c.restore();
  void stationH;
}

/** Glazed barrel-vault train shed (Zürich HB) or the darker Bern hall. */
function drawTrainShed(r, st, look) {
  const c = r.ctx;
  const s0 = Math.max(st.platformStart - 20, st.stopS - 330);
  const s1 = Math.min(st.platformEnd + 26, st.stopS + 118);
  if (s1 < r.camS + 2 || s0 > r.camS + 2600) return;
  const glass = look.shed === 'glass';
  const half = 13.6;
  const eave = 6.15;
  const rise = glass ? 2.75 : 2.15;
  const start = Math.max(s0, r.camS + 4);
  const span = Math.max(1, s1 - start);
  const slices = Math.max(2, Math.ceil(span / 13));
  const arcN = 12;

  // Transparent roof panels, far to near so nearer strips sit on top.
  for (let i = slices - 1; i >= 0; i--) {
    const sa = start + (span * i) / slices;
    const sb = start + (span * (i + 1)) / slices;
    for (let j = 0; j < arcN; j++) {
      const u0 = -1 + (2 * j) / arcN;
      const u1 = -1 + (2 * (j + 1)) / arcN;
      const lat0 = u0 * half;
      const lat1 = u1 * half;
      const h0 = eave + rise * Math.cos((u0 * Math.PI) / 2);
      const h1 = eave + rise * Math.cos((u1 * Math.PI) / 2);
      const a = r.project(sa, lat0, h0);
      const b = r.project(sb, lat0, h0);
      const c1 = r.project(sb, lat1, h1);
      const d = r.project(sa, lat1, h1);
      if (!a || !b || !c1 || !d) continue;
      const top = (u0 + u1) / 2;
      const tint = glass
        ? `rgba(${150 + top * 18},${190 + top * 12},${203 + top * 9},0.30)`
        : `rgba(${132 + top * 14},${138 + top * 12},${136 + top * 10},0.46)`;
      polyFill(c, [a, b, c1, d], tint);
      if (glass && top > 0.1) {
        c.save();
        c.globalAlpha = 0.15;
        polyFill(c, [a, b, c1, d], '#eaf5f6');
        c.restore();
      }
    }
  }

  // Longitudinal purlins and the arched transverse ribs.
  for (const u of [-0.72, -0.36, 0, 0.36, 0.72]) {
    const h = eave + rise * Math.cos((u * Math.PI) / 2);
    const pts = [];
    for (let s = start; s <= s1; s += 18) {
      const p = r.project(s, u * half, h);
      if (p) pts.push(p);
    }
    if (pts.length > 1) polyStroke(c, pts, glass ? 'rgba(202,220,224,0.42)' : 'rgba(120,124,120,0.55)', 1.1);
  }

  const ribStep = glass ? 17 : 15;
  for (let s = Math.ceil(start / ribStep) * ribStep; s < s1; s += ribStep) {
    const pts = [];
    for (let j = 0; j <= 16; j++) {
      const u = -1 + (2 * j) / 16;
      const p = r.project(s, u * half, eave + rise * Math.cos((u * Math.PI) / 2));
      if (p) pts.push(p);
    }
    if (pts.length > 2) {
      polyStroke(c, pts, glass ? '#8d9b9e' : '#6e6a61', glass ? 1.5 : 2.2);
      // arch shoes / columns at the eaves
      for (const sideLat of [-half + 0.5, half - 0.5]) {
        const a = r.project(s, sideLat, 0.55);
        const b = r.project(s, sideLat, eave);
        if (a && b && a.d < 600) {
          c.strokeStyle = glass ? '#798688' : '#625e55';
          c.lineWidth = Math.max(1.2, a.k * 0.16);
          c.beginPath();
          c.moveTo(a.x, a.y);
          c.lineTo(b.x, b.y);
          c.stroke();
        }
      }
    }
    // hanging platform lights down the centre line
    if (s % (ribStep * 2) === 0) {
      const lp = r.project(s, 0, eave + rise - 0.4);
      if (lp && lp.d < 250) {
        const rad = Math.max(5, lp.k * 1.4);
        const g = c.createRadialGradient(lp.x, lp.y, 0, lp.x, lp.y, rad * 3);
        g.addColorStop(0, 'rgba(255,243,205,0.7)');
        g.addColorStop(1, 'rgba(255,243,205,0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(lp.x, lp.y, rad * 3, 0, TAU);
        c.fill();
      }
    }
  }

  // Solid end wall of the hall gives the shed a believable depth.
  if (start < r.camS + 80) {
    const wallPts = [];
    for (let j = 0; j <= 16; j++) {
      const u = -1 + (2 * j) / 16;
      wallPts.push(r.project(start, u * half, eave + rise * Math.cos((u * Math.PI) / 2)));
    }
    const lb = r.project(start, -half, 0);
    const rb = r.project(start, half, 0);
    if (lb && rb && wallPts.every(Boolean)) {
      polyFill(c, [lb, rb, ...wallPts.slice().reverse()], glass ? 'rgba(38,48,50,0.42)' : 'rgba(50,45,38,0.55)');
    }
  }
}

function drawPlatformCanopy(r, st, side) {
  const c = r.ctx;
  const ps = st.platformStart;
  const pe = st.platformEnd;
  const datum = Math.min(side * 3.15, side * 10.4);
  const far = Math.max(side * 3.15, side * 10.4);
  const look = STATION_LOOK[st.id] || STATION_LOOK.default;
  const cs0 = Math.max(ps, st.stopS - 255);
  const cs1 = Math.min(pe, st.stopS + 98);
  if (cs1 < r.camS + 2 || cs0 > r.camS + 2200) return;
  // Start a little ahead: a canopy section directly above the cab would
  // otherwise smear across the whole windscreen as one enormous polygon.
  const canopyStart = Math.max(cs0, r.camS + 32);
  if (canopyStart >= cs1) return;
  const roof = [];
  const roof2 = [];
  for (let s = canopyStart; s <= cs1; s += 10) {
    const a = r.project(s, side * 3.0, 4.95);
    const b = r.project(s, side * 11.3, 4.95);
    if (a && b) { roof.push(a); roof2.push(b); }
  }
  if (roof.length > 1) {
    const roofColor = st.id === 'baden' ? '#c9d0d2' : st.id === 'aarau' ? '#8b7a67' : '#4f5758';
    polyFill(c, [...roof, ...roof2.slice().reverse()], roofColor);
    // Give the canopy a real fascia: a narrow vertical face along the track
    // edge instead of a single bright line floating above the platform.
    const fTop = [];
    const fBot = [];
    for (let s = canopyStart; s <= cs1; s += 10) {
      const a = r.project(s, side * 2.98, 4.95);
      const b = r.project(s, side * 2.98, 4.5);
      if (a && b) { fTop.push(a); fBot.push(b); }
    }
    if (fTop.length > 1) {
      polyFill(c, [...fTop, ...fBot.slice().reverse()], '#8c2528');
      polyStroke(c, fTop, 'rgba(196,74,74,0.7)', 2);
    }
    c.save();
    c.globalAlpha = 0.16;
    platformSurface(r, cs0, cs1, datum, far, 0.58, '#1b2222');
    c.restore();
    for (let s = Math.max(cs0 + 10, r.camS + 12); s < cs1; s += 22) {
      const p = r.project(s, side * 7.3, 4.7);
      if (p && p.d < 340) {
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(4, p.k * 1.5));
        g.addColorStop(0, 'rgba(255,238,190,0.65)');
        g.addColorStop(1, 'rgba(255,238,190,0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(p.x, p.y, Math.max(4, p.k * 1.5), 0, TAU);
        c.fill();
      }
    }
  }
  for (let s = Math.max(cs0 + 8, r.camS + 2); s < cs1; s += 26) {
    const a = r.project(s, side * 10.7, 0.55);
    const b = r.project(s, side * 10.7, 4.9);
    if (a && b && a.d < 700) {
      c.strokeStyle = '#596163';
      c.lineWidth = Math.max(1.2, a.k * 0.17);
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    }
  }
}

/** Glazed passenger footbridge crossing all platforms. */
function drawFootbridge(r, st, offset, look) {
  const s = st.stopS + offset;
  if (s < r.camS + 4 || s > r.camS + 1900) return;
  const c = r.ctx;
  const lat0 = -14.6;
  const lat1 = 14.6;
  const lo = 5.55;
  const hi = 6.5;
  const top = 8.05;
  const A = r.project(s, lat0, lo);
  const B = r.project(s, lat1, lo);
  const C = r.project(s, lat1, hi);
  const D = r.project(s, lat0, hi);
  const E = r.project(s, lat0, top);
  const F = r.project(s, lat1, top);
  if (!A || !B || !C || !D || !E || !F) return;

  // deck fascia and glass wall
  fillQuad(c, A, B, C, D, '#59605f');
  fillQuad(c, D, C, F, E, 'rgba(174,205,213,0.34)');
  c.strokeStyle = 'rgba(238,244,242,0.6)';
  c.lineWidth = Math.max(0.8, A.k * 0.055);
  c.beginPath();
  c.moveTo(D.x, D.y);
  c.lineTo(C.x, C.y);
  c.moveTo(E.x, E.y);
  c.lineTo(F.x, F.y);
  c.stroke();
  // mullions
  const n = 16;
  for (let i = 1; i < n; i++) {
    const lat = lat0 + ((lat1 - lat0) * i) / n;
    const p0 = r.project(s, lat, hi);
    const p1 = r.project(s, lat, top);
    if (p0 && p1) {
      c.strokeStyle = 'rgba(218,226,226,0.55)';
      c.lineWidth = Math.max(0.6, p0.k * 0.035);
      c.beginPath();
      c.moveTo(p0.x, p0.y);
      c.lineTo(p1.x, p1.y);
      c.stroke();
    }
  }
  // lit strip under the deck edge
  c.strokeStyle = 'rgba(255,240,200,0.55)';
  c.lineWidth = Math.max(1, A.k * 0.06);
  c.beginPath();
  c.moveTo(A.x, A.y);
  c.lineTo(B.x, B.y);
  c.stroke();

  // support columns beyond each platform
  for (const lat of [lat0 + 0.8, lat1 - 0.8]) {
    const p0 = r.project(s, lat, 0.55);
    const p1 = r.project(s, lat, lo);
    if (p0 && p1) {
      c.strokeStyle = '#767c79';
      c.lineWidth = Math.max(1.5, p0.k * 0.19);
      c.beginPath();
      c.moveTo(p0.x, p0.y);
      c.lineTo(p1.x, p1.y);
      c.stroke();
    }
  }
  // small blue SBB plaque
  const sp = r.project(s, -2.6, 7.15);
  if (sp && sp.d < 420) {
    const k = sp.k;
    c.fillStyle = '#164f8a';
    c.fillRect(sp.x - 1.35 * k, sp.y - 0.42 * k, 2.7 * k, 0.84 * k);
    c.fillStyle = '#f7f5ee';
    c.font = `600 ${Math.max(5, 0.34 * k)}px "Instrument Sans", sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('SBB CFF FFS', sp.x, sp.y);
  }
  // Bern's bridge is a little warmer, matching the hall.
  if (st.id === 'bern') {
    c.strokeStyle = 'rgba(140,100,72,0.5)';
    c.lineWidth = Math.max(1, A.k * 0.05);
    c.beginPath();
    c.moveTo(A.x, A.y);
    c.lineTo(B.x, B.y);
    c.stroke();
  }
  void look;
}

export function drawStation(r, st, timeSeconds, t, otherType) {
  const c = r.ctx;
  const dStation = st.stopS - r.camS;
  if (st.platformEnd < r.camS + 2 || st.platformStart > r.camS + 2600) return;
  const ps = st.platformStart;
  const pe = st.platformEnd;
  const side = st.platformSide;
  const l0 = side * 3.15;
  const l1 = side * 10.4;
  const datum = Math.min(l0, l1);
  const far = Math.max(l0, l1);

  // platform body
  platformSurface(r, ps, pe, datum, far, 0.55, '#b9b6ad');
  const edge = [];
  const topEdge = [];
  for (let s = Math.max(ps, r.camS + 2); s <= pe; s += 9) {
    const a = r.project(s, l0, 0);
    const b = r.project(s, l0, 0.55);
    if (a && b) { edge.push(a); topEdge.push(b); }
  }
  if (edge.length > 1) {
    polyFill(c, [...edge, ...topEdge.reverse()], '#8c8a82');
    c.strokeStyle = 'rgba(250,247,238,0.85)';
    c.lineWidth = 2;
    const top = edge.map((p, i) => r.project(Math.max(ps, r.camS + 2) + i * 9, l0, 0.57)).filter(Boolean);
    if (top.length > 1) polyStroke(c, top, 'rgba(252,249,240,0.8)', Math.max(1, r.focal / 900));
  }
  platformSurface(r, ps, pe, l0 + side * 0.02, l0 + side * 0.38, 0.575, '#d8b95c');
  drawPaving(r, ps, pe, l0 + side * 0.45, far);

  // Opposite island platform. Walking distance is compressed, but the second
  // track between the two platforms is what makes the station read correctly.
  const ol0 = -side * 6.6;
  const ol1 = -side * 12.6;
  platformSurface(r, ps, pe, Math.min(ol0, ol1), Math.max(ol0, ol1), 0.55, '#a9a79f');
  platformSurface(r, ps, pe, ol0 - side * 0.4, ol0 - side * 0.02, 0.575, '#d8b95c');
  drawPaving(r, ps, pe, Math.min(ol0, ol1), Math.max(ol0, ol1));
  drawSiding(r, ps, pe, -side * 4.55);

  // The other double-decker set rests in the neighbouring platform at the terminals.
  if (st.id === 'zurich') {
    drawTrainSide(r, { s0: 235, s1: 320, lat: -side * 4.55, type: otherType, alpha: 1, t });
  } else if (st.id === 'bern') {
    drawTrainSide(r, { s0: 20042, s1: 20192, lat: -side * 4.55, type: otherType, alpha: 1, t });
  }

  // Station building, hall, footbridge and platform roof.
  drawStationBuilding(r, st, side, dStation);
  const look = STATION_LOOK[st.id] || STATION_LOOK.default;
  if (look.shed) drawTrainShed(r, st, look);
  else drawPlatformCanopy(r, st, side);
  if (look.bridge) drawFootbridge(r, st, look.bridgeOffset || 0, look);

  // name boards
  for (const ds of [-145, 58]) {
    const ss = st.stopS + ds;
    if (ss < ps || ss > pe) continue;
    drawNameBoard(r, ss, side * 6.0, 3.15, st.name);
  }

  // station clock
  drawStationClock(r, st.stopS + 30, side * 6.3, 3.55, timeSeconds);

  // stop marker
  if (Math.abs(st.stopS - r.camS) < 460) {
    drawStopMarker(r, st.stopS, side * 3.55);
    // painted stop line
    const a = r.project(st.stopS, l0 + side * 0.2, 0.58);
    const b = r.project(st.stopS + 0.7, l0 + side * 0.2, 0.58);
    const c1 = r.project(st.stopS + 0.7, l0 + side * 2.2, 0.58);
    const d1 = r.project(st.stopS, l0 + side * 2.2, 0.58);
    if (a && b && c1 && d1) polyFill(c, [a, b, c1, d1], 'rgba(247,244,235,0.75)');
  }

  // passengers
  for (const person of peopleFor(st)) {
    const p = r.project(person.s, side * person.lat, 0);
    if (!p || p.d > 150 || p.d < 1) continue;
    drawPerson(r, p, person, timeSeconds);
  }

  // benches
  for (const bs of [st.stopS - 70, st.stopS + 26]) {
    const p = r.project(bs, side * 9.1, 0);
    if (!p || p.d > 180) continue;
    c.save();
    c.globalAlpha = 1;
    c.fillStyle = '#6f5842';
    c.fillRect(p.x - 1.2 * p.k, p.y - 7 * p.k, 2.4 * p.k, 0.35 * p.k);
    c.fillStyle = '#4f4c47';
    c.fillRect(p.x - 1.1 * p.k, p.y - 7 * p.k, 0.2 * p.k, 7 * p.k);
    c.fillRect(p.x + 0.9 * p.k, p.y - 7 * p.k, 0.2 * p.k, 7 * p.k);
    c.restore();
  }

  // Platform number, glass windbreak and a litter bin: small things that make
  // the platform feel used rather than drawn.
  const pIdx = STATIONS.indexOf(st);
  drawPlatformNumber(r, st.stopS - 196, side * 8.2, 2.85, st.id === 'zurich' ? '32' : st.id === 'bern' ? '5' : String(pIdx + 1));
  for (const ds of [-48, 44]) {
    const w0 = r.project(st.stopS + ds, side * 9.95, 0.55);
    const w1 = r.project(st.stopS + ds + 8, side * 9.95, 0.55);
    const w2 = r.project(st.stopS + ds + 8, side * 9.95, 2.35);
    const w3 = r.project(st.stopS + ds, side * 9.95, 2.35);
    if (w0 && w1 && w2 && w3 && w0.d < 240) {
      polyFill(c, [w0, w1, w2, w3], 'rgba(185,210,216,0.24)');
      polyStroke(c, [w0, w1, w2, w3], 'rgba(224,236,238,0.5)', Math.max(0.7, w0.k * 0.035));
    }
  }
  const bin = r.project(st.stopS + 76, side * 9.8, 0);
  if (bin && bin.d < 120) {
    const k = bin.k;
    c.fillStyle = '#3c4a45';
    c.fillRect(bin.x - 0.28 * k, bin.y - 0.95 * k, 0.56 * k, 0.95 * k);
    c.fillStyle = '#21302b';
    c.fillRect(bin.x - 0.34 * k, bin.y - 1.04 * k, 0.68 * k, 0.16 * k);
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.fillRect(bin.x - 0.18 * k, bin.y - 0.82 * k, 0.16 * k, 0.55 * k);
  }

  // departure board under the canopy
  if (dStation < 130 && dStation > -200) {
    const next = STATIONS[STATIONS.indexOf(st) + 1];
    const label = next ? `${clockText(st.dep ?? 0, 9, 2).slice(0, 5)}  ${next.name}` : 'BERN';
    drawDepartureBoard(r, st.stopS + 44, side * 9.6, 3.35, label);
  }
}

function drawNameBoard(r, s, lat, h, name) {
  const c = r.ctx;
  const p = r.project(s, lat, h);
  if (!p || p.d > 700) return;
  const k = p.k;
  if (k < 0.9) return;
  const w = 5.2 * k;
  const hh = 1.08 * k;
  const x = p.x - w / 2;
  const y = p.y - hh / 2;
  // posts
  const a = r.project(s, lat, 0.55);
  if (a) {
    c.strokeStyle = '#7c8385';
    c.lineWidth = Math.max(0.8, k * 0.08);
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(p.x - w * 0.32, y + hh);
    c.moveTo(a.x, a.y);
    c.lineTo(p.x + w * 0.32, y + hh);
    c.stroke();
  }
  c.fillStyle = '#164f8a';
  c.fillRect(x, y, w, hh);
  c.strokeStyle = 'rgba(255,255,255,0.55)';
  c.lineWidth = Math.max(0.6, k * 0.04);
  c.strokeRect(x, y, w, hh);
  c.fillStyle = '#f8f7f2';
  c.font = `600 ${Math.max(8, 0.62 * k)}px "Instrument Sans", sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(name, p.x, p.y + 0.02 * k);
  if (k > 5) {
    c.font = `500 ${Math.max(5, 0.22 * k)}px "IBM Plex Mono", monospace`;
    c.fillStyle = 'rgba(255,255,255,0.62)';
    c.fillText('SBB CFF FFS', p.x, y + hh + 0.22 * k);
  }
}

function drawPlatformNumber(r, s, lat, h, number) {
  const c = r.ctx;
  const p = r.project(s, lat, h);
  if (!p || p.d > 520) return;
  const k = p.k;
  if (k < 0.9) return;
  const base = r.project(s, lat, 0.55);
  if (base) {
    c.strokeStyle = '#7c8385';
    c.lineWidth = Math.max(0.8, k * 0.08);
    c.beginPath();
    c.moveTo(base.x, base.y);
    c.lineTo(p.x - 0.5 * k, p.y + 0.55 * k);
    c.moveTo(base.x, base.y);
    c.lineTo(p.x + 0.5 * k, p.y + 0.55 * k);
    c.stroke();
  }
  const w = 1.18 * k;
  const hh = 0.88 * k;
  c.fillStyle = '#164f8a';
  roundedRect(c, p.x - w / 2, p.y - hh / 2, w, hh, Math.max(1, k * 0.05));
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.6)';
  c.lineWidth = Math.max(0.6, k * 0.04);
  c.strokeRect(p.x - w / 2, p.y - hh / 2, w, hh);
  c.fillStyle = '#f8f7f2';
  c.font = `700 ${Math.max(7, 0.52 * k)}px "Instrument Sans", sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(number, p.x, p.y + 0.02 * k);
}

function drawStationClock(r, s, lat, h, timeSeconds) {
  const c = r.ctx;
  const p = r.project(s, lat, h);
  if (!p || p.d > 220) return;
  const k = p.k;
  const base = r.project(s, lat, 0.55);
  if (base) {
    c.strokeStyle = '#7c8385';
    c.lineWidth = Math.max(0.8, k * 0.08);
    c.beginPath();
    c.moveTo(base.x, base.y);
    c.lineTo(p.x, p.y + 0.5 * k);
    c.stroke();
  }
  const rad = 0.5 * k;
  c.fillStyle = '#f4f0e5';
  c.beginPath();
  c.arc(p.x, p.y, rad, 0, TAU);
  c.fill();
  c.strokeStyle = '#34322e';
  c.lineWidth = Math.max(0.8, k * 0.06);
  c.stroke();
  // ticks
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU - Math.PI / 2;
    c.beginPath();
    c.moveTo(p.x + Math.cos(a) * rad * 0.72, p.y + Math.sin(a) * rad * 0.72);
    c.lineTo(p.x + Math.cos(a) * rad * 0.88, p.y + Math.sin(a) * rad * 0.88);
    c.strokeStyle = '#57534b';
    c.lineWidth = Math.max(0.5, k * 0.03);
    c.stroke();
  }
  const total = 9 * 3600 + 2 * 60 + timeSeconds;
  const hourA = ((total / 3600) % 12) / 12 * TAU - Math.PI / 2;
  const minA = ((total / 60) % 60) / 60 * TAU - Math.PI / 2;
  const secA = (total % 60) / 60 * TAU - Math.PI / 2;
  c.strokeStyle = '#24221f';
  c.lineWidth = Math.max(1, k * 0.07);
  c.beginPath();
  c.moveTo(p.x, p.y);
  c.lineTo(p.x + Math.cos(hourA) * rad * 0.5, p.y + Math.sin(hourA) * rad * 0.5);
  c.moveTo(p.x, p.y);
  c.lineTo(p.x + Math.cos(minA) * rad * 0.72, p.y + Math.sin(minA) * rad * 0.72);
  c.stroke();
  c.strokeStyle = '#c23b32';
  c.lineWidth = Math.max(0.5, k * 0.025);
  c.beginPath();
  c.moveTo(p.x, p.y);
  c.lineTo(p.x + Math.cos(secA) * rad * 0.76, p.y + Math.sin(secA) * rad * 0.76);
  c.stroke();
}

function drawStopMarker(r, s, lat) {
  const c = r.ctx;
  const p = r.project(s, lat, 2.35);
  const base = r.project(s, lat, 0.55);
  if (!p || !base) return;
  const k = Math.min(p.k, 76);
  c.strokeStyle = '#7c8385';
  c.lineWidth = Math.max(1, k * 0.09);
  c.beginPath();
  c.moveTo(base.x, base.y);
  c.lineTo(p.x, p.y + 0.55 * k);
  c.stroke();
  const w = 0.78 * k;
  const hh = 0.78 * k;
  c.fillStyle = '#1d201e';
  c.fillRect(p.x - w / 2, p.y - hh / 2, w, hh);
  c.strokeStyle = '#c8c4b5';
  c.lineWidth = Math.max(0.6, k * 0.035);
  c.strokeRect(p.x - w / 2, p.y - hh / 2, w, hh);
  c.fillStyle = '#f6f3e9';
  c.font = `700 ${Math.max(6, 0.5 * k)}px "Instrument Sans", sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('S', p.x, p.y + 0.02 * k);
  const g = c.createRadialGradient(p.x, p.y - hh * 0.72, 0, p.x, p.y - hh * 0.72, Math.max(5, k * 0.8));
  g.addColorStop(0, 'rgba(255,196,86,0.75)');
  g.addColorStop(1, 'rgba(255,196,86,0)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(p.x, p.y - hh * 0.72, Math.max(5, k * 0.8), 0, TAU);
  c.fill();
}

function drawDepartureBoard(r, s, lat, h, label) {
  const c = r.ctx;
  const p = r.project(s, lat, h);
  if (!p) return;
  const k = p.k;
  const w = 3.4 * k;
  const hh = 1.05 * k;
  c.fillStyle = '#15191b';
  roundedRect(c, p.x - w / 2, p.y - hh / 2, w, hh, Math.max(1, k * 0.05));
  c.fill();
  c.fillStyle = '#f0a23a';
  c.font = `500 ${Math.max(6, 0.26 * k)}px "IBM Plex Mono", monospace`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(label, p.x, p.y);
}

function drawPerson(r, p, person, timeSeconds) {
  const c = r.ctx;
  const k = p.k;
  const h = person.h * k;
  const sway = Math.sin(timeSeconds * 0.7 + person.phase) * 0.03;
  c.save();
  c.translate(p.x, p.y);
  // shadow
  c.fillStyle = 'rgba(30,35,32,0.18)';
  c.beginPath();
  c.ellipse(0, 0, 0.28 * k, 0.07 * k, 0, 0, TAU);
  c.fill();
  c.translate(sway * k, 0);
  c.fillStyle = person.coat;
  // legs
  c.fillStyle = '#2f3237';
  c.fillRect(-0.16 * k, -0.72 * k, 0.13 * k, 0.72 * k);
  c.fillRect(0.04 * k, -0.72 * k, 0.13 * k, 0.72 * k);
  // coat
  c.fillStyle = person.coat;
  roundedRect(c, -0.27 * k, -1.34 * k, 0.54 * k, 0.72 * k, 0.13 * k);
  c.fill();
  // head
  c.fillStyle = '#d8b48d';
  c.beginPath();
  c.arc(0, -1.5 * k, 0.15 * k, 0, TAU);
  c.fill();
  c.fillStyle = '#3a3129';
  c.beginPath();
  c.arc(0, -1.55 * k, 0.16 * k, Math.PI, TAU);
  c.fill();
  if (person.bag) {
    c.fillStyle = '#5b3b2c';
    c.fillRect(0.3 * k, -0.65 * k, 0.28 * k, 0.42 * k);
    c.fillStyle = '#2b2926';
    c.fillRect(0.42 * k, -0.7 * k, 0.04 * k, 0.1 * k);
  }
  c.restore();
}

// ---------------------------------------------------------------------------
// Signals, speed boards, catenary, tunnel
// ---------------------------------------------------------------------------

export function drawSignal(r, sig, t) {
  const c = r.ctx;
  const lat = 4.15;
  const base = r.project(sig.s, lat, 0);
  const top = r.project(sig.s, lat, 6.7);
  if (!base || !top) return;
  const k = base.k;
  if (base.d > 1800) return;
  c.strokeStyle = '#3f4744';
  c.lineWidth = Math.max(1, k * 0.15);
  c.beginPath();
  c.moveTo(base.x, base.y);
  c.lineTo(top.x, top.y);
  c.stroke();
  const head = r.project(sig.s, lat, 6.1);
  if (!head) return;
  const hw = Math.max(2, 0.72 * k);
  const hh = Math.max(5, 1.9 * k);
  c.fillStyle = '#161a19';
  roundedRect(c, head.x - hw / 2, head.y - hh / 2, hw, hh, Math.max(1, hw * 0.25));
  c.fill();
  const colors = { red: '#ff4a3d', amber: '#ffb43e', green: '#41e08b' };
  const order = ['red', 'amber', 'green'];
  order.forEach((state, i) => {
    const yy = head.y - hh * 0.28 + i * hh * 0.28;
    const active = sig.state === state;
    c.beginPath();
    c.arc(head.x, yy, Math.max(1.4, hw * 0.28), 0, TAU);
    c.fillStyle = active ? colors[state] : 'rgba(35,42,40,0.9)';
    c.fill();
    if (active) {
      const g = c.createRadialGradient(head.x, yy, 0, head.x, yy, Math.max(5, hw * 2.4));
      g.addColorStop(0, state === 'red' ? 'rgba(255,74,61,0.65)' : state === 'amber' ? 'rgba(255,180,62,0.55)' : 'rgba(65,224,139,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(head.x, yy, Math.max(5, hw * 2.4), 0, TAU);
      c.fill();
    }
  });
  if (k > 2) {
    c.fillStyle = '#e8e4d8';
    c.font = `500 ${Math.max(6, 0.24 * k)}px "IBM Plex Mono", monospace`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(sig.id), head.x, head.y + 1.15 * k);
  }
}

export function drawSpeedBoard(r, change) {
  const c = r.ctx;
  const lat = 4.5;
  const base = r.project(change.s, lat, 0.6);
  const p = r.project(change.s, lat, 3.0);
  if (!base || !p) return;
  const k = p.k;
  if (k < 0.55) return;
  c.strokeStyle = '#6b716d';
  c.lineWidth = Math.max(0.8, k * 0.06);
  c.beginPath();
  c.moveTo(base.x, base.y + 0.55 * k);
  c.lineTo(p.x, p.y + 0.62 * k);
  c.stroke();
  const rad = 0.52 * k;
  c.beginPath();
  c.arc(p.x, p.y, rad, 0, TAU);
  c.fillStyle = '#f6f3e9';
  c.fill();
  c.strokeStyle = '#c5312c';
  c.lineWidth = Math.max(1.2, k * 0.11);
  c.stroke();
  c.fillStyle = '#22201e';
  c.font = `700 ${Math.max(7, 0.43 * k)}px "Instrument Sans", sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(String(change.v), p.x, p.y + 0.02 * k);
}

export function drawCatenary(r, t) {
  const c = r.ctx;
  const start = Math.floor((r.camS + 2) / 55) * 55;
  const end = Math.min(ROUTE_LENGTH - 60, r.camS + 1100);
  c.save();
  for (let s = start; s <= end; s += 55) {
    for (const side of [-1, 1]) {
      const lat = side * 4.75;
      const base = r.project(s, lat, 0);
      const top = r.project(s, lat, 7.35);
      if (!base || !top || base.d > 1000) continue;
      const k = base.k;
      c.strokeStyle = 'rgba(59,68,63,0.92)';
      c.lineWidth = Math.max(0.9, k * 0.13);
      c.beginPath();
      c.moveTo(base.x, base.y);
      c.lineTo(top.x, top.y);
      c.stroke();
      // cantilever arm
      const arm = r.project(s, side * 0.2, 6.55);
      if (arm) {
        c.lineWidth = Math.max(0.7, k * 0.08);
        c.beginPath();
        c.moveTo(top.x, top.y + 0.8 * k);
        c.lineTo(arm.x, arm.y);
        c.stroke();
      }
    }
    // wires
    const nxt = Math.min(s + 55, end);
    for (const wire of [
      { h: 5.45, sag: 0.32, color: 'rgba(25,29,28,0.78)', width: 0.025 },
      { h: 6.3, sag: 0.5, color: 'rgba(25,29,28,0.55)', width: 0.02 },
    ]) {
      const pts = [];
      for (let i = 0; i <= 6; i++) {
        const u = i / 6;
        const ss = lerp(s, nxt, u);
        const y = wire.h - Math.sin(u * Math.PI) * wire.sag;
        const p = r.project(ss, 0, y);
        if (p) pts.push(p);
      }
      if (pts.length > 1) {
        c.strokeStyle = wire.color;
        c.lineWidth = Math.max(0.5, pts[0].k * wire.width + 0.55);
        c.beginPath();
        c.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
        c.stroke();
      }
    }
    // droppers
    for (let i = 1; i < 5; i++) {
      const ss = s + (55 * i) / 5;
      const a = r.project(ss, 0, 6.3 - Math.sin((i / 5) * Math.PI) * 0.5);
      const b = r.project(ss, 0, 5.45 - Math.sin((i / 5) * Math.PI) * 0.32);
      if (a && b && a.k > 0.8) {
        c.strokeStyle = 'rgba(40,46,43,0.45)';
        c.lineWidth = Math.max(0.5, a.k * 0.012 + 0.4);
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.stroke();
      }
    }
  }
  c.restore();
}

export function drawTunnelPortal(r, t) {
  const s = TUNNEL.start;
  if (r.camS > s + 3) return;
  const c = r.ctx;
  const outer = [
    r.project(s, -24, 0), r.project(s, 24, 0),
    r.project(s, 24, 15), r.project(s, -24, 15),
  ];
  if (outer.some((p) => !p)) return;
  if (outer[0].d > 3000) return;
  const innerPts = [];
  const arch = [];
  // sides and arch of the opening
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * Math.PI;
    const lat = Math.cos(a) * 5.5;
    const h = 3.1 + Math.sin(a) * 4.35;
    arch.push(r.project(s, lat, h));
  }
  const left = r.project(s, -5.5, 0);
  const leftTop = r.project(s, -5.5, 3.1);
  const rightTop = r.project(s, 5.5, 3.1);
  const right = r.project(s, 5.5, 0);
  if (!left || !leftTop || !rightTop || !right) return;
  innerPts.push(left, right, rightTop, ...arch, leftTop);

  c.save();
  // dark opening
  c.beginPath();
  c.moveTo(left.x, left.y);
  c.lineTo(right.x, right.y);
  for (const p of arch) c.lineTo(p.x, p.y);
  c.closePath();
  c.fillStyle = '#0b0f10';
  c.fill();

  // concrete face with a hole
  c.beginPath();
  c.moveTo(outer[0].x, outer[0].y);
  for (let i = 1; i < 4; i++) c.lineTo(outer[i].x, outer[i].y);
  c.closePath();
  c.moveTo(left.x, left.y);
  c.lineTo(right.x, right.y);
  for (const p of arch) c.lineTo(p.x, p.y);
  c.lineTo(leftTop.x, leftTop.y);
  c.closePath();
  c.fillStyle = '#6d6a62';
  c.fill('evenodd');

  // rim
  c.strokeStyle = '#8e8a80';
  c.lineWidth = Math.max(1, outer[0].k * 0.25);
  c.beginPath();
  c.moveTo(left.x, left.y);
  c.lineTo(right.x, right.y);
  for (const p of arch) c.lineTo(p.x, p.y);
  c.lineTo(leftTop.x, leftTop.y);
  c.closePath();
  c.stroke();

  // keystone + name
  if (outer[0].k > 1) {
    const key = r.project(s, 0, 7.65);
    if (key) {
      c.fillStyle = '#918d82';
      c.beginPath();
      c.moveTo(key.x - 0.76 * key.k, key.y + 0.6 * key.k);
      c.lineTo(key.x, key.y - 0.5 * key.k);
      c.lineTo(key.x + 0.76 * key.k, key.y + 0.6 * key.k);
      c.lineTo(key.x + 0.55 * key.k, key.y + 1.5 * key.k);
      c.lineTo(key.x - 0.55 * key.k, key.y + 1.5 * key.k);
      c.closePath();
      c.fill();
    }
    const label = r.project(s, 0, 10.8);
    if (label && label.k > 0.8) {
      c.fillStyle = 'rgba(240,236,226,0.72)';
      c.font = `600 ${Math.max(8, 0.9 * label.k)}px "Instrument Sans", sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('AARE', label.x, label.y);
    }
  }
  c.restore();
}

