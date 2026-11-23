// Audio: everything is synthesized with the Web Audio API (no sound files).
//   start(ctx)      first user click (autoplay policy): builds the graph, renders the looped material.
//   toggleMute(ctx) M key.
//   update(ctx)     every frame: listener, mixes, positional sources, scheduled events. No allocations, no node
//                   creation (except, rarely, when a new kind of positional source appears or the show music
//                   has to resync). All level changes are smoothed (setTargetAtTime), so nothing clicks.
//
// Layers
//   city bed       low rumble + mains hum, distant traffic wash, occasional horns and sirens, crowd murmur near
//                  markets and busy streets
//   weather        rain on surfaces (ctx.env.rain), river/lake water near the banks, wind at altitude,
//                  wind whoosh when flying fast
//   footsteps      wet footsteps while walking
//   positional     ctx.world.audioSources (train, cable, boat, drone, aircraft) through HRTF panners, with a
//                  Doppler pitch shift
//   light show     120 bpm track (pulsing bass, pentatonic arpeggios, guzheng-like plucks) near the Bund while
//                  ctx.show.intensity > 0, locked to ctx.show.time
//   districts      Lake Gardens: wind chimes, insects, plucked-string phrases (Karplus-Strong)
//                  Steppe Quarter: bowed horse-head fiddle drone and an overtone-singing drone
// Master: bus mix -> compressor -> limiter -> mute gain -> destination.

import { rng, smoothstep, clamp } from './math.js';
import { DISTRICTS, DT } from './world.js';

const BEAT = 0.5;               // 120 bpm
const MUSIC_BEATS = 64;         // 16 bars loop (32 s)
const BUND = [1900, -1050];     // centre of the Bund promenade / show viewing area
const PENTA = [0, 3, 5, 7, 10]; // minor pentatonic (yu mode) in semitones
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------- offline synthesis helpers

function makeNoise(ac, seconds, kind, seed) {
  const sr = ac.sampleRate, n = Math.floor(seconds * sr);
  const buf = ac.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const R = rng(seed);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
  for (let i = 0; i < n; i++) {
    const w = R() * 2 - 1;
    if (kind === 'white') d[i] = w * 0.5;
    else if (kind === 'pink') { // Paul Kellet's refined pink filter
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    } else { br = (br + w * 0.02) / 1.02; d[i] = br * 3.5; } // brown
  }
  // crossfade the end into the start so the loop is seamless
  const x = Math.floor(sr * 0.05);
  for (let i = 0; i < x; i++) { const t = i / x; d[n - x + i] = d[n - x + i] * (1 - t) + d[i] * t; }
  return buf;
}

// Smooth random control signal in [-1, 1] (cosine-interpolated random points), at a low sample rate.
function makeControl(ac, seconds, pointsPerSec, seed) {
  const sr = 3000, n = Math.floor(seconds * sr);
  const buf = ac.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const R = rng(seed);
  const np = Math.floor(seconds * pointsPerSec);
  const pts = new Float32Array(np);
  for (let i = 0; i < np; i++) pts[i] = R() * 2 - 1;
  for (let i = 0; i < n; i++) {
    const u = i / n * np, k = Math.floor(u), f = u - k;
    const a = pts[k % np], b = pts[(k + 1) % np];
    d[i] = a + (b - a) * (0.5 - 0.5 * Math.cos(Math.PI * f));
  }
  return buf;
}

// Karplus-Strong plucked string (guzheng / pipa-like). Returns a mono Float32Array.
function ksPluck(sr, freq, dur, bright, R) {
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const L = Math.max(2, Math.round(sr / freq - 0.5));
  const line = new Float32Array(L);
  let lp = 0, mean = 0;
  for (let i = 0; i < L; i++) { lp += ((R() * 2 - 1) - lp) * bright; line[i] = lp; mean += lp; }
  mean /= L;
  for (let i = 0; i < L; i++) line[i] -= mean;
  const loss = Math.pow(0.001, 1 / Math.max(dur * freq, 1));
  let idx = 0, prev = 0;
  for (let i = 0; i < n; i++) {
    const a = line[idx];
    const y = loss * 0.5 * (a + prev);
    prev = a;
    line[idx] = y;
    out[i] = a;
    idx++; if (idx === L) idx = 0;
  }
  // soften the very first samples (nail attack without a click)
  const at = Math.min(n, Math.floor(sr * 0.002));
  for (let i = 0; i < at; i++) out[i] *= i / at;
  return out;
}

// Mixes a mono source into a looped stereo pair with an optional pitch bend (semitones from `bend` to 0
// over `bendTime` seconds, guzheng-style slide) and an optional vibrato at the end.
function mixInto(L, R, start, src, gl, gr, bend = 0, bendTime = 0.08, vib = 0) {
  const n = L.length, sr = mixInto.sr;
  let pos = 0;
  for (let i = 0; pos < src.length - 1; i++) {
    const t = i / sr;
    let semi = bend * Math.exp(-t / Math.max(bendTime, 1e-3));
    if (vib) semi += vib * Math.sin(t * 2 * Math.PI * 5.5) * smoothstep(0.25, 0.6, t);
    const rate = Math.pow(2, semi / 12);
    const k = Math.floor(pos), f = pos - k;
    const v = src[k] + (src[k + 1] - src[k]) * f;
    const j = (start + i) % n;
    L[j] += v * gl; R[j] += v * gr;
    pos += rate;
  }
}

function pan(p) { return [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)]; }

// Inharmonic bell/chime strike.
function chime(sr, f, dur, amp) {
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const parts = [[1, 1, 1], [2.76, 0.45, 0.6], [5.4, 0.22, 0.35], [8.93, 0.12, 0.2]];
  for (const [r, a, dk] of parts) {
    const w = 2 * Math.PI * f * r / sr, w2 = w * 1.0015, tau = dur * dk * sr / 6.9;
    for (let i = 0; i < n; i++) out[i] += (Math.sin(w * i) + Math.sin(w2 * i)) * 0.5 * a * Math.exp(-i / tau);
  }
  const at = Math.floor(sr * 0.001);
  for (let i = 0; i < n; i++) out[i] *= amp * (i < at ? i / at : 1);
  return out;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

// Lake Gardens plucked-string phrases (guzheng / pipa), sparse, with slides and tremolo. Stereo, looped.
async function renderGardenPhrases(sr) {
  const len = Math.floor(43 * sr);
  const L = new Float32Array(len), Rr = new Float32Array(len);
  const R = rng(311);
  mixInto.sr = sr;
  let t = 1.0;
  while (t < 41) {
    const notes = 3 + Math.floor(R() * 5);
    const p = (R() * 2 - 1) * 0.5;
    const [gl, gr] = pan(p);
    let deg = Math.floor(R() * 5) + 5;
    for (let k = 0; k < notes; k++) {
      deg = Math.max(0, Math.min(12, deg + Math.floor(R() * 5) - 2));
      const midi = 57 + PENTA[deg % 5] + 12 * Math.floor(deg / 5);
      const f = mtof(midi);
      const tremolo = R() < 0.15;
      if (tremolo) { // pipa-like tremolo: fast repeated plucks
        for (let r = 0; r < 10; r++) {
          const s = ksPluck(sr, f, 0.5, 0.55, R);
          mixInto(L, Rr, Math.floor((t + r * 0.065) * sr), s, gl * 0.1 * (1 - r * 0.05), gr * 0.1 * (1 - r * 0.05));
        }
        t += 0.75;
      } else {
        const s = ksPluck(sr, f, 2.6, 0.45 + R() * 0.2, R);
        const bend = R() < 0.35 ? -(1 + Math.floor(R() * 2)) : 0;
        mixInto(L, Rr, Math.floor(t * sr), s, gl * 0.22, gr * 0.22, bend, 0.09, R() < 0.3 ? 0.25 : 0);
        t += [0.25, 0.5, 0.5, 0.75, 1.0][Math.floor(R() * 5)];
      }
    }
    t += 4 + R() * 6;
    await tick();
  }
  return [L, Rr];
}

// Wind chimes in gusts (high pentatonic, inharmonic metal tubes). Stereo, looped.
async function renderChimes(sr) {
  const len = Math.floor(29 * sr);
  const L = new Float32Array(len), Rr = new Float32Array(len);
  const R = rng(733);
  mixInto.sr = sr;
  let t = 0.5;
  while (t < 28) {
    const strikes = 2 + Math.floor(R() * 6);
    for (let k = 0; k < strikes; k++) {
      const midi = 81 + PENTA[Math.floor(R() * 5)] + (R() < 0.3 ? 12 : 0);
      const s = chime(sr, mtof(midi), 3.5, 0.05 + R() * 0.06);
      const [gl, gr] = pan((R() * 2 - 1) * 0.7);
      mixInto(L, Rr, Math.floor((t + R() * 1.6) * sr), s, gl, gr);
    }
    t += 3 + R() * 6;
    await tick();
  }
  return [L, Rr];
}

// Night insects: several crickets (chirps of short sine pulses) plus a faint high katydid buzz. Stereo, looped.
async function renderInsects(sr) {
  const len = Math.floor(7.3 * sr);
  const L = new Float32Array(len), Rr = new Float32Array(len);
  const R = rng(97);
  for (let c = 0; c < 7; c++) {
    const f = 3800 + R() * 1800, w = 2 * Math.PI * f / sr;
    const [gl, gr] = pan((R() * 2 - 1) * 0.9);
    const amp = 0.015 + R() * 0.03;
    const period = 0.35 + R() * 0.5, pulses = 2 + Math.floor(R() * 3);
    for (let t = R() * period; t < 7.3; t += period * (0.9 + R() * 0.2)) {
      for (let p = 0; p < pulses; p++) {
        const s0 = Math.floor((t + p * 0.034) * sr), pn = Math.floor(0.018 * sr);
        for (let i = 0; i < pn; i++) {
          const env = Math.sin(Math.PI * i / pn);
          const v = Math.sin(w * (s0 + i)) * env * env * amp;
          const j = (s0 + i) % len;
          L[j] += v * gl; Rr[j] += v * gr;
        }
      }
    }
  }
  await tick();
  // katydid: amplitude-modulated narrow noise band around 7 kHz
  let y1 = 0, y2 = 0;
  const fc = 7000 / sr, q = 18, wc = 2 * Math.PI * fc, alpha = Math.sin(wc) / (2 * q), cw = Math.cos(wc);
  const b0 = alpha, a0 = 1 + alpha, a1 = -2 * cw, a2 = 1 - alpha;
  let x1 = 0, x2 = 0;
  for (let i = 0; i < len; i++) {
    const x = R() * 2 - 1;
    const y = (b0 * x - b0 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    const am = Math.max(0, Math.sin(i / sr * 2 * Math.PI * 42)) * (0.5 + 0.5 * Math.sin(i / sr * 2 * Math.PI * 0.55));
    L[i] += y * am * 0.02; Rr[i] += y * am * 0.014;
  }
  return [L, Rr];
}

// Light show track: 120 bpm, 16 bars, A minor pentatonic. Kick, pumping bass, hats, arpeggio with a
// ping-pong delay, guzheng phrases and runs, a soft pad and gong accents. Stereo, loops seamlessly.
async function renderMusic(sr) {
  const len = Math.floor(MUSIC_BEATS * BEAT * sr);
  const L = new Float32Array(len), Rr = new Float32Array(len);
  const R = rng(2077);
  mixInto.sr = sr;
  const at = (beat) => Math.floor(beat * BEAT * sr);
  const roots = [45, 41, 48, 43]; // A2 F2 C3 G2, 4 bars each
  const add = (j, v, gl, gr) => { const k = j % len; L[k] += v * gl; Rr[k] += v * gr; };

  // kick (four on the floor)
  for (let b = 0; b < MUSIC_BEATS; b++) {
    const s0 = at(b), n = Math.floor(0.32 * sr);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      ph += 2 * Math.PI * (44 + 80 * Math.exp(-t * 28)) / sr;
      const v = Math.sin(ph) * Math.exp(-t * 8.5) * 0.85 * Math.min(1, i / 40);
      add(s0 + i, v, 0.7, 0.7);
    }
  }
  await tick();
  // pumping bass: 8th notes, saw through a resonant low-pass with a decaying cutoff, ducked on the beat
  for (let e = 0; e < MUSIC_BEATS * 2; e++) {
    const bar = Math.floor(e / 8), root = roots[Math.floor(bar / 4) % 4];
    const note = root - 12 + ((e % 8 === 6) ? 7 : 0);
    const f = mtof(note), s0 = at(e * 0.5), n = Math.floor(0.25 * sr);
    let ph = 0, lp = 0, bp = 0;
    const duck = e % 2 === 0 ? 0.45 : 1.0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      ph = (ph + f / sr) % 1;
      const saw = ph * 2 - 1;
      const fc = 2 * Math.sin(Math.PI * Math.min(0.45, (180 + 900 * Math.exp(-t * 16)) / sr));
      lp += fc * bp; bp += fc * (saw - lp - 0.4 * bp);
      const env = Math.min(1, t * 200) * Math.exp(-t * 7) * Math.min(1, (n - i) / 200);
      add(s0 + i, lp * env * 0.32 * duck, 0.7, 0.7);
    }
  }
  await tick();
  // hats: off-beat 8ths, 16ths in the second half
  let hp = 0;
  for (let s = 0; s < MUSIC_BEATS * 4; s++) {
    const off = s % 4 === 2;
    if (!off && !(s >= MUSIC_BEATS * 2 && s % 2 === 1)) continue;
    const s0 = at(s * 0.25), n = Math.floor((off ? 0.06 : 0.03) * sr), a = off ? 0.09 : 0.04;
    const [gl, gr] = pan(off ? 0.2 : -0.25);
    for (let i = 0; i < n; i++) {
      const w = R() * 2 - 1;
      hp += (w - hp) * 0.25;
      add(s0 + i, (w - hp) * Math.exp(-i / sr * (off ? 60 : 110)) * a, gl, gr);
    }
  }
  await tick();
  // pad: soft detuned saws on the chord (root, fifth, octave + tenth), slow swell
  for (let c = 0; c < 4; c++) {
    const root = roots[c] + 12, s0 = at(c * 16), n = at(16);
    const tones = [root, root + 7, root + 12, root + 15];
    for (const m of tones) for (const det of [-0.08, 0.07]) {
      const f = mtof(m + det);
      let ph = R(), lp = 0;
      for (let i = 0; i < n; i++) {
        ph = (ph + f / sr) % 1;
        lp += ((ph * 2 - 1) - lp) * 0.035;
        const env = Math.min(1, i / (sr * 1.5)) * Math.min(1, (n - i) / (sr * 1.5));
        add(s0 + i, lp * env * 0.022, det < 0 ? 0.85 : 0.5, det < 0 ? 0.5 : 0.85);
      }
    }
    await tick();
  }
  // arpeggio: 16ths over two octaves of the pentatonic, short plucky square, with a ping-pong delay
  const arpL = new Float32Array(len), arpR = new Float32Array(len);
  const pat = [0, 2, 4, 5, 7, 5, 4, 2, 0, 3, 5, 7, 9, 7, 5, 3];
  for (let s = 0; s < MUSIC_BEATS * 4; s++) {
    const bar = Math.floor(s / 16);
    if (bar < 2) continue; // intro: no arpeggio
    const deg = pat[s % 16] + (bar >= 8 && bar % 2 === 1 ? 2 : 0);
    const base = 57 + (Math.floor(bar / 4) % 4 === 1 ? -4 : 0);
    const midi = base + PENTA[deg % 5] + 12 * Math.floor(deg / 5);
    const f = mtof(midi), s0 = at(s * 0.25), n = Math.floor(0.14 * sr);
    let ph = 0, lp = 0;
    const [gl, gr] = pan(s % 2 ? 0.35 : -0.35);
    for (let i = 0; i < n; i++) {
      ph = (ph + f / sr) % 1;
      lp += ((ph < 0.5 ? 1 : -1) - lp) * 0.22;
      const v = lp * Math.min(1, i / 60) * Math.exp(-i / sr * 22) * 0.07;
      const k = (s0 + i) % len; arpL[k] += v * gl; arpR[k] += v * gr;
    }
  }
  const dly = Math.floor(0.75 * BEAT * sr); // dotted 8th
  for (let pass = 0; pass < 2; pass++) { // two passes so the wrapped feedback also loops cleanly
    for (let i = 0; i < len; i++) {
      const j = (i - dly + len) % len;
      arpL[i] += arpR[j] * 0.32; arpR[i] += arpL[j] * 0.32;
    }
  }
  for (let i = 0; i < len; i++) { L[i] += arpL[i]; Rr[i] += arpR[i]; }
  await tick();
  // guzheng: phrases every two bars from bar 4, glissando runs into bars 0 and 8
  for (let bar = 4; bar < 16; bar += 2) {
    let beat = bar * 4 + (R() < 0.5 ? 0.5 : 1);
    let deg = 5 + Math.floor(R() * 4);
    const notes = 3 + Math.floor(R() * 3);
    for (let k = 0; k < notes; k++) {
      deg = Math.max(2, Math.min(12, deg + Math.floor(R() * 5) - 2));
      const midi = 57 + PENTA[deg % 5] + 12 * Math.floor(deg / 5);
      const s = ksPluck(sr, mtof(midi), 2.0, 0.6, R);
      const [gl, gr] = pan((R() * 2 - 1) * 0.4);
      mixInto(L, Rr, at(beat), s, gl * 0.2, gr * 0.2, R() < 0.4 ? -2 : 0, 0.07, k === notes - 1 ? 0.3 : 0);
      beat += [0.5, 0.5, 1, 0.75][Math.floor(R() * 4)];
    }
    await tick();
  }
  for (const endBeat of [MUSIC_BEATS, 32]) {
    for (let k = 0; k < 8; k++) {
      const midi = 57 + PENTA[k % 5] + 12 * Math.floor(k / 5);
      const s = ksPluck(sr, mtof(midi), 1.2, 0.6, R);
      const [gl, gr] = pan(-0.6 + k * 0.15);
      mixInto(L, Rr, at(endBeat - 1) + Math.floor(k * 0.055 * sr), s, gl * 0.13, gr * 0.13);
    }
  }
  // gong accents on bars 0 and 8
  for (const b of [0, 32]) {
    const n = Math.floor(4.5 * sr), s0 = at(b);
    const parts = [[1, 1], [1.48, 0.6], [2.1, 0.45], [2.74, 0.3], [3.6, 0.2]];
    const f0 = 98;
    for (const [r, a] of parts) {
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        ph += 2 * Math.PI * f0 * r * (1 - 0.012 * Math.min(1, t)) / sr;
        add(s0 + i, Math.sin(ph) * a * 0.08 * Math.exp(-t * 0.9) * Math.min(1, t * 80), 0.7, 0.7);
      }
    }
  }
  // soft clip
  for (let i = 0; i < len; i++) { L[i] = Math.tanh(L[i] * 1.1) * 0.85; Rr[i] = Math.tanh(Rr[i] * 1.1) * 0.85; }
  return [L, Rr];
}

// Procedural room/plate impulse response for the reverb bus.
function makeImpulse(ac, seconds, decay, seed) {
  const sr = ac.sampleRate, n = Math.floor(seconds * sr);
  const buf = ac.createBuffer(2, n, sr);
  const R = rng(seed);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      lp += ((R() * 2 - 1) - lp) * (0.6 - 0.45 * Math.min(1, t / seconds));
      d[i] = lp * Math.exp(-t / decay) * Math.min(1, t / 0.008);
    }
  }
  return buf;
}

function stereoBuffer(ac, [L, R]) {
  const buf = ac.createBuffer(2, L.length, ac.sampleRate);
  buf.copyToChannel(L, 0); buf.copyToChannel(R, 1);
  return buf;
}

// ---------------------------------------------------------------- positional source voices

const KIND_NAMES = ['train', 'cable', 'boat', 'drone', 'aircraft'];
const KINDS = {
  train:    { pool: 3, ref: 25, maxD: 1600, level: 0.9 },
  cable:    { pool: 2, ref: 12, maxD: 700,  level: 0.5 },
  boat:     { pool: 3, ref: 20, maxD: 1000, level: 0.6 },
  drone:    { pool: 3, ref: 6,  maxD: 350,  level: 0.35 },
  aircraft: { pool: 2, ref: 160, maxD: 6000, level: 0.55 },
};

export default {
  name: 'audio',
  ac: null,
  ready: false,
  muted: false,

  start(ctx) {
    if (this.ac) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ac = new AC({ latencyHint: 'playback' });
    } catch (e) { console.warn('Audio unavailable:', e); return; }
    if (this.ac.state !== 'running') this.ac.resume();
    this._build(ctx).catch((e) => console.error('Audio init failed:', e));
  },

  toggleMute() {
    if (!this.ac) return;
    this.muted = !this.muted;
    const t = this.ac.currentTime;
    this.out.gain.cancelAndHoldAtTime(t);
    this.out.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.06);
  },

  // ---------------------------------------------------------------- graph construction (start only)

  _gain(v, dest) { const g = this.ac.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; },
  _filter(type, f, q, dest) {
    const b = this.ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q;
    if (dest) b.connect(dest); return b;
  },
  _loop(buf, dest, rate = 1, offset = 0) {
    const s = this.ac.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
    s.connect(dest); s.start(this.ac.currentTime + 0.02, offset % buf.duration); return s;
  },
  _osc(type, f, dest) {
    const o = this.ac.createOscillator(); o.type = type; o.frequency.value = f; o.connect(dest); o.start(); return o;
  },
  // smooth random modulation of an AudioParam: param += control * depth
  _mod(param, depth, rate, seed) {
    const s = this.ac.createBufferSource(); s.buffer = this.ctrl[seed % this.ctrl.length]; s.loop = true;
    s.playbackRate.value = rate;
    const g = this._gain(depth); s.connect(g); g.connect(param);
    s.start(this.ac.currentTime + 0.02, (seed * 1.7) % 10);
    return g;
  },

  async _build(ctx) {
    const ac = this.ac;
    const t0 = ac.currentTime;
    // master chain
    this.out = this._gain(0, ac.destination);
    this.out.gain.setTargetAtTime(1, t0 + 0.1, 0.6);   // fade in
    const lim = ac.createDynamicsCompressor();
    lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;
    lim.connect(this.out);
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.015; comp.release.value = 0.3;
    comp.connect(lim);
    this.master = this._gain(0.85, comp);
    this.reverb = ac.createConvolver();
    this.reverb.buffer = makeImpulse(ac, 3.2, 0.75, 55);
    this.reverbIn = this._gain(1, this.reverb);
    this.reverb.connect(this._gain(0.55, this.master));
    const bus = (v, rev) => { const g = this._gain(v, this.master); if (rev) g.connect(this._gain(rev, this.reverbIn)); return g; };

    // shared material
    this.white = makeNoise(ac, 5.3, 'white', 1);
    this.pink = makeNoise(ac, 7.1, 'pink', 2);
    this.brown = makeNoise(ac, 9.7, 'brown', 3);
    this.ctrl = [makeControl(ac, 16, 2, 11), makeControl(ac, 19, 1, 12), makeControl(ac, 23, 3, 13), makeControl(ac, 13, 0.7, 14)];
    const now = ac.currentTime;

    // ---------- city bed
    this.cityBus = bus(0, 0.15);
    const rumbleLP = this._filter('lowpass', 140, 0.7, this._gain(0.55, this.cityBus));
    this._loop(this.brown, rumbleLP, 1, 0);
    const hum = this._gain(0.012, this.cityBus);
    this._osc('sine', 50, hum); this._osc('sine', 100, this._gain(0.5, hum));
    // traffic wash: two decorrelated bands, slowly breathing, spread in stereo
    for (let k = 0; k < 2; k++) {
      const p = ac.createStereoPanner(); p.pan.value = k ? 0.55 : -0.55; p.connect(this.cityBus);
      const g = this._gain(0.16, p);
      const lp = this._filter('lowpass', 1600, 0.5, g);
      const bp = this._filter('bandpass', 520 + k * 180, 0.45, lp);
      this._loop(this.pink, bp, 1, k * 2.3);
      this._mod(g.gain, 0.08, 0.4 + k * 0.17, 1 + k);
      this._mod(bp.frequency, 180, 0.3 + k * 0.1, 2 + k);
    }
    // horns: two detuned saws through a low-pass, envelope-gated
    this.hornPan = ac.createStereoPanner(); this.hornPan.connect(this.cityBus);
    this.hornLP = this._filter('lowpass', 1400, 0.9, this.hornPan);
    this.hornG = this._gain(0, this.hornLP);
    this.hornOsc = [this._osc('sawtooth', 392, this.hornG), this._osc('sawtooth', 494, this.hornG)];
    this.nextHorn = now + 4;
    // siren: triangle wail through a band-pass
    this.sirenPan = ac.createStereoPanner(); this.sirenPan.connect(this.cityBus);
    const sirenBP = this._filter('bandpass', 950, 0.9, this.sirenPan);
    this.sirenLP = this._filter('lowpass', 1800, 0.7, sirenBP);
    this.sirenG = this._gain(0, this.sirenLP);
    this.sirenOsc = this._osc('triangle', 760, this.sirenG);
    this.sirenLFO = this._osc('sine', 0.28, this._gain(230, this.sirenOsc.frequency));
    this.nextSiren = now + 25;
    this.sirenEnd = 0;
    // crowd murmur: pink noise through three wandering vowel formants with syllable-rate modulation
    this.crowdBus = bus(0, 0.25);
    const crowdLP = this._filter('lowpass', 3200, 0.5, this.crowdBus);
    for (let k = 0; k < 3; k++) {
      const f = [520, 1350, 2500][k];
      const g = this._gain([0.5, 0.35, 0.15][k], crowdLP);
      const bp = this._filter('bandpass', f, 4 + k * 2, g);
      this._loop(this.pink, bp, 1, 1.1 + k);
      this._mod(bp.frequency, f * 0.25, 2.2 + k * 0.7, 3 + k);
      this._mod(g.gain, 0.35, 3.5 + k * 1.3, k);
    }

    // ---------- weather
    this.rainBus = bus(0, 0.1);
    const rainHP = this._filter('highpass', 1100, 0.5, this._filter('lowpass', 9000, 0.5, this._gain(0.55, this.rainBus)));
    this._loop(this.white, rainHP, 1, 0.7);
    const rainBody = this._filter('bandpass', 2200, 0.6, this._gain(0.5, this.rainBus));
    this._loop(this.pink, rainBody, 1, 3.3);
    this._mod(rainBody.frequency, 500, 0.6, 2);
    // individual drops: sparse random ticks (rendered once)
    {
      const sr = ac.sampleRate, n = Math.floor(3.7 * sr);
      const L = new Float32Array(n), Rr = new Float32Array(n);
      const R = rng(808);
      for (let k = 0; k < 340; k++) {
        const s0 = Math.floor(R() * n), f = 1800 + R() * 4200, w = 2 * Math.PI * f / sr, a = 0.05 + R() * 0.2;
        const [gl, gr] = pan(R() * 2 - 1);
        const len = Math.floor(sr * 0.012);
        for (let i = 0; i < len; i++) { const v = Math.sin(w * i) * Math.exp(-i / (sr * 0.0025)) * a; const j = (s0 + i) % n; L[j] += v * gl; Rr[j] += v * gr; }
      }
      this._loop(stereoBuffer(ac, [L, Rr]), this._gain(0.6, this.rainBus));
    }
    // water lapping and gurgling near the banks
    this.waterBus = bus(0, 0.2);
    const lapLP = this._filter('lowpass', 420, 0.8, this._gain(0.9, this.waterBus));
    const lapG = this._gain(0.7, lapLP);
    this._loop(this.brown, lapG, 1.3, 4.1);
    this._mod(lapG.gain, 0.55, 1.6, 1);
    const gurg = this._filter('bandpass', 650, 9, this._gain(0.35, this.waterBus));
    this._loop(this.white, gurg, 1, 2.2);
    this._mod(gurg.frequency, 330, 3.2, 2);
    // wind at altitude (whistling band) and the whoosh of fast flight
    this.windBus = bus(0, 0.05);
    const windBP = this._filter('bandpass', 520, 1.4, this._gain(0.9, this.windBus));
    this._loop(this.pink, windBP, 1, 5.5);
    this._mod(windBP.frequency, 260, 0.35, 3);
    const windLow = this._filter('lowpass', 260, 0.6, this._gain(0.8, this.windBus));
    this._loop(this.brown, windLow, 1.6, 1.0);
    this.whooshBus = bus(0, 0);
    this.whooshLP = this._filter('lowpass', 400, 0.7, this.whooshBus);
    this._loop(this.white, this.whooshLP, 1, 0.3);

    // ---------- footsteps (two alternating voices: thud + wet splash)
    this.stepBus = bus(0.9, 0.06);
    this.steps = [0, 1].map((k) => {
      const p = ac.createStereoPanner(); p.pan.value = k ? 0.12 : -0.12; p.connect(this.stepBus);
      const thudG = this._gain(0, p);
      const thud = this._filter('bandpass', 380, 1.2, thudG);
      this._loop(this.white, thud, 1, k * 1.3);
      const wetG = this._gain(0, p);
      const wet = this._filter('highpass', 2600, 0.8, this._filter('bandpass', 4200, 0.9, wetG));
      this._loop(this.white, wet, 1, 2 + k);
      return { thudG, thud, wetG };
    });
    this.stepIdx = 0; this.stepAcc = 0;

    // ---------- districts
    this.gardenBus = bus(0, 0.3);
    this.steppeBus = bus(0, 0.35);
    this.districtIdx = { garden: DISTRICTS.findIndex((d) => d.type === DT.GARDEN), steppe: DISTRICTS.findIndex((d) => d.type === DT.STEPPE) };
    this.crowdW = DISTRICTS.map((d) => d.type === DT.STEPPE ? 1 : d.type === DT.HILLSIDE ? 0.8 : d.type === DT.BUND ? 0.7 : d.type === DT.URBAN ? 0.45 : d.type === DT.CBD ? 0.35 : 0);
    this.cityW = DISTRICTS.map((d) => d.type === DT.GARDEN ? 0.15 : d.type === DT.STEPPE ? 0.6 : 1);
    // morin khuur: two bowed strings a fourth apart (sawtooth) through body/formant filters, with vibrato
    {
      const out = this._gain(0.9, this.steppeBus);
      const body = this._filter('lowpass', 3200, 0.6, out);
      const f1 = this._filter('peaking', 280, 2.5, body); f1.gain.value = 7;
      const f2 = this._filter('peaking', 950, 4, f1); f2.gain.value = 6;
      const f3 = this._filter('peaking', 2400, 5, f2); f3.gain.value = 4;
      this.fiddleG = this._gain(0, f3);
      this._mod(this.fiddleG.gain, 0.05, 0.5, 3);     // bow pressure
      this.fiddleLow = this._osc('sawtooth', mtof(45), this._gain(0.35, this.fiddleG));
      this.fiddleHigh = this._osc('sawtooth', mtof(50), this._gain(0.6, this.fiddleG));
      const vib = this._osc('sine', 5.3, this._gain(4.5, this.fiddleHigh.frequency));
      this._osc('sine', 4.9, this._gain(2.0, this.fiddleLow.frequency));
      this.vibOsc = vib;
      this.nextFiddle = now + 2; this.fiddlePhrase = 0;
    }
    // overtone singing: low drone voice with a narrow resonance picking out harmonics 6..12 (whistle melody)
    {
      const f0 = 98;
      this.throatF0 = f0;
      const voice = this._gain(1, null);
      this.throatOsc = this._osc('sawtooth', f0, voice);
      this._osc('sine', 4.2, this._gain(0.6, this.throatOsc.frequency));
      const drone = this._filter('bandpass', 420, 2, this._gain(0.25, this.steppeBus));
      voice.connect(drone);
      this.whistle = this._filter('bandpass', f0 * 8, 38, this._gain(1.6, this.steppeBus));
      voice.connect(this.whistle);
      this.nextOvertone = now + 1;
    }

    // ---------- positional sources
    this.pools = {};
    this.listenerV = [0, 0, 0];
    this.selIdx = new Int32Array(8); this.selD = new Float32Array(8);

    // ---------- music bus (light show), with distance muffling
    this.musicLP = this._filter('lowpass', 18000, 0.5, null);
    this.musicBus = bus(0, 0.12);
    this.musicLP.connect(this.musicBus);
    this.music = null; this.musicT0 = 0; this.musicNext = null;

    this.ready = true;
    // render the longer material progressively (the beds above already play)
    const sr = ac.sampleRate;
    const insects = stereoBuffer(ac, await renderInsects(sr));
    this.insectsSrc = this._loop(insects, this._gain(0.9, this.gardenBus));
    const chimes = stereoBuffer(ac, await renderChimes(sr));
    this._loop(chimes, this._gain(0.8, this.gardenBus));
    const phrases = stereoBuffer(ac, await renderGardenPhrases(sr));
    this._loop(phrases, this._gain(1.0, this.gardenBus), 1, 3);
    this.musicBuf = stereoBuffer(ac, await renderMusic(sr));
  },

  // ---------------------------------------------------------------- per-frame

  _set(param, v, tc) { param.setTargetAtTime(v, this.ac.currentTime, tc); },

  _voice(kind) {
    // one synthesized voice per kind of positional source (created lazily when that kind first appears)
    const ac = this.ac, K = KINDS[kind];
    const pn = ac.createPanner();
    pn.panningModel = 'HRTF'; pn.distanceModel = 'inverse';
    pn.refDistance = K.ref; pn.maxDistance = 20000; pn.rolloffFactor = 1.1;
    pn.connect(this.master);
    const out = this._gain(0, pn);
    const v = { kind, pn, out, src: -1, state: 0, freeAt: 0, oscs: [], noises: [], clack: null, whine: null };
    const noise = (buf, f, type, q, g, rate, off) => {
      const fl = this._filter(type, f, q, this._gain(g, out));
      v.noises.push(this._loop(buf, fl, rate, off));
      return fl;
    };
    if (kind === 'train') {
      noise(this.brown, 260, 'lowpass', 0.7, 0.9, 1, 1.7);
      const clackG = this._gain(0, null);
      clackG.connect(this._filter('bandpass', 1700, 1.2, this._gain(1.2, out)));
      v.noises.push(this._loop(this.white, clackG, 1, 0.4));
      // pulse train: two impulses per bogie period ("clack-clack")
      const N = 24, re = new Float32Array(N + 1), im = new Float32Array(N + 1);
      for (let k = 1; k <= N; k++) { re[k] = 1 + Math.cos(2 * Math.PI * k * 0.17); im[k] = Math.sin(2 * Math.PI * k * 0.17); }
      const clk = ac.createOscillator(); clk.setPeriodicWave(ac.createPeriodicWave(re, im)); clk.frequency.value = 1;
      clk.connect(this._gain(0.9, clackG.gain)); clk.start();
      v.clack = clk;
      const whineG = this._gain(0.06, this._filter('lowpass', 1500, 1, out));
      v.whine = this._osc('sawtooth', 220, whineG);
      v.oscs.push(v.whine, this._osc('triangle', 331, whineG));
    } else if (kind === 'cable') {
      const g = this._gain(0.18, out);
      v.oscs.push(this._osc('triangle', 92, g), this._osc('sine', 184.6, g));
      noise(this.pink, 240, 'bandpass', 3, 0.5, 1, 2.2);
    } else if (kind === 'boat') {
      const eng = this._gain(0.0, this._filter('lowpass', 220, 0.9, out));
      v.oscs.push(this._osc('sawtooth', 46, this._gain(0.5, eng)));
      eng.gain.value = 0.35;
      v.oscs.push(this._osc('sine', 7.5, this._gain(0.3, eng.gain)));
      noise(this.brown, 520, 'lowpass', 0.7, 0.5, 1.4, 3.1);
    } else if (kind === 'drone') {
      const g = this._gain(0.07, this._filter('highpass', 300, 0.7, this._filter('bandpass', 900, 0.8, out)));
      for (let k = 0; k < 4; k++) v.oscs.push(this._osc('sawtooth', 175 + k * 9.3, g));
      noise(this.white, 3000, 'bandpass', 0.8, 0.1, 1, k0(kind));
    } else {
      noise(this.brown, 220, 'lowpass', 0.7, 1.0, 1, 0.9);
      noise(this.pink, 1100, 'bandpass', 0.7, 0.45, 1, 5.1);
    }
    return v;
  },

  _positional(ctx, now, lx, ly, lz) {
    const src = ctx.world.audioSources;
    const lv = this.listenerV;
    const count = src ? src.length : 0;
    for (let ki = 0; ki < KIND_NAMES.length; ki++) {
      const kind = KIND_NAMES[ki], K = KINDS[kind];
      // nearest sources of this kind (insertion into a small sorted list)
      let n = 0;
      const sel = this.selIdx, sd = this.selD;
      for (let i = 0; i < count; i++) {
        const s = src[i];
        if (!s || s.kind !== kind) continue;
        const dx = s.x - lx, dy = s.y - ly, dz = s.z - lz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (!(d < K.maxD)) continue;
        let j = Math.min(n, K.pool);
        if (j === K.pool && d >= sd[K.pool - 1]) continue;
        if (j === K.pool) j--;
        while (j > 0 && sd[j - 1] > d) { sd[j] = sd[j - 1]; sel[j] = sel[j - 1]; j--; }
        sd[j] = d; sel[j] = i;
        if (n < K.pool) n++;
      }
      let pool = this.pools[kind];
      if (!pool) {
        if (n === 0) continue;
        pool = this.pools[kind] = [];
        for (let k = 0; k < K.pool; k++) pool.push(this._voice(kind));
      }
      // release voices whose source is no longer selected
      for (let pi = 0; pi < pool.length; pi++) {
        const v = pool[pi];
        let keep = false;
        for (let j = 0; j < n; j++) if (sel[j] === v.src) { keep = true; break; }
        if (v.state === 1 && !keep) { v.state = 2; v.freeAt = now + 0.6; this._set(v.out.gain, 0, 0.12); }
        if (v.state === 2 && now > v.freeAt) { v.state = 0; v.src = -1; }
      }
      // assign newly selected sources to free voices
      for (let j = 0; j < n; j++) {
        let has = false;
        for (let pi = 0; pi < pool.length; pi++) if (pool[pi].state === 1 && pool[pi].src === sel[j]) { has = true; break; }
        if (has) continue;
        for (let pi = 0; pi < pool.length; pi++) if (pool[pi].state === 0) {
          const v = pool[pi], s = src[sel[j]];
          v.state = 1; v.src = sel[j];
          v.pn.positionX.setValueAtTime(s.x, now); v.pn.positionY.setValueAtTime(s.y, now); v.pn.positionZ.setValueAtTime(s.z, now);
          break;
        }
      }
      // update the active voices: position, level, Doppler and speed-dependent sound
      for (let pi = 0; pi < pool.length; pi++) {
        const v = pool[pi];
        if (v.state !== 1) continue;
        const s = src[v.src];
        if (!s) { v.state = 2; v.freeAt = now + 0.6; this._set(v.out.gain, 0, 0.12); continue; }
        this._set(v.pn.positionX, s.x, 0.03); this._set(v.pn.positionY, s.y, 0.03); this._set(v.pn.positionZ, s.z, 0.03);
        const vx = s.vx || 0, vy = s.vy || 0, vz = s.vz || 0;
        const dx = s.x - lx, dy = s.y - ly, dz = s.z - lz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        // radial speed (positive = moving apart) -> Doppler factor
        const vr = ((vx - lv[0]) * dx + (vy - lv[1]) * dy + (vz - lv[2]) * dz) / d;
        const dop = clamp(343 / (343 + clamp(vr, -150, 150)), 0.6, 1.6);
        const cents = 1200 * Math.log2(dop);
        for (let k = 0; k < v.oscs.length; k++) this._set(v.oscs[k].detune, cents, 0.06);
        for (let k = 0; k < v.noises.length; k++) this._set(v.noises[k].playbackRate, dop * (k === 0 && kind === 'boat' ? 1.4 : 1), 0.06);
        const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
        if (v.clack) this._set(v.clack.frequency, Math.max(0.2, speed / 13), 0.2);
        if (v.whine) this._set(v.whine.frequency, 120 + speed * 7, 0.3);
        const g = (s.gain === undefined ? 1 : s.gain) * K.level * (kind === 'train' ? smoothstep(0, 6, speed) * 0.7 + 0.3 : 1);
        this._set(v.out.gain, g, 0.15);
      }
    }
  },

  _musicUpdate(ctx, now, cx, cz) {
    const show = ctx.show;
    const prox = 1 - smoothstep(350, 2600, Math.hypot(cx - BUND[0], cz - BUND[1]));
    const target = show.intensity * (0.15 + 0.85 * prox) * 0.75;
    this._set(this.musicBus.gain, target, 0.4);
    this._set(this.musicLP.frequency, 900 + 17000 * prox * prox, 0.4);
    if (!this.musicBuf) return;
    const loopLen = this.musicBuf.duration;
    const want = ((show.time % loopLen) + loopLen) % loopLen;
    if (show.intensity > 0) {
      let drift = 1;
      if (this.music) {
        const pos = ((now - this.musicT0) % loopLen + loopLen) % loopLen;
        drift = Math.abs(pos - want); drift = Math.min(drift, loopLen - drift);
      }
      // (re)start in sync with the show beat when needed (not while the scene clock is frozen); crossfade
      if (!this.music || (drift > 0.06 && ctx.dt > 0)) {
        if (this.music) { const old = this.music; old.g.gain.setTargetAtTime(0, now, 0.05); old.s.stop(now + 0.4); }
        const s = this.ac.createBufferSource(); s.buffer = this.musicBuf; s.loop = true;
        const g = this._gain(0, this.musicLP); s.connect(g);
        const start = now + 0.03;
        s.start(start, (want + 0.03) % loopLen);
        g.gain.setTargetAtTime(1, start, 0.05);
        this.music = { s, g };
        this.musicT0 = start - (want + 0.03);
      }
    } else if (this.music && show.intensity <= 0) {
      const old = this.music; old.g.gain.setTargetAtTime(0, now, 0.3); old.s.stop(now + 2);
      this.music = null;
    }
  },

  update(ctx) {
    if (!this.ready) return;
    const ac = this.ac, now = ac.currentTime;
    const c = ctx.cam, w = ctx.world;
    if (!c) return;
    const dt = Math.max(ctx.dt, 1e-3);
    // listener
    const L = ac.listener;
    const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    if (L.positionX) {
      this._set(L.positionX, c.x, 0.02); this._set(L.positionY, c.y, 0.02); this._set(L.positionZ, c.z, 0.02);
      this._set(L.forwardX, -sy * cp, 0.02); this._set(L.forwardY, sp, 0.02); this._set(L.forwardZ, -cy * cp, 0.02);
      this._set(L.upX, sy * sp, 0.02); this._set(L.upY, cp, 0.02); this._set(L.upZ, cy * sp, 0.02);
    }
    const vel = ctx.camVel;
    this.listenerV[0] = vel[0]; this.listenerV[1] = vel[1]; this.listenerV[2] = vel[2];
    const speed = Math.hypot(vel[0], vel[1], vel[2]);
    const ground = Math.max(w.heightAt(c.x, c.z), 0);
    const alt = Math.max(0, c.y - ground);
    const low = 1 - smoothstep(25, 220, alt);      // near street level
    const high = smoothstep(40, 450, alt);

    // districts (no allocation: weights read directly)
    let city = 0.25, crowd = 0;
    for (let i = 0; i < DISTRICTS.length; i++) {
      const dw = w.districtWeight(i, c.x, c.z);
      city = Math.max(city, dw * this.cityW[i]);
      crowd = Math.max(crowd, dw * this.crowdW[i]);
    }
    const gardenW = w.districtWeight(this.districtIdx.garden, c.x, c.z) * low;
    const steppeW = w.districtWeight(this.districtIdx.steppe, c.x, c.z) * low;
    // from high up the whole city is a distant wash
    this._set(this.cityBus.gain, (0.33 * city + 0.15) * (1 - 0.4 * high) * (1 - 0.6 * gardenW), 0.5);
    this._set(this.crowdBus.gain, 1.1 * crowd * low * (1 - 0.4 * ctx.env.rain), 0.6);
    this._set(this.gardenBus.gain, 1.4 * gardenW, 0.8);
    this._set(this.steppeBus.gain, 0.5 * steppeW, 0.8);

    // weather
    const rain = ctx.env.rain;
    this._set(this.rainBus.gain, rain * 0.9 * (0.35 + 0.65 * low), 0.3);
    if ((this.wdFrame = (this.wdFrame || 0) + 1) % 6 === 0) this.waterD = w.waterDist(c.x, c.z);
    const water = (1 - smoothstep(8, 220, this.waterD === undefined ? 1e9 : this.waterD)) * (1 - smoothstep(10, 90, c.y));
    this._set(this.waterBus.gain, 0.4 * water, 0.5);
    this._set(this.windBus.gain, 0.08 + 0.45 * high, 0.8);
    const fast = smoothstep(10, 90, speed) * (ctx.controls && ctx.controls.flying ? 1 : 0.4);
    this._set(this.whooshBus.gain, 0.25 * fast, 0.25);
    this._set(this.whooshLP.frequency, 300 + speed * 35, 0.25);

    // footsteps: one step per stride while walking on the ground
    const ctl = ctx.controls;
    const hs = Math.hypot(vel[0], vel[2]);
    if (ctl && !ctl.flying && ctl.onGround && hs > 0.8) {
      this.stepAcc += hs * dt;
      const stride = hs > 8 ? 1.15 : 0.75;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        const v = this.steps[this.stepIdx ^= 1];
        const loud = clamp(hs / 6, 0.35, 1.1);
        const wet = clamp(ctx.env.wetness * 0.6 + rain, 0, 1.2);
        const t = now + 0.005;
        v.thud.frequency.setValueAtTime(260 + Math.random() * 260, t);
        v.thudG.gain.cancelAndHoldAtTime(t);
        v.thudG.gain.linearRampToValueAtTime(0.6 * loud, t + 0.006);
        v.thudG.gain.setTargetAtTime(0, t + 0.012, 0.035);
        v.wetG.gain.cancelAndHoldAtTime(t);
        v.wetG.gain.setValueAtTime(v.wetG.gain.value, t + 0.012);
        v.wetG.gain.linearRampToValueAtTime(0.3 * loud * wet, t + 0.02);
        v.wetG.gain.setTargetAtTime(0, t + 0.03, 0.05);
      }
    } else this.stepAcc = 0.6;

    // horns: short honks in small groups, somewhere in the city
    if (now > this.nextHorn) {
      const t = now + 0.01;
      this.hornPan.pan.setTargetAtTime(Math.random() * 1.6 - 0.8, t, 0.01);
      this.hornLP.frequency.setTargetAtTime(700 + Math.random() * 1200, t, 0.01);
      const f = 330 + Math.random() * 140;
      this.hornOsc[0].frequency.setValueAtTime(f, t); this.hornOsc[1].frequency.setValueAtTime(f * 1.26, t);
      const n = 1 + Math.floor(Math.random() * 3), a = (0.02 + Math.random() * 0.035) * city;
      let tt = t;
      this.hornG.gain.cancelAndHoldAtTime(t);
      for (let k = 0; k < n; k++) {
        const d = 0.12 + Math.random() * 0.35;
        this.hornG.gain.setTargetAtTime(a, tt, 0.012);
        this.hornG.gain.setTargetAtTime(0, tt + d, 0.025);
        tt += d + 0.12 + Math.random() * 0.15;
      }
      this.nextHorn = tt + 3 + Math.random() * 12;
    }
    // sirens: a distant wail passing by every so often
    if (now > this.nextSiren) {
      const t = now + 0.01, dur = 6 + Math.random() * 6;
      this.sirenLFO.frequency.setValueAtTime(0.18 + Math.random() * 0.25, t);
      this.sirenOsc.frequency.setValueAtTime(680 + Math.random() * 160, t);
      this.sirenPan.pan.setValueAtTime(Math.random() < 0.5 ? -0.8 : 0.8, t);
      this.sirenPan.pan.linearRampToValueAtTime(Math.random() * 1.2 - 0.6, t + dur);
      this.sirenLP.frequency.setValueAtTime(900 + Math.random() * 900, t);
      this.sirenG.gain.cancelAndHoldAtTime(t);
      this.sirenG.gain.setTargetAtTime(0.045 * (0.4 + 0.6 * city), t, 1.2);
      this.sirenG.gain.setTargetAtTime(0, t + dur, 1.5);
      this.nextSiren = t + dur + 30 + Math.random() * 50;
    }

    // Steppe: fiddle phrases (glides between pentatonic notes) and overtone melody
    if (steppeW > 0.01) {
      if (now > this.nextFiddle) {
        const deg = Math.floor(Math.random() * 8);
        const midi = 50 + PENTA[deg % 5] + 12 * Math.floor(deg / 5);
        const t = now + 0.02, dur = 1.2 + Math.random() * 2.8;
        this.fiddleHigh.frequency.setTargetAtTime(mtof(midi), t, 0.07);
        this.fiddleG.gain.setTargetAtTime(0.16 + Math.random() * 0.1, t, 0.25);
        this.fiddleG.gain.setTargetAtTime(0.05, t + dur * 0.7, 0.4);
        this.nextFiddle = t + dur + (Math.random() < 0.25 ? 1.5 + Math.random() * 2 : 0);
      }
      if (now > this.nextOvertone) {
        const h = [6, 8, 9, 10, 12, 10, 9, 8][Math.floor(Math.random() * 8)];
        this.whistle.frequency.setTargetAtTime(this.throatF0 * h, now, 0.12);
        this.nextOvertone = now + 0.8 + Math.random() * 1.6;
      }
    }

    this._positional(ctx, now, c.x, c.y, c.z);
    this._musicUpdate(ctx, now, c.x, c.z);
  },
};

function k0(kind) { return kind.length * 0.37; }
