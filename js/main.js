import { Game } from './game.js';
import { Renderer } from './render.js';
import { AudioEngine } from './audio.js';
import { STATIONS } from './route.js';
import { TRAINS } from './trains.js';
import { clamp, clockText, deltaText, durationText } from './util.js';

const $ = (sel) => document.querySelector(sel);

const canvas = $('#view');
const hud = $('#hud');
const overlay = $('#overlay');
const titleScreen = $('#title-screen');
const pauseScreen = $('#pause-screen');
const resultsScreen = $('#results-screen');
const startBtn = $('#start-btn');
const resumeBtn = $('#resume-btn');
const restartBtn = $('#restart-btn');
const againBtn = $('#again-btn');
const shareBtn = $('#share-btn');
const pauseBtn = $('#pause-btn');
const muteBtn = $('#mute-btn');
const powerBtn = $('#power-btn');
const brakeBtn = $('#brake-btn');
const hornBtn = $('#horn-btn');
const doorsBtn = $('#doors-btn');
const toastsEl = $('#toasts');
const stopsEl = $('#stops');

const el = {
  clock: $('#clock'),
  punctuality: $('#punctuality'),
  speed: $('#speed-value'),
  limit: $('#limit-value'),
  trend: $('#speed-trend'),
  powerBar: $('#power-bar'),
  brakeBar: $('#brake-bar'),
  comfort: $('#comfort-value'),
  safety: $('#safety-value'),
  routeFill: $('#route-fill'),
  routeTrain: $('#route-train'),
  nextName: $('#next-name'),
  nextDistance: $('#next-distance'),
  nextTime: $('#next-time'),
  signalDot: $('#signal-dot'),
  signalText: $('#signal-text'),
  doorState: $('#door-state'),
};

const game = new Game();
const renderer = new Renderer(canvas);
const audio = new AudioEngine();

let selectedTrain = 'ic2000';
let powerPressed = false;
let brakePressed = false;
let lastFrame = performance.now();
let elapsed = 0;
let currentScreen = 'title';
let muted = false;

try {
  muted = localStorage.getItem('ir16-muted') === '1';
} catch { /* private mode */ }
audio.setMuted(muted);
muteBtn.classList.toggle('is-muted', muted);
muteBtn.setAttribute('aria-pressed', String(muted));

// Build the route strip once. The labels are static, the classes are updated
// every frame while the shift is running.
stopsEl.innerHTML = STATIONS.map(
  (st, i) => `<span class="stop" data-i="${i}">${st.name}</span>`,
).join('');
const stopEls = [...stopsEl.querySelectorAll('.stop')];

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function showScreen(name) {
  currentScreen = name;
  titleScreen.classList.toggle('is-hidden', name !== 'title');
  pauseScreen.classList.toggle('is-hidden', name !== 'pause');
  resultsScreen.classList.toggle('is-hidden', name !== 'results');
  overlay.classList.toggle('is-hidden', name === null);
  hud.classList.toggle('is-hidden', name === 'title');
  if (name === 'title') hud.classList.add('is-hidden');
  if (name === null) hud.classList.remove('is-hidden');
}

function startRun() {
  audio.unlock();
  audio.chime(true);
  game.start(selectedTrain);
  showScreen(null);
  handleEvents();
  updateHud(game.status());
  lastFrame = performance.now();
}

function pauseRun() {
  if (game.phase !== 'run') return;
  game.pause();
  const st = game.status();
  $('#pause-detail').textContent =
    `Holding near ${st.target ? st.target.name : 'the line'} · ${clockText(st.time)} · ${Math.round(st.kmh)} km/h.`;
  showScreen('pause');
}

function resumeRun() {
  if (game.phase !== 'paused') return;
  game.resume();
  showScreen(null);
  lastFrame = performance.now();
}

function restartRun() {
  audio.unlock();
  game.start(selectedTrain);
  showScreen(null);
  handleEvents();
  updateHud(game.status());
  lastFrame = performance.now();
}

function showResults() {
  const score = game.score;
  if (!score) return;
  $('#result-grade').textContent = score.grade;
  $('#result-sub').textContent =
    `${score.gradeEn} · ${score.violations ? 'a signal was passed at danger' : 'all signals respected'}.`;
  $('#result-overall').textContent = Math.round(score.overall);
  $('#result-punctuality').textContent = Math.round(score.punctuality);
  $('#result-precision').textContent = Math.round(score.precision);
  $('#result-comfort').textContent = Math.round(score.comfort);
  $('#result-safety').textContent = Math.round(score.safety);
  $('#result-line').textContent =
    `Arrived ${score.arrival} · delay ${deltaText(score.finalDelay)} · ${score.distance.toFixed(1)} km · top ${Math.round(score.topSpeed)} km/h`;
  $('#result-stops').innerHTML = score.stops.map((s) => {
    const p = Math.round(s.precision);
    const cls = p >= 88 ? 'good' : p >= 60 ? 'ok' : 'bad';
    return `<span class="stop-chip ${cls}">${s.station.name} · ${p}%</span>`;
  }).join('') || '<span class="stop-chip bad">No scheduled stops recorded</span>';
  showScreen('results');
}

function copyResult() {
  const score = game.score;
  if (!score) return;
  const text = [
    `IR 16 · Zürich HB → Bern · ${TRAINS[selectedTrain].name}`,
    `Overall ${Math.round(score.overall)}/100 · ${score.grade}`,
    `Punctuality ${Math.round(score.punctuality)} · Precision ${Math.round(score.precision)} · Comfort ${Math.round(score.comfort)} · Safety ${Math.round(score.safety)}`,
    `Arrived ${score.arrival} · delay ${deltaText(score.finalDelay)}`,
  ].join('\n');
  const done = () => toast({ text: 'Result copied to the clipboard.', tone: 'ok' });
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => toast({ text: text, tone: 'info' }));
  } else {
    toast({ text, tone: 'info' });
  }
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

function fmtDistance(m) {
  const abs = Math.abs(m);
  if (abs >= 1000) return `${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)} km`;
  return `${Math.round(abs)} m`;
}

function updateHud(st) {
  el.clock.textContent = st.clock;
  let delay = st.delay || 0;
  if (st.atStation) {
    const dep = st.atStation.dep ?? st.atStation.arr;
    delay = st.time > dep ? st.time - dep : 0;
  }
  const punc = el.punctuality;
  punc.classList.remove('late', 'very-late');
  if (delay > 120) {
    punc.textContent = `+${durationText(delay)} late`;
    punc.classList.add('very-late');
  } else if (delay > 30) {
    punc.textContent = `+${durationText(delay)} late`;
    punc.classList.add('late');
  } else if (delay < -75) {
    punc.textContent = `${durationText(-delay)} early`;
  } else {
    punc.textContent = 'On time';
  }

  el.speed.textContent = Math.round(st.kmh);
  el.limit.textContent = st.limit;
  const over = st.kmh > st.limit + 2;
  el.trend.textContent = over
    ? 'over limit'
    : st.brake > 0.02 ? 'braking'
      : st.power > 0.02 ? 'traction'
        : st.speed > 0.2 ? 'coasting' : st.doorsOpen ? 'doors open' : 'ready';
  el.trend.classList.toggle('over', over);
  el.powerBar.style.width = `${Math.round(clamp(st.power, 0, 1) * 100)}%`;
  el.brakeBar.style.width = `${Math.round(clamp(st.brake, 0, 1) * 100)}%`;
  el.comfort.textContent = Math.round(st.comfort);
  el.safety.textContent = Math.round(st.safety);

  const progress = clamp(st.routeProgress, 0, 1) * 100;
  el.routeFill.style.width = `${progress}%`;
  el.routeTrain.style.left = `${progress}%`;

  const activeIndex = st.atStation
    ? STATIONS.indexOf(st.atStation)
    : STATIONS.findIndex((s) => s.id === st.target?.id);
  stopEls.forEach((node, i) => {
    node.classList.toggle('done', i < activeIndex);
    node.classList.toggle('current', i === activeIndex);
  });

  if (st.target) {
    el.nextName.textContent = st.target.name;
    el.nextTime.textContent = clockText(st.target.arr);
    if (st.atStation && Math.abs(st.stopDistance) < 180) {
      el.nextDistance.textContent = Math.abs(st.stopDistance) < 3 ? 'on the mark' : fmtDistance(st.stopDistance);
    } else {
      el.nextDistance.textContent = fmtDistance(st.stopDistance);
    }
  }

  const sig = st.signal;
  el.signalDot.className = 'signal-dot';
  if (sig) {
    const label = sig.state === 'red' ? 'stop' : sig.state === 'amber' ? 'caution' : 'clear';
    const dist = sig.s - st.headS;
    el.signalText.textContent = dist > 0 && dist < 1200
      ? `Signal ${sig.id} · ${fmtDistance(dist)} · ${label}`
      : `Signal ${sig.id} · ${label}`;
    if (sig.state === 'amber') el.signalDot.classList.add('amber');
    if (sig.state === 'red') el.signalDot.classList.add('red');
  } else {
    el.signalText.textContent = 'Signal · line clear';
  }

  el.doorState.textContent = st.doorsOpen ? 'Doors open' : 'Doors closed';
  el.doorState.classList.toggle('open', st.doorsOpen);
  doorsBtn.classList.toggle('is-on', st.doorsOpen);
  powerBtn.classList.toggle('is-active', st.power > 0.02);
  brakeBtn.classList.toggle('is-active', st.brake > 0.02);
}

// ---------------------------------------------------------------------------
// Toasts & game events
// ---------------------------------------------------------------------------

function toast({ text, tone = 'info', ttl = 3400 }) {
  if (!text) return;
  const node = document.createElement('div');
  node.className = `toast ${tone}`;
  node.textContent = text;
  toastsEl.appendChild(node);
  while (toastsEl.children.length > 3) toastsEl.firstElementChild.remove();
  const kill = () => {
    if (!node.isConnected) return;
    node.classList.add('is-out');
    setTimeout(() => node.remove(), 320);
  };
  setTimeout(kill, ttl);
  node.addEventListener('click', kill);
}

function handleEvents() {
  for (const evt of game.events) {
    switch (evt.type) {
      case 'start':
        toast({ text: `${TRAINS[selectedTrain].name} · doors open at Zürich HB. Close the doors to depart.`, tone: 'info', ttl: 5200 });
        break;
      case 'doorsOpen':
        toast({ text: `Doors open · ${evt.station?.name ?? 'platform'}`, tone: 'ok', ttl: 2500 });
        audio.door();
        break;
      case 'doorsClose':
        toast({ text: evt.auto ? 'Doors closed automatically.' : 'Doors closed · ready to depart.', tone: evt.auto ? 'warn' : 'ok', ttl: 2500 });
        audio.door();
        break;
      case 'arrive': {
        const p = Math.round(evt.precision);
        if (p >= 90) {
          toast({ text: `${evt.station.name} · perfect stop, ${p}% precision.`, tone: 'ok', ttl: 3800 });
        } else {
          toast({ text: `${evt.station.name} · ${p}% stop precision (${fmtDistance(evt.error)} ${evt.error >= 0 ? 'past' : 'short of'} the mark).`, tone: p >= 60 ? 'warn' : 'bad', ttl: 4200 });
        }
        audio.chime(false);
        break;
      }
      case 'perfect':
        audio.chime(true);
        break;
      case 'missed':
        toast({ text: `Missed the stop at ${evt.station.name}.`, tone: 'bad', ttl: 5000 });
        break;
      case 'toast':
        toast({ text: evt.text, tone: evt.tone || 'info' });
        break;
      case 'violation':
        if (evt.kind === 'signal') toast({ text: 'Signal passed at danger · safety −28', tone: 'bad', ttl: 5200 });
        else if (evt.kind === 'doors') toast({ text: 'Doors open while moving · emergency brake', tone: 'bad', ttl: 5000 });
        audio.brakeSqueal();
        break;
      case 'signalClear':
        if (evt.violated) toast({ text: 'Signal passed at danger.', tone: 'bad', ttl: 4200 });
        else toast({ text: 'Signal cleared · proceed.', tone: 'ok', ttl: 2600 });
        break;
      case 'overspeed':
        toast({ text: `Line speed ${evt.limit} km/h · ease off the power.`, tone: 'warn', ttl: 3000 });
        break;
      case 'emergency':
        audio.brakeSqueal();
        break;
      case 'horn':
        audio.horn();
        break;
      case 'tunnel':
        toast({ text: evt.entering ? 'Entering the Aare tunnel.' : 'Out of the Aare tunnel · Bern ahead.', tone: 'info', ttl: 2800 });
        audio.chime(false);
        break;
      case 'announce':
        if (evt.kind === 'approach') {
          toast({ text: `Next stop ${evt.station.name} · ${fmtDistance(evt.distance)} ahead.`, tone: 'info', ttl: 3200 });
        } else if (evt.kind === 'final') {
          toast({ text: 'Bern in 2.6 km · prepare to stop.', tone: 'info', ttl: 4200 });
        }
        break;
      case 'depart':
        toast({ text: `Departed ${evt.station.name}.`, tone: 'ok', ttl: 2200 });
        break;
      case 'finish':
        showResults();
        audio.chime(true);
        break;
      default:
        break;
    }
  }
  game.events.length = 0;
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

function pressPower() {
  if (game.phase !== 'run') return;
  powerPressed = true;
  powerBtn.classList.add('is-active');
  if (!brakePressed) game.setPower(1);
}

function releasePower() {
  powerPressed = false;
  powerBtn.classList.remove('is-active');
  if (game.phase === 'run' && !brakePressed) game.coast();
}

function pressBrake() {
  if (game.phase !== 'run') return;
  brakePressed = true;
  brakeBtn.classList.add('is-active');
  if (!powerPressed) game.setBrake(1);
}

function releaseBrake() {
  brakePressed = false;
  brakeBtn.classList.remove('is-active');
  if (game.phase === 'run' && !powerPressed) game.coast();
}

function holdButton(node, onDown, onUp) {
  const down = (e) => {
    e.preventDefault();
    if (e.pointerId != null) {
      try { node.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    onDown();
  };
  const up = (e) => {
    if (e) e.preventDefault();
    onUp();
  };
  node.addEventListener('pointerdown', down);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', up);
  node.addEventListener('lostpointercapture', up);
  node.addEventListener('contextmenu', (e) => e.preventDefault());
}

holdButton(powerBtn, pressPower, releasePower);
holdButton(brakeBtn, pressBrake, releaseBrake);

function toggleDoors() {
  if (game.phase !== 'run') return;
  game.toggleDoors();
  handleEvents();
}

function horn() {
  if (game.phase !== 'run') return;
  game.horn();
  handleEvents();
}

hornBtn.addEventListener('click', horn);
doorsBtn.addEventListener('click', toggleDoors);

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', ' ', 'spacebar'].includes(k)) e.preventDefault();
  if (currentScreen === 'title' && (k === 'enter' || k === ' ')) {
    startRun();
    return;
  }
  if (currentScreen === 'results' && k === 'enter') {
    restartRun();
    return;
  }
  if (game.phase === 'run') {
    if (k === 'w' || k === 'arrowup') pressPower();
    else if (k === 's' || k === 'arrowdown') pressBrake();
    else if (k === ' ' || k === 'spacebar' || k === 'd') { toggleDoors(); }
    else if (k === 'h') horn();
    else if (k === 'e') { game.emergency(); handleEvents(); }
    else if (k === 'p' || k === 'escape') pauseRun();
  } else if (game.phase === 'paused' && (k === 'p' || k === 'escape')) {
    resumeRun();
  }
});

window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') releasePower();
  else if (k === 's' || k === 'arrowdown') releaseBrake();
});

window.addEventListener('blur', () => {
  releasePower();
  releaseBrake();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.phase === 'run') pauseRun();
  lastFrame = performance.now();
});

pauseBtn.addEventListener('click', () => {
  if (game.phase === 'run') pauseRun();
  else if (game.phase === 'paused') resumeRun();
});

startBtn.addEventListener('click', startRun);
resumeBtn.addEventListener('click', resumeRun);
restartBtn.addEventListener('click', restartRun);
againBtn.addEventListener('click', restartRun);
shareBtn.addEventListener('click', copyResult);

muteBtn.addEventListener('click', async () => {
  await audio.unlock();
  muted = audio.toggleMute();
  muteBtn.classList.toggle('is-muted', muted);
  muteBtn.setAttribute('aria-pressed', String(muted));
  try { localStorage.setItem('ir16-muted', muted ? '1' : '0'); } catch { /* ignore */ }
  if (!muted) toast({ text: 'Sound on.', tone: 'info', ttl: 1800 });
});

for (const card of document.querySelectorAll('.train-card')) {
  card.addEventListener('click', () => {
    selectedTrain = card.dataset.train;
    for (const c of document.querySelectorAll('.train-card')) {
      const on = c === card;
      c.classList.toggle('is-active', on);
      c.setAttribute('aria-checked', String(on));
    }
    if (game.phase === 'title') {
      game.reset(selectedTrain);
      updateHud(game.status());
    }
    audio.unlock().then(() => audio.chime(false));
  });
}

window.addEventListener('resize', () => {
  renderer.resize(window.innerWidth, window.innerHeight, Math.min(2, window.devicePixelRatio || 1));
});

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

game.reset(selectedTrain);
showScreen('title');
updateHud(game.status());

function frame(now) {
  const raw = (now - lastFrame) / 1000;
  lastFrame = now;
  const dt = clamp(Number.isFinite(raw) ? raw : 0.016, 0, 0.05);
  elapsed += dt;

  if (game.phase === 'run') {
    game.update(dt);
    handleEvents();
  }

  const st = game.status();
  if (st.phase === 'finished' && currentScreen !== 'results') showResults();
  renderer.render(st, elapsed, dt);
  updateHud(st);
  audio.update(st, dt);

  requestAnimationFrame(frame);
}

// Handy for automated visual checks and for tinkering from the console.
window.__ir16 = { game, renderer, audio, start: startRun, pause: pauseRun };

requestAnimationFrame(frame);
