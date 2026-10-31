// ---------------------------------------------------------------------------
// Small procedural soundscape. Everything is synthesised: no audio files, no
// network requests. The engine is deliberately quiet until the first gesture.
// ---------------------------------------------------------------------------

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.master = null;
    this.noiseBuffer = null;
    this.nodes = null;
    this.lastDoor = 0;
  }

  async unlock() {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch { /* ignored */ }
    }
    this.ready = this.ctx.state === 'running';
    this.applyMute();
  }

  init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      this.ctx = null;
      return;
    }
    const ctx = this.ctx;
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -22;
    comp.knee.value = 18;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    master.connect(comp);
    comp.connect(ctx.destination);
    this.master = master;

    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.72 + white * 0.28;
      data[i] = last;
    }
    this.noiseBuffer = buf;

    const noise = (filterType, freq, q = 0.8) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = 0.8 + Math.random() * 0.1;
      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
      return { src, filter, gain };
    };

    const rolling = noise('bandpass', 520, 0.65);
    const rumble = noise('lowpass', 150, 0.9);
    const brake = noise('highpass', 2550, 0.9);
    const tunnel = noise('lowpass', 340, 0.7);
    tunnel.src.playbackRate.value = 0.45;

    const motorGain = ctx.createGain();
    motorGain.gain.value = 0;
    const motorFilter = ctx.createBiquadFilter();
    motorFilter.type = 'lowpass';
    motorFilter.frequency.value = 320;
    motorFilter.Q.value = 3.5;
    motorGain.connect(motorFilter);
    motorFilter.connect(master);
    const motorA = ctx.createOscillator();
    motorA.type = 'sawtooth';
    motorA.frequency.value = 42;
    const motorB = ctx.createOscillator();
    motorB.type = 'triangle';
    motorB.frequency.value = 84;
    const motorBgain = ctx.createGain();
    motorBgain.gain.value = 0.35;
    motorA.connect(motorGain);
    motorB.connect(motorBgain);
    motorBgain.connect(motorGain);
    motorA.start();
    motorB.start();

    this.nodes = {
      rolling, rumble, brake, tunnel, motorA, motorB, motorGain, motorFilter,
    };
    this.ready = true;
  }

  applyMute() {
    if (!this.master || !this.ctx) return;
    const target = this.muted ? 0 : 0.55;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }

  toggleMute() {
    this.muted = !this.muted;
    this.applyMute();
    return this.muted;
  }

  setMuted(value) {
    this.muted = !!value;
    this.applyMute();
  }

  update(status, dt = 0.016) {
    if (!this.ready || !this.ctx || !this.nodes) return;
    const t = this.ctx.currentTime;
    const speed = Math.max(0, status.speed ?? 0);
    const ratio = Math.min(1.3, speed / 55);
    const power = Math.max(0, status.power ?? 0);
    const brake = Math.max(0, status.brake ?? 0);
    const tunnel = !!status.tunnel;
    const n = this.nodes;
    const smooth = (param, value, tc = 0.12) => {
      if (Math.abs(param.value - value) > 0.0004) param.setTargetAtTime(value, t, tc);
    };

    smooth(n.rolling.gain.gain, ratio > 0.01 ? 0.055 + ratio * 0.085 : 0, 0.16);
    smooth(n.rolling.filter.frequency, 330 + ratio * 700, 0.2);
    smooth(n.rolling.src.playbackRate, 0.72 + ratio * 0.5, 0.25);

    smooth(n.rumble.gain.gain, tunnel ? 0.14 : 0.02 + ratio * 0.055, tunnel ? 0.22 : 0.18);
    smooth(n.tunnel.gain.gain, tunnel ? 0.13 : 0, 0.3);

    smooth(n.motorGain.gain, power > 0.01 ? 0.019 + power * 0.05 : 0.004, 0.1);
    smooth(n.motorA.frequency, 36 + power * 18 + ratio * 26, 0.16);
    smooth(n.motorB.frequency, 74 + power * 34 + ratio * 48, 0.16);
    smooth(n.motorFilter.frequency, 210 + power * 500 + ratio * 260, 0.2);

    smooth(n.brake.gain.gain, brake * ratio * 0.075, 0.09);
    smooth(n.brake.filter.frequency, 2100 + brake * 1800, 0.15);

    void dt;
  }

  horn() {
    if (!this.ready || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.16, t + 0.05);
    out.gain.setValueAtTime(0.16, t + 0.62);
    out.gain.exponentialRampToValueAtTime(0.001, t + 1.25);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1900;
    out.connect(filter);
    filter.connect(this.master);
    for (const f of [311, 370]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.linearRampToValueAtTime(f * 0.98, t + 1.1);
      const g = ctx.createGain();
      g.gain.value = 0.5;
      osc.connect(g);
      g.connect(out);
      osc.start(t);
      osc.stop(t + 1.28);
    }
  }

  chime(double = true) {
    if (!this.ready || !this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const notes = double ? [880, 1174.7] : [988];
    notes.forEach((f, i) => {
      const t = t0 + i * 0.19;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.11, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.72);
    });
  }

  door() {
    if (!this.ready || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastDoor < 0.4) return;
    this.lastDoor = now;
    this.chime(false);
    // pneumatic hiss
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1600;
    filter.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.06, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(now);
    src.stop(now + 0.52);
  }

  brakeSqueal() {
    if (!this.ready || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2600, t);
    filter.frequency.exponentialRampToValueAtTime(1500, t + 0.9);
    filter.Q.value = 8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 1.15);
  }
}
