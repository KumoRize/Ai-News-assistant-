// Tiny Web Audio synth: every sound effect is generated in code (no audio files).
let ctx = null;
let enabled = true;

export function setSoundEnabled(on) { enabled = on; }

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ freq = 440, to = null, type = 'sine', dur = 0.12, vol = 0.12, delay = 0, attack = 0.005 }) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  tap: () => tone({ freq: 880, to: 1320, type: 'triangle', dur: 0.06, vol: 0.06 }),
  nav: () => tone({ freq: 520, to: 780, type: 'sine', dur: 0.09, vol: 0.07 }),
  pop: () => { tone({ freq: 300, to: 900, type: 'sine', dur: 0.12, vol: 0.1 }); },
  close: () => tone({ freq: 700, to: 300, type: 'sine', dur: 0.1, vol: 0.07 }),
  copy: () => { tone({ freq: 1200, type: 'square', dur: 0.04, vol: 0.04 }); tone({ freq: 1600, type: 'square', dur: 0.05, vol: 0.04, delay: 0.05 }); },
  success: () => [523, 659, 784].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.18, vol: 0.09, delay: i * 0.08 })),
  error: () => { tone({ freq: 220, type: 'sawtooth', dur: 0.15, vol: 0.06 }); tone({ freq: 180, type: 'sawtooth', dur: 0.2, vol: 0.06, delay: 0.12 }); },
  levelup: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.22, vol: 0.1, delay: i * 0.09 })),
  notify: () => { tone({ freq: 988, type: 'sine', dur: 0.25, vol: 0.1 }); tone({ freq: 1319, type: 'sine', dur: 0.35, vol: 0.1, delay: 0.14 }); },
  whoosh: () => tone({ freq: 200, to: 2000, type: 'sine', dur: 0.25, vol: 0.05 }),
  save: () => { tone({ freq: 660, type: 'triangle', dur: 0.08, vol: 0.08 }); tone({ freq: 990, type: 'triangle', dur: 0.12, vol: 0.08, delay: 0.07 }); },
};

export function play(name) {
  if (!enabled) return;
  try { SOUNDS[name]?.(); } catch { /* audio is a nice-to-have */ }
}
