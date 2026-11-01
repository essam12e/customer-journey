"use client";
// audio-design: buses in dB (Master ← SFX, UI, Ambience), small pitch variation for repeated SFX.
// All sounds are synthesized with WebAudio → zero downloads, no licensing.

const dbToGain = (db: number) => Math.pow(10, db / 20);

class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  buses!: Record<"sfx" | "ui" | "amb", GainNode>;
  private noise: AudioBuffer | null = null;
  private ambStarted = false;

  start() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    const limiter = this.ctx.createDynamicsCompressor(); // safety net on master, not the mixer
    limiter.threshold.value = -3; limiter.ratio.value = 12;
    this.master = this.ctx.createGain();
    this.master.gain.value = dbToGain(-6);
    this.master.connect(limiter).connect(this.ctx.destination);
    const bus = (db: number) => { const g = this.ctx!.createGain(); g.gain.value = dbToGain(db); g.connect(this.master); return g; };
    this.buses = { sfx: bus(-8), ui: bus(-10), amb: bus(-24) };
    const len = this.ctx.sampleRate * 0.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean) {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(m ? 0 : dbToGain(-6), this.ctx.currentTime, 0.05);
  }

  private tone(bus: GainNode, freq: number, t0: number, dur: number, type: OscillatorType = "sine", peakDb = 0) {
    const c = this.ctx!;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(dbToGain(peakDb), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(bus);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  step() {
    if (!this.ctx || !this.noise) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4; // variation
    const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 380 + Math.random() * 160;
    const g = c.createGain();
    g.gain.setValueAtTime(dbToGain(-10 - Math.random() * 4), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(f).connect(g).connect(this.buses.sfx);
    src.start(t, Math.random() * 0.3, 0.12);
  }

  focus() { if (this.ctx) this.tone(this.buses.ui, 880 * (0.98 + Math.random() * 0.04), this.ctx.currentTime, 0.12, "sine", -14); }
  open() { if (this.ctx) { const t = this.ctx.currentTime; this.tone(this.buses.ui, 523, t, 0.16, "triangle", -8); this.tone(this.buses.ui, 784, t + 0.06, 0.2, "triangle", -10); } }
  close() { if (this.ctx) this.tone(this.buses.ui, 440, this.ctx.currentTime, 0.12, "triangle", -12); }
  addToCart() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [659, 880, 1175].forEach((f, i) => this.tone(this.buses.ui, f, t + i * 0.07, 0.35, "sine", -6 - i * 2));
  }
  door() {
    if (!this.ctx || !this.noise) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 0.7;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1200, t + 0.5);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(dbToGain(-16), t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    src.connect(f).connect(g).connect(this.buses.sfx); src.start(t, 0, 0.6);
    this.tone(this.buses.ui, 1568, t + 0.05, 0.9, "sine", -20); // shop bell
  }

  /** Soft room tone + slow warm pad (vertical layer that can later be adapted per section). */
  ambience() {
    if (!this.ctx || this.ambStarted) return;
    this.ambStarted = true;
    const c = this.ctx;
    const chords = [[220, 277.2, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [196, 246.9, 329.6]];
    const pad = c.createGain(); pad.gain.value = 0.5; pad.connect(this.buses.amb);
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900; lp.connect(pad);
    const play = (i: number) => {
      const t = c.currentTime;
      for (const f of chords[i % chords.length]) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = "triangle"; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 8;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 2); g.gain.linearRampToValueAtTime(0, t + 7.8);
        o.connect(g).connect(lp); o.start(t); o.stop(t + 8);
      }
      setTimeout(() => play(i + 1), 7000);
    };
    play(0);
  }
}

export const sfx = new AudioEngine();
