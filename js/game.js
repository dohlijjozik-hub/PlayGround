import {
  STATIONS, SIGNALS, RED_SIGNAL_INDEX, TUNNEL, limitAt, nextLimitChange, ROUTE_LENGTH,
} from './route.js';
import { clamp, kmhToMs, msToKmh, clockText } from './util.js';

const MAX_SPEED = 62; // m/s, a little over 200 km/h for the speedo needle

export class Game {
  constructor() {
    this.events = [];
    this.reset('ic2000');
    this.phase = 'title';
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  reset(train = this.train || 'ic2000') {
    this.train = train;
    this.phase = 'title';
    this.time = 0;
    this.headS = STATIONS[0].stopS;
    this.speed = 0;
    this.power = 0;
    this.brake = 0;
    this.emergencyBrake = false;
    this.doorsOpen = true;
    this.doorAnim = 1;
    this.doorsAutoClose = false;
    this.targetIndex = 1;
    this.atStation = 0;
    this.stationStopped = false;
    this.currentStation = STATIONS[0];
    this.stationResult = null;
    this.served = false;
    this.delays = [];
    this.stopResults = [];
    this.comfort = 100;
    this.safety = 100;
    this.overspeed = 0;
    this.overspeedWarned = false;
    this.redViolated = false;
    this.signalHold = 0;
    this.redCleared = false;
    this.tunnelEntered = false;
    this.tunnelExited = false;
    this.announced = new Set();
    this.topSpeed = 0;
    this.distance = 0;
    this.finished = false;
    this.finishTimer = 0;
    this.lastStation = null;
    this.smoothPenalty = 0;
    this.startTime = 0;
    this.pausedAt = 0;
    this.autoStop = 0;
    this.score = null;
    this.message = null;
  }

  start(train = this.train) {
    this.reset(train);
    this.phase = 'run';
    this.emit('start', { station: STATIONS[0] });
    this.emit('doorsOpen', { station: STATIONS[0] });
    this.emit('announce', { station: STATIONS[0], kind: 'start' });
  }

  pause() {
    if (this.phase === 'run') this.phase = 'paused';
  }

  resume() {
    if (this.phase === 'paused') this.phase = 'run';
  }

  setPower(value) {
    if (this.phase !== 'run') return;
    this.power = clamp(value, 0, 1);
    if (this.power > 0.02) this.brake = 0;
  }

  setBrake(value) {
    if (this.phase !== 'run') return;
    this.brake = clamp(value, 0, 1);
    if (this.brake > 0.02) this.power = 0;
  }

  coast() {
    if (this.phase !== 'run') return;
    this.power = 0;
    this.brake = 0;
  }

  emergency() {
    if (this.phase !== 'run') return;
    this.brake = 1;
    this.power = 0;
    this.emergencyBrake = true;
    this.emit('emergency');
  }

  horn() {
    if (this.phase !== 'run') return;
    this.emit('horn');
  }

  toggleDoors() {
    if (this.phase !== 'run') return;
    if (this.speed > 0.25) {
      this.emit('toast', { text: 'Doors blocked — train is moving', tone: 'bad' });
      this.safety = Math.max(0, this.safety - 3);
      return;
    }
    if (this.doorsOpen) {
      this.doorsOpen = false;
      this.emit('doorsClose');
      return;
    }
    const station = this.stationAt();
    if (!station || this.headS > station.stopS + 95 || this.headS < station.stopS - 180) {
      this.emit('toast', { text: 'Doors only open at a platform', tone: 'bad' });
      return;
    }
    this.doorsOpen = true;
    this.doorsAutoClose = false;
    if (!this.served && station.id === this.currentStation?.id) {
      this.served = true;
      this.emit('doorsOpen', { station });
    } else {
      this.emit('doorsOpen', { station });
    }
  }

  stationAt() {
    let best = null;
    for (const st of STATIONS) {
      if (this.headS >= st.platformStart - 40 && this.headS <= st.platformEnd + 40) {
        if (!best || Math.abs(this.headS - st.stopS) < Math.abs(this.headS - best.stopS)) best = st;
      }
    }
    return best;
  }

  currentTarget() {
    if (this.atStation !== null && this.atStation >= 0) return STATIONS[this.atStation];
    return STATIONS[Math.min(this.targetIndex, STATIONS.length - 1)];
  }

  speedKmh() {
    return msToKmh(this.speed);
  }

  limit() {
    return limitAt(this.headS);
  }

  nextSignal() {
    for (const sig of SIGNALS) {
      if (sig.s > this.headS - 1) return sig;
    }
    return null;
  }

  update(dt) {
    this.events.length = 0;
    if (this.phase !== 'run') return;

    dt = Math.min(dt, 0.06);
    this.time += dt;

    // ------- traction & braking -------------------------------------------------
    const v = this.speed;
    const power = this.power;
    const brake = this.brake;
    const tractive = power * 0.82 * Math.max(0, 1 - Math.pow(v / MAX_SPEED, 2));
    const braking = (this.emergencyBrake ? 1.95 : brake * 1.5);
    const drag = v > 0.02 ? 0.000028 * v * v + 0.035 : 0;
    let accel = tractive - braking - drag;
    if (v <= 0.01 && accel < 0) accel = 0;
    if (v >= MAX_SPEED && accel > 0) accel = 0;
    this.speed = clamp(v + accel * dt, 0, MAX_SPEED);
    if (this.emergencyBrake && this.speed < 0.2) this.emergencyBrake = false;
    this.headS += this.speed * dt;
    this.distance += this.speed * dt;
    this.topSpeed = Math.max(this.topSpeed, this.speed);
    if (this.speed < 0.05 && power === 0) this.speed = 0;

    // ------- comfort ------------------------------------------------------------
    const harsh = Math.abs(accel);
    if (harsh > 1.1 && v > 1) this.smoothPenalty += (harsh - 1.1) * dt * 4.2;
    if (brake > 0.82 && v > 12) this.smoothPenalty += (brake - 0.82) * dt * 5;
    if (this.emergencyBrake) this.smoothPenalty += dt * 2.4;
    this.comfort = clamp(100 - this.smoothPenalty, 0, 100);

    // ------- platform / doors ---------------------------------------------------
    if (this.doorsOpen) {
      this.doorAnim = Math.min(1, this.doorAnim + dt * 2.5);
      if (this.speed > 0.25) {
        this.safety = Math.max(0, this.safety - dt * 20);
        this.emergencyBrake = true;
        if (!this.doorMoveWarned) {
          this.doorMoveWarned = true;
          this.emit('toast', { text: 'Emergency brake — doors are open', tone: 'bad' });
          this.emit('violation', { kind: 'doors' });
        }
      }
    } else {
      this.doorAnim = Math.max(0, this.doorAnim - dt * 2.5);
      this.doorMoveWarned = false;
    }

    const target = STATIONS[this.targetIndex];
    const at = this.stationAt();

    // Auto-close doors a little after the booked departure. The delay is real.
    if (this.doorsOpen && at && at.dep != null && this.time > at.dep + 10 && this.speed < 0.2) {
      this.doorsOpen = false;
      this.doorsAutoClose = true;
      this.emit('doorsClose', { auto: true });
      this.emit('toast', { text: 'Doors closed automatically · departure delayed', tone: 'warn' });
      this.safety = Math.max(0, this.safety - 4);
    }

    // ------- stopping at the target --------------------------------------------
    if (target && this.speed < 0.14) {
      const err = this.headS - target.stopS;
      if (Math.abs(err) < 170 && at && at.id === target.id && !this.stationStopped) {
        this.stationStopped = true;
        this.atStation = this.targetIndex;
        this.currentStation = target;
        const abs = Math.abs(err);
        const precision = abs <= 3 ? 100 : abs <= 8 ? 88 : abs <= 15 ? 72 : abs <= 30 ? 48 : 20;
        this.stopResults.push({ station: target, error: err, precision });
        this.delays.push(this.time - target.arr);
        this.served = false;
        this.stationResult = { station: target, error: err, precision };
        this.emit('arrive', { station: target, error: err, precision, delay: this.time - target.arr });
        if (precision >= 90) this.emit('perfect', { station: target, error: err });
        else this.emit('toast', {
          text: `${abs.toFixed(1)} m from the stop mark`, tone: abs <= 15 ? 'ok' : 'warn',
        });
      } else if (target && err < -170 && at && at.id === target.id) {
        // stopped short of the platform; let the driver creep, but tell them
        if (!this.shortWarned) {
          this.shortWarned = true;
          this.emit('toast', { text: 'Stop mark is further ahead', tone: 'warn' });
        }
      }
    }

    // missed stop
    if (target && this.headS > target.stopS + 150 && !this.stationStopped) {
      if (target.terminal) {
        this.stopResults.push({ station: target, error: 999, precision: 0 });
        this.delays.push(this.time - target.arr);
        this.emit('missed', { station: target });
        this.finish();
        return;
      }
      this.stopResults.push({ station: target, error: 999, precision: 0 });
      this.delays.push(this.time - target.arr);
      this.emit('missed', { station: target });
      this.targetIndex += 1;
      this.atStation = -1;
      this.stationStopped = false;
      this.shortWarned = false;
      this.served = false;
    }

    // depart the station once moving away from the stop mark
    if (this.atStation >= 0 && this.atStation < STATIONS.length - 1) {
      const st = STATIONS[this.atStation];
      if (this.headS > st.stopS + 25 && this.speed > 0.4) {
        this.atStation = -1;
        this.targetIndex = Math.max(this.targetIndex, st === STATIONS[0] ? 1 : STATIONS.indexOf(st) + 1);
        this.stationStopped = false;
        this.shortWarned = false;
        this.served = false;
        this.emit('depart', { station: st, delay: this.time - (st.dep ?? st.arr) });
      }
    }

    // ------- speed limits ------------------------------------------------------
    const limit = this.limit();
    const kmh = this.speedKmh();
    if (limit > 0 && kmh > limit + 2) {
      this.overspeed += dt;
      this.safety = Math.max(0, this.safety - dt * (0.7 + (kmh - limit) * 0.03));
      if (!this.overspeedWarned) {
        this.overspeedWarned = true;
        this.emit('overspeed', { limit });
      }
    } else {
      this.overspeed = Math.max(0, this.overspeed - dt * 2);
      if (kmh < limit - 3) this.overspeedWarned = false;
    }

    // ------- the one red signal ------------------------------------------------
    const red = SIGNALS[RED_SIGNAL_INDEX];
    if (red.state === 'red') {
      if (this.headS > red.s + 0.5 && this.speed > 0.2) {
        red.state = 'green';
        SIGNALS[RED_SIGNAL_INDEX - 1].state = 'green';
        this.redViolated = true;
        this.safety = Math.max(0, this.safety - 28);
        this.emergencyBrake = true;
        this.emit('violation', { kind: 'signal' });
        this.emit('signalClear', { signal: red, violated: true });
      } else if (this.speed < 0.3 && red.s - this.headS > 0 && red.s - this.headS < 330) {
        this.signalHold += dt;
        if (this.signalHold > 3.8) {
          red.state = 'green';
          SIGNALS[RED_SIGNAL_INDEX - 1].state = 'green';
          this.redCleared = true;
          this.emit('signalClear', { signal: red, violated: false });
        }
      } else {
        this.signalHold = Math.max(0, this.signalHold - dt * 0.6);
      }
    }

    // ------- tunnel & announcements --------------------------------------------
    if (!this.tunnelEntered && this.headS > TUNNEL.start - 5) {
      this.tunnelEntered = true;
      this.emit('tunnel', { entering: true });
    }
    if (!this.tunnelExited && this.headS > TUNNEL.end) {
      this.tunnelExited = true;
      this.emit('tunnel', { entering: false });
    }
    for (let i = 1; i < STATIONS.length; i++) {
      const st = STATIONS[i];
      const key = `approach-${st.id}`;
      if (!this.announced.has(key) && st.stopS - this.headS < 800 && st.stopS - this.headS > 0) {
        this.announced.add(key);
        this.emit('announce', { station: st, kind: 'approach', distance: st.stopS - this.headS });
      }
    }
    if (!this.announced.has('bern-final') && STATIONS[STATIONS.length - 1].stopS - this.headS < 2600) {
      this.announced.add('bern-final');
      this.emit('announce', { station: STATIONS[STATIONS.length - 1], kind: 'final' });
    }

    // ------- finish ------------------------------------------------------------
    if (this.atStation === STATIONS.length - 1) {
      const bern = STATIONS[STATIONS.length - 1];
      const stopped = this.stationStopped && Math.abs(this.headS - bern.stopS) < 180;
      if (stopped) {
        this.finishTimer += dt;
        if (this.doorsOpen || this.finishTimer > 5) {
          this.finish();
          return;
        }
      }
    }

    if (this.headS > ROUTE_LENGTH - 40) {
      this.finish();
      return;
    }

    // keep the speed value from drifting below zero
    if (this.speed < 0.001) this.speed = 0;
  }

  finish() {
    if (this.phase === 'finished') return;
    this.phase = 'finished';
    this.finished = true;
    this.score = this.computeScore();
    this.emit('finish', { score: this.score });
  }

  computeScore() {
    const arrivals = this.delays.length ? this.delays : [this.time - STATIONS[STATIONS.length - 1].arr];
    let punctuality = 100;
    for (const d of arrivals) {
      if (d > 30) punctuality -= Math.min(28, (d - 30) * 0.38);
      if (d < -60) punctuality -= Math.min(8, (-d - 60) * 0.15);
    }
    punctuality = clamp(punctuality, 0, 100);

    const precision = this.stopResults.length
      ? this.stopResults.reduce((a, s) => a + s.precision, 0) / this.stopResults.length
      : 0;
    const comfort = clamp(this.comfort, 0, 100);
    const safety = clamp(this.safety, 0, 100);
    const overall = punctuality * 0.34 + precision * 0.3 + comfort * 0.2 + safety * 0.16;
    let grade = 'Nachsitzen';
    let gradeEn = 'Needs work';
    if (overall >= 95) { grade = 'SBB-Perfektion'; gradeEn = 'Punctual perfection'; }
    else if (overall >= 86) { grade = 'Sehr gut'; gradeEn = 'Excellent'; }
    else if (overall >= 72) { grade = 'Gut'; gradeEn = 'Good run'; }
    else if (overall >= 56) { grade = 'Genügend'; gradeEn = 'Passable'; }
    const finalDelay = this.delays.length ? this.delays[this.delays.length - 1] : (this.time - STATIONS[STATIONS.length - 1].arr);
    return {
      punctuality, precision, comfort, safety, overall, grade, gradeEn,
      finalDelay,
      arrival: clockText(this.time),
      topSpeed: msToKmh(this.topSpeed),
      distance: this.distance / 1000,
      stops: this.stopResults,
      violations: this.redViolated,
    };
  }

  status() {
    const at = this.atStation !== null && this.atStation >= 0 ? STATIONS[this.atStation] : null;
    const target = at ?? STATIONS[Math.min(this.targetIndex, STATIONS.length - 1)];
    const signal = this.nextSignal();
    return {
      phase: this.phase,
      time: this.time,
      clock: clockText(this.time),
      speed: this.speed,
      kmh: this.speedKmh(),
      limit: this.limit(),
      power: this.power,
      brake: this.brake,
      doorsOpen: this.doorsOpen,
      doorAnim: this.doorAnim,
      target,
      atStation: at,
      stationStopped: this.stationStopped,
      stopDistance: target ? target.stopS - this.headS : 0,
      delay: at ? this.time - (at.dep ?? at.arr) : (target ? this.time - target.arr : 0),
      scheduledArrival: target ? clockText(target.arr) : '',
      scheduledDeparture: at && at.dep != null ? clockText(at.dep) : '',
      signal,
      signalDistance: signal ? signal.s - this.headS : 0,
      redCleared: this.redCleared,
      tunnel: this.headS > TUNNEL.start && this.headS < TUNNEL.end,
      comfort: this.comfort,
      safety: this.safety,
      headS: this.headS,
      train: this.train,
      nextLimit: nextLimitChange(this.headS),
      routeProgress: clamp(this.headS / STATIONS[STATIONS.length - 1].stopS, 0, 1),
      score: this.score,
      served: this.served,
      doorsAutoClose: this.doorsAutoClose,
    };
  }
}
