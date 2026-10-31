import { clamp, smoothstep, lerp, mulberry32 } from './util.js';

// ---------------------------------------------------------------------------
// IR 16 / Mittelland: Zürich HB -> Baden -> Brugg AG -> Aarau -> Olten -> Bern.
// Distances are compressed for playability, but the sequence, curves, station
// approaches and landmarks follow the real corridor.
// ---------------------------------------------------------------------------

export const DS = 2;
export const ROUTE_LENGTH = 21200;

export const STATIONS = [
  {
    id: 'zurich', name: 'Zürich HB', city: 'Zürich', stopS: 200,
    arr: 0, dep: 30, platformSide: 1, platformStart: 0, platformEnd: 310,
    terminal: true, code: 'ZRH',
  },
  {
    id: 'baden', name: 'Baden', city: 'Baden', stopS: 3500,
    arr: 150, dep: 180, platformSide: 1, platformStart: 3230, platformEnd: 3600,
    code: 'BD',
  },
  {
    id: 'brugg', name: 'Brugg AG', city: 'Brugg', stopS: 6500,
    arr: 280, dep: 310, platformSide: 1, platformStart: 6230, platformEnd: 6600,
    code: 'BRG',
  },
  {
    id: 'aarau', name: 'Aarau', city: 'Aarau', stopS: 9500,
    arr: 410, dep: 440, platformSide: 1, platformStart: 9230, platformEnd: 9600,
    code: 'AA',
  },
  {
    id: 'olten', name: 'Olten', city: 'Olten', stopS: 12500,
    arr: 540, dep: 570, platformSide: 1, platformStart: 12230, platformEnd: 12600,
    code: 'OL',
  },
  {
    id: 'bern', name: 'Bern', city: 'Bern', stopS: 20300,
    arr: 780, dep: null, platformSide: 1, platformStart: 20030, platformEnd: 20400,
    terminal: true, code: 'BN',
  },
];

export const TUNNEL = { start: 15300, end: 16700, name: 'Aare' };

export const SIGNALS = [
  700, 2200, 3300, 4300, 5600, 6100, 7300, 8200, 9100, 10600,
  11900, 13300, 14650, 15860, 17220, 18420, 19820,
].map((s, i) => ({ id: i + 1, s, state: 'green' }));

// The one signal which protects a crossing freight path.
SIGNALS[12].state = 'red';
SIGNALS[11].state = 'amber';
export const RED_SIGNAL_INDEX = 12;

const SPEED_LIMITS = [
  { s: 0, v: 40 },
  { s: 260, v: 60 },
  { s: 620, v: 100 },
  { s: 1250, v: 140 },
  { s: 2050, v: 200 },
  { s: 3000, v: 160 },
  { s: 3250, v: 120 },
  { s: 3430, v: 80 },
  { s: 3500, v: 40 },
  { s: 3720, v: 80 },
  { s: 3950, v: 120 },
  { s: 4400, v: 160 },
  { s: 5000, v: 200 },
  { s: 6000, v: 160 },
  { s: 6250, v: 120 },
  { s: 6430, v: 80 },
  { s: 6500, v: 40 },
  { s: 6720, v: 80 },
  { s: 6950, v: 120 },
  { s: 7300, v: 160 },
  { s: 7800, v: 180 },
  { s: 9000, v: 160 },
  { s: 9250, v: 120 },
  { s: 9430, v: 80 },
  { s: 9500, v: 40 },
  { s: 9720, v: 80 },
  { s: 9950, v: 120 },
  { s: 10200, v: 160 },
  { s: 10600, v: 200 },
  { s: 12000, v: 160 },
  { s: 12250, v: 120 },
  { s: 12430, v: 80 },
  { s: 12500, v: 40 },
  { s: 12720, v: 80 },
  { s: 12950, v: 120 },
  { s: 13300, v: 160 },
  { s: 13800, v: 180 },
  { s: 14200, v: 200 },
  { s: 15200, v: 160 },
  { s: 15320, v: 140 },
  { s: 16700, v: 160 },
  { s: 17280, v: 200 },
  { s: 18900, v: 160 },
  { s: 19580, v: 120 },
  { s: 20080, v: 100 },
  { s: 20280, v: 80 },
  { s: 20300, v: 40 },
  { s: 21200, v: 0 },
];

const CURVES = [
  [620, 1580, 1 / 2200],
  [1660, 2480, -1 / 2700],
  [2540, 3380, 1 / 2600],
  [3740, 4520, -1 / 3000],
  [5000, 5880, -1 / 2300],
  [7200, 8120, 1 / 1900],
  [8200, 9060, -1 / 2300],
  [9800, 10760, 1 / 2500],
  [10860, 11840, -1 / 2800],
  [13080, 13920, 1 / 2100],
  [14020, 14820, -1 / 2500],
  [16900, 17760, 1 / 1850],
  [17860, 18700, -1 / 2200],
  [18800, 19520, 1 / 2700],
];

function regionAt(s) {
  if (s < 3100) return 'zurich';
  if (s < 3850) return 'baden';
  if (s < 6150) return 'country';
  if (s < 6850) return 'brugg';
  if (s < 9150) return 'country';
  if (s < 9850) return 'aarau';
  if (s < 12150) return 'country';
  if (s < 12850) return 'olten';
  if (s < TUNNEL.start) return 'country';
  if (s < TUNNEL.end) return 'tunnel';
  if (s < 19600) return 'aare';
  return 'bern';
}
export { regionAt };

function elevationAt(s) {
  return (
    12 * Math.sin(s / 3400 + 0.4) +
    5.5 * Math.sin(s / 980 + 1.2) +
    1.6 * Math.sin(s / 240 + 0.2) +
    (s / ROUTE_LENGTH) * 16
  );
}

function buildRoute() {
  const count = Math.floor(ROUTE_LENGTH / DS) + 1;
  const curvature = new Float32Array(count);
  for (const [a, b, k] of CURVES) {
    const i0 = Math.max(0, Math.floor((a - 220) / DS));
    const i1 = Math.min(count - 1, Math.ceil((b + 220) / DS));
    for (let i = i0; i <= i1; i++) {
      const s = i * DS;
      const ramp = smoothstep(a - 220, a + 30, s) * (1 - smoothstep(b - 30, b + 220, s));
      curvature[i] += k * ramp;
    }
  }
  // Keep station approaches straight and calm.
  for (const st of STATIONS) {
    for (let i = 0; i < count; i++) {
      const s = i * DS;
      const d = Math.abs(s - (st.stopS - 90));
      if (d < 720) curvature[i] *= smoothstep(330, 720, d);
    }
  }

  const route = new Array(count);
  let x = 0;
  let z = 0;
  let heading = 0;
  for (let i = 0; i < count; i++) {
    const s = i * DS;
    route[i] = { s, x, z, elev: elevationAt(s), heading, k: curvature[i] };
    heading += curvature[i] * DS;
    x += Math.sin(heading) * DS;
    z += Math.cos(heading) * DS;
  }
  return route;
}

export const route = buildRoute();

export function sampleRoute(s) {
  const f = clamp(s / DS, 0, route.length - 1);
  const i = Math.floor(f);
  const t = f - i;
  const a = route[i];
  const b = route[Math.min(route.length - 1, i + 1)];
  return {
    s,
    x: lerp(a.x, b.x, t),
    z: lerp(a.z, b.z, t),
    elev: lerp(a.elev, b.elev, t),
    heading: lerp(a.heading, b.heading, t),
    k: lerp(a.k, b.k, t),
  };
}

export function limitAt(s) {
  let v = SPEED_LIMITS[0].v;
  for (const entry of SPEED_LIMITS) {
    if (s >= entry.s) v = entry.v;
    else break;
  }
  return v;
}

export function nextLimitChange(s) {
  for (const entry of SPEED_LIMITS) {
    if (entry.s > s + 4) return { s: entry.s, v: entry.v, distance: entry.s - s };
  }
  return null;
}

export function speedLimitChanges() {
  return SPEED_LIMITS.slice(1);
}

// ---------------------------------------------------------------------------
// Scenery. Deterministic, so the same farm, chapel and castle greet you each
// time. Objects are sorted along the line and culled by the renderer.
// ---------------------------------------------------------------------------

const rand = mulberry32(0x51a55e);
const scenery = [];
const fields = [];
const rivers = [];

function add(type, s, lat, opts = {}) {
  scenery.push({
    type, s, lat,
    w: opts.w || 10,
    d: opts.d || 10,
    h: opts.h || 8,
    v: opts.v || 0,
    size: opts.size || 1,
    oldtown: opts.oldtown || false,
    seed: rand(),
  });
}

function stationZone(s, margin = 26) {
  for (const st of STATIONS) {
    if (s > st.platformStart - margin && s < st.platformEnd + margin) return true;
  }
  return false;
}

function generateScenery() {
  for (let s = 80; s < ROUTE_LENGTH - 80; s += 15) {
    const region = regionAt(s);
    if (region === 'tunnel') continue;
    if (stationZone(s)) continue;

    for (const side of [-1, 1]) {
      const r = rand();
      const lat = side * (9 + rand() * 34);

      if (region === 'zurich') {
        if (r < 0.06) {
          add('cityblock', s, side * (24 + rand() * 40), {
            w: 16 + rand() * 18, d: 12 + rand() * 16, h: 14 + rand() * 26, v: Math.floor(rand() * 4),
          });
        } else if (r < 0.1) {
          add('tree', s, side * (11 + rand() * 24), { h: 7 + rand() * 7, size: 0.8 + rand() * 0.5 });
        } else if (r < 0.12) {
          add('lamp', s, side * 7.4, { h: 7 });
        } else if (r < 0.135) {
          add('flag', s, side * (16 + rand() * 16), { h: 10 });
        }
      } else if (region === 'baden' || region === 'brugg' || region === 'aarau' || region === 'olten') {
        if (r < 0.13) {
          add('cityblock', s, side * (23 + rand() * 30), {
            w: 14 + rand() * 14, d: 10 + rand() * 12, h: 10 + rand() * 15, v: Math.floor(rand() * 5), oldtown: true,
          });
        } else if (r < 0.27) {
          add(rand() < 0.5 ? 'pine' : 'tree', s, side * (10 + rand() * 24), {
            h: 8 + rand() * 9, size: 0.75 + rand() * 0.55,
          });
        } else if (r < 0.3) {
          add('flag', s, side * (15 + rand() * 16), { h: 9 });
        }
      } else if (region === 'country') {
        if (r < 0.34) {
          add(rand() < 0.55 ? 'pine' : 'tree', s, side * (10 + rand() * 32), {
            h: 8 + rand() * 11, size: 0.75 + rand() * 0.7,
          });
        } else if (r < 0.395) {
          add('house', s, side * (24 + rand() * 38), {
            w: 10 + rand() * 8, d: 8 + rand() * 7, h: 5 + rand() * 3, v: Math.floor(rand() * 4),
          });
        } else if (r < 0.415) {
          add('barn', s, side * (26 + rand() * 40), {
            w: 13 + rand() * 9, d: 9 + rand() * 5, h: 6 + rand() * 2, v: Math.floor(rand() * 2),
          });
        } else if (r < 0.44) {
          add('cow', s, side * (14 + rand() * 30), { size: 0.8 + rand() * 0.4 });
        } else if (r < 0.465) {
          add('haybale', s, side * (12 + rand() * 28), { size: 0.8 + rand() * 0.4 });
        } else if (r < 0.485) {
          add('fence', s, side * 6.6, { w: 18 + rand() * 14 });
        } else if (r < 0.495) {
          add('flag', s, side * (16 + rand() * 20), { h: 9 });
        }
      } else if (region === 'aare') {
        if (r < 0.48) {
          add(rand() < 0.66 ? 'pine' : 'tree', s, side * (9 + rand() * 44), {
            h: 9 + rand() * 14, size: 0.8 + rand() * 0.8,
          });
        } else if (r < 0.505) {
          add('house', s, side * (28 + rand() * 42), {
            w: 11 + rand() * 8, d: 9 + rand() * 6, h: 5.5 + rand() * 3, v: Math.floor(rand() * 4),
          });
        } else if (r < 0.52) {
          add('castle', s, side * (68 + rand() * 30), { w: 22, d: 16, h: 15, size: 1.2 });
        } else if (r < 0.54) {
          add('cow', s, side * (15 + rand() * 22), { size: 0.8 + rand() * 0.3 });
        }
      } else if (region === 'bern') {
        if (r < 0.08) {
          add('cityblock', s, side * (22 + rand() * 34), {
            w: 14 + rand() * 16, d: 11 + rand() * 12, h: 13 + rand() * 16, v: Math.floor(rand() * 5), oldtown: true,
          });
        } else if (r < 0.125) {
          add('tree', s, side * (10 + rand() * 18), { h: 7 + rand() * 6, size: 0.8 + rand() * 0.4 });
        } else if (r < 0.145) {
          add('flag', s, side * (14 + rand() * 14), { h: 10 });
        }
      }
    }
  }

  // Signature landmarks you can look out for.
  add('church', 4380, 49, { w: 9, d: 18, h: 12, size: 1.1 });
  add('farm', 3680, -38, { w: 18, d: 12, h: 7, v: 1 });
  add('castle', 6080, 86, { w: 24, d: 17, h: 16, size: 1.15 });
  add('church', 3380, -44, { w: 8, d: 17, h: 11, size: 1 });
  add('cityblock', 3420, 36, { w: 22, d: 14, h: 12, v: 2, oldtown: true });
  add('cityblock', 9400, -38, { w: 24, d: 14, h: 13, v: 1, oldtown: true });
  add('cityblock', 9580, 34, { w: 22, d: 15, h: 14, v: 4, oldtown: true });
  add('windmill', 9820, -92, { h: 22 });
  add('castle', 17120, -74, { w: 26, d: 18, h: 17, size: 1.3 });
  add('church', 18880, 57, { w: 10, d: 19, h: 13, size: 1.15 });
  add('tower', 20190, 30, { w: 9, d: 9, h: 25, v: 1 });
  add('cityblock', 20260, 44, { w: 26, d: 18, h: 18, v: 2, oldtown: true });
  add('cityblock', 20420, 47, { w: 22, d: 16, h: 15, v: 3, oldtown: true });
  add('cityblock', 19960, -42, { w: 24, d: 16, h: 17, v: 1, oldtown: true });
  add('tree', 20520, -18, { h: 12, size: 1.1 });

  scenery.sort((a, b) => a.s - b.s);
}

function generateFields() {
  const palette = ['#88a85e', '#9ab866', '#b5c27a', '#7a9e58', '#c7bb78', '#a4b66c', '#6f9552'];
  for (const side of [-1, 1]) {
    let s = 200;
    let flip = side === -1;
    while (s < ROUTE_LENGTH - 300) {
      const region = regionAt(s);
      if (region === 'tunnel') { s += 300; continue; }
      if (['zurich', 'bern', 'olten', 'baden', 'brugg', 'aarau'].includes(region)) {
        s += 420;
        continue;
      }
      const length = 300 + rand() * 380;
      const l0 = 8 + rand() * 14;
      const l1 = 70 + rand() * 130;
      const color = region === 'aare'
        ? (rand() < 0.5 ? '#5e8451' : '#6f9358')
        : palette[Math.floor(rand() * palette.length)];
      fields.push({ s0: s, s1: s + length, l0, l1, side, color, kind: region, flip });
      flip = !flip;
      if (rand() < 0.55) {
        fields.push({
          s0: s + 70 + rand() * 130, s1: s + length + rand() * 110,
          l0: l1 + 18, l1: l1 + 80 + rand() * 80,
          side, color: palette[Math.floor(rand() * palette.length)], kind: region, flip,
        });
      }
      s += length + 80 + rand() * 160;
    }
  }

  rivers.push({ s0: 18160, s1: 19560, side: -1, l0: 17, l1: 95 });
  rivers.push({ s0: 18320, s1: 19480, side: 1, l0: 105, l1: 205, lake: true });
}

generateScenery();
generateFields();

export { scenery, fields, rivers };
