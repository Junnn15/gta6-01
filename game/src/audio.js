// SOLMAR HEAT — audio.js
// One clear job: every sound is synthesized with the Web Audio API.
// No audio files, no network. Engine hum, sirens, gunshots, footsteps,
// UI jingles and mission stingers are all oscillators and noise buffers.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.muted = false;
    this.started = false;
  }

  // Must be called from a user gesture at least once.
  start() {
    if (this.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this._buildEngineHum();
      this._buildSiren();
      this.started = true;
    } catch (e) {
      // Audio is decoration; a failure must never break the game.
      this.ctx = null;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  _buildEngineHum() {
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 40;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  _buildSiren() {
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 750;
    this.sirenLfo = this.ctx.createOscillator();
    this.sirenLfo.type = 'square';
    this.sirenLfo.frequency.value = 0.7;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 220;
    this.sirenLfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  // Continuous: engine pitch follows speed, siren follows wanted level.
  update(speed, wanted, inCar) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    if (this.engineGain) {
      const target = inCar ? 0.05 + Math.min(0.12, Math.abs(speed) * 0.003) : 0;
      this.engineGain.gain.setTargetAtTime(target, t, 0.1);
      this.engineOsc.frequency.setTargetAtTime(38 + Math.abs(speed) * 2.2, t, 0.1);
    }
    if (this.sirenGain) {
      const target = wanted > 0 ? 0.045 + wanted * 0.008 : 0;
      this.sirenGain.gain.setTargetAtTime(target, t, 0.3);
    }
  }

  _blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noise(dur, vol, filterFreq) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  shot() {
    this._noise(0.16, 0.5, 2400);
    this._blip(160, 0.08, 'square', 0.25, 60);
  }

  reload() {
    this._blip(500, 0.06, 'square', 0.12);
    setTimeout(() => this._blip(700, 0.06, 'square', 0.12), 160);
  }

  emptyClick() {
    this._blip(900, 0.04, 'square', 0.1);
  }

  hit() {
    this._blip(220, 0.1, 'sine', 0.2, 110);
  }

  pickup() {
    this._blip(660, 0.09, 'sine', 0.2);
    setTimeout(() => this._blip(990, 0.12, 'sine', 0.2), 90);
  }

  missionComplete() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => this._blip(f, 0.22, 'triangle', 0.25), i * 110));
  }

  missionStart() {
    this._blip(440, 0.12, 'triangle', 0.2);
    setTimeout(() => this._blip(587, 0.16, 'triangle', 0.2), 120);
  }

  busted() {
    const notes = [392, 311, 262, 196];
    notes.forEach((f, i) => setTimeout(() => this._blip(f, 0.3, 'sawtooth', 0.18), i * 180));
  }

  wasted() {
    const notes = [330, 262, 208, 165];
    notes.forEach((f, i) => setTimeout(() => this._blip(f, 0.35, 'sawtooth', 0.18), i * 200));
  }

  carDoor() {
    this._noise(0.12, 0.25, 900);
  }

  checkpoint() {
    this._blip(880, 0.1, 'sine', 0.22);
    setTimeout(() => this._blip(1175, 0.14, 'sine', 0.22), 100);
  }

  uiClick() {
    this._blip(740, 0.05, 'sine', 0.15);
  }
}
