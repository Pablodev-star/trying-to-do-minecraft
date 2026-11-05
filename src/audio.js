// Synthesized sound effects and a gentle procedural ambient music (no audio files).
let ctx = null, master = null;
export const audio = { volume: 0.7 };

function ensure() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.connect(ctx.destination); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  master.gain.value = audio.volume;
  return ctx;
}
export function unlockAudio() { ensure(); }

let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; return s;
}
function burst({ freq = 1000, q = 1, dur = 0.12, vol = 0.3, type = 'bandpass', at = 0, pan = 0 }) {
  const n = noise();
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  const t = ctx.currentTime + at;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  n.connect(f); f.connect(g);
  if (p) { p.pan.value = pan; g.connect(p); p.connect(master); } else g.connect(master);
  n.start(t, Math.random() * 0.5); n.stop(t + dur + 0.05);
}
function tone({ freq = 440, freq2, dur = 0.2, vol = 0.2, type = 'sine', at = 0 }) {
  const o = ctx.createOscillator(); o.type = type;
  const g = ctx.createGain();
  const t = ctx.currentTime + at;
  o.frequency.setValueAtTime(freq, t);
  if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

const MAT = {
  stone: { freq: 1800, q: 1.2 }, wood: { freq: 600, q: 2 }, grass: { freq: 2600, q: 0.6 }, sand: { freq: 3200, q: 0.5 },
  glass: { freq: 4000, q: 3 }, wool: { freq: 900, q: 0.5 },
};

export function playSound(name, vol = 1) {
  if (!ensure() || audio.volume <= 0) return;
  const [kind, mat] = name.split(':');
  const m = MAT[mat] ?? MAT.stone;
  const r = 0.85 + Math.random() * 0.3;
  switch (kind) {
    case 'dig': burst({ freq: m.freq * r, q: m.q, dur: 0.08, vol: 0.18 * vol }); break;
    case 'step': burst({ freq: m.freq * 0.7 * r, q: m.q, dur: 0.06, vol: 0.08 * vol }); break;
    case 'place': burst({ freq: m.freq * 0.8 * r, q: m.q, dur: 0.1, vol: 0.25 * vol }); break;
    case 'break': burst({ freq: m.freq * r, q: m.q, dur: 0.18, vol: 0.35 * vol }); burst({ freq: m.freq * 0.6, q: m.q, dur: 0.12, vol: 0.2 * vol, at: 0.03 }); if (mat === 'glass') { tone({ freq: 2400, freq2: 1800, dur: 0.2, vol: 0.06, type: 'triangle' }); } break;
    case 'hurt': tone({ freq: 220 * r, freq2: 140, dur: 0.18, vol: 0.25, type: 'square' }); break;
    case 'hurt_mob': tone({ freq: 300 * r, freq2: 180, dur: 0.15, vol: 0.12 * vol, type: 'sawtooth' }); break;
    case 'death_mob': tone({ freq: 260 * r, freq2: 80, dur: 0.4, vol: 0.12 * vol, type: 'sawtooth' }); break;
    case 'pop': tone({ freq: 900 * r, freq2: 1400, dur: 0.06, vol: 0.12, type: 'sine' }); break;
    case 'eat': burst({ freq: 1500 * r, q: 0.8, dur: 0.07, vol: 0.15 }); break;
    case 'burp': tone({ freq: 140, freq2: 90, dur: 0.25, vol: 0.2, type: 'sawtooth' }); break;
    case 'explode': burst({ freq: 200, q: 0.3, dur: 1.2, vol: 0.9 * vol, type: 'lowpass' }); burst({ freq: 800, q: 0.5, dur: 0.4, vol: 0.4 * vol }); break;
    case 'fuse': burst({ freq: 5000, q: 0.5, dur: 0.3, vol: 0.12, type: 'highpass' }); break;
    case 'bow': tone({ freq: 500, freq2: 200, dur: 0.15, vol: 0.12, type: 'triangle' }); burst({ freq: 3000, q: 1, dur: 0.1, vol: 0.1 }); break;
    case 'fireball': burst({ freq: 400, q: 0.5, dur: 0.5, vol: 0.3 * vol, type: 'lowpass' }); break;
    case 'fizz': burst({ freq: 6000, q: 0.4, dur: 0.4, vol: 0.15, type: 'highpass' }); break;
    case 'click': tone({ freq: 1200, dur: 0.04, vol: 0.12, type: 'square' }); break;
    case 'levelup': [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.25, vol: 0.12, type: 'triangle', at: i * 0.08 })); break;
    case 'xp': tone({ freq: 1200 + Math.random() * 600, dur: 0.08, vol: 0.06, type: 'sine' }); break;
    case 'teleport': tone({ freq: 200, freq2: 900, dur: 0.3, vol: 0.12, type: 'sawtooth' }); break;
    case 'portal': tone({ freq: 120, freq2: 400, dur: 1.5, vol: 0.15, type: 'sine' }); break;
    case 'ignite': burst({ freq: 3000, q: 1, dur: 0.15, vol: 0.2 }); break;
    case 'bucket': burst({ freq: 700, q: 2, dur: 0.25, vol: 0.2 }); break;
    case 'door': burst({ freq: 400, q: 3, dur: 0.15, vol: 0.25 }); break;
    case 'land': burst({ freq: 500, q: 0.6, dur: 0.12, vol: 0.2 }); break;
    case 'throw': burst({ freq: 2500, q: 0.6, dur: 0.12, vol: 0.12, type: 'highpass' }); break;
    case 'shear': burst({ freq: 5000, q: 2, dur: 0.06, vol: 0.15 }); burst({ freq: 5000, q: 2, dur: 0.06, vol: 0.15, at: 0.08 }); break;
    case 'equip': tone({ freq: 700, freq2: 900, dur: 0.1, vol: 0.1, type: 'triangle' }); break;
    case 'craft': tone({ freq: 800, dur: 0.05, vol: 0.06, type: 'square' }); break;
    case 'trade': tone({ freq: 440, freq2: 600, dur: 0.2, vol: 0.1, type: 'triangle' }); break;
    case 'no': tone({ freq: 200, dur: 0.15, vol: 0.1, type: 'square' }); break;
    case 'crit': burst({ freq: 3000, q: 2, dur: 0.1, vol: 0.2 }); break;
    case 'break_tool': burst({ freq: 3500, q: 4, dur: 0.25, vol: 0.25 }); break;
    case 'glass': playSound('break:glass'); break;
    case 'anvil': tone({ freq: 1800, freq2: 1500, dur: 0.35, vol: 0.18, type: 'square' }); tone({ freq: 2700, dur: 0.25, vol: 0.08, type: 'triangle' }); break;
    case 'grind': burst({ freq: 2500, q: 2, dur: 0.4, vol: 0.2 }); break;
    case 'note': {
      const [, inst, m] = name.split(':');
      const f = 185 * Math.pow(2, Number(m) / 12);
      const type = { harp: 'triangle', bass: 'sawtooth', snare: 'square', click: 'square', bell: 'sine', guitar: 'sawtooth' }[inst] ?? 'triangle';
      if (inst === 'snare') burst({ freq: 3000, q: 0.6, dur: 0.12, vol: 0.2 });
      else tone({ freq: inst === 'bass' ? f / 4 : inst === 'bell' ? f * 2 : f, dur: inst === 'bell' ? 1.2 : 0.5, vol: 0.18, type });
      break;
    }
    case 'piston': burst({ freq: 400, q: 1.5, dur: 0.15, vol: 0.25 }); tone({ freq: 160, freq2: 120, dur: 0.1, vol: 0.1, type: 'square' }); break;
    case 'fire': burst({ freq: 1800 * r, q: 0.6, dur: 0.05, vol: 0.06 * vol }); burst({ freq: 900 * r, q: 0.5, dur: 0.2, vol: 0.05 * vol, type: 'lowpass', at: 0.04 }); break;
    case 'splash': burst({ freq: 1200 * r, q: 0.4, dur: 0.45, vol: 0.25 * vol, type: 'lowpass' }); burst({ freq: 4000, q: 0.5, dur: 0.25, vol: 0.12 * vol, type: 'highpass', at: 0.02 }); break;
    case 'lava_pop': tone({ freq: 160 * r, freq2: 420, dur: 0.07, vol: 0.12 * vol, type: 'sine' }); break;
    case 'portal_hum': tone({ freq: 90 * r, freq2: 140, dur: 2.2, vol: 0.05 * vol, type: 'sine' }); break;
    case 'rain': burst({ freq: 7000, q: 0.3, dur: 0.4, vol: 0.035 * vol, type: 'highpass' }); break;
    case 'thunder': burst({ freq: 120, q: 0.3, dur: 2.8, vol: 0.9 * vol, type: 'lowpass' }); burst({ freq: 400, q: 0.4, dur: 1.2, vol: 0.35 * vol, at: 0.05 }); burst({ freq: 90, q: 0.3, dur: 2.0, vol: 0.5 * vol, type: 'lowpass', at: 0.6 }); break;
    case 'dragon': tone({ freq: 90, freq2: 60, dur: 1.5, vol: 0.3, type: 'sawtooth' }); break;
    default: break;
  }
}

// --- very soft ambient piano-ish music (C418-inspired mood, original notes)
let musicTimer = null;
export function startMusic(getVol) {
  if (musicTimer) return;
  const scale = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3];
  const playPhrase = () => {
    if (!ensure() || audio.volume <= 0 || getVol() <= 0) return;
    const base = Math.random() < 0.5 ? 0.5 : 1;
    let at = 0;
    const n = 4 + ((Math.random() * 5) | 0);
    for (let i = 0; i < n; i++) {
      const f = scale[(Math.random() * scale.length) | 0] * base;
      tone({ freq: f, dur: 2.2, vol: 0.035, type: 'sine', at });
      tone({ freq: f * 2, dur: 1.4, vol: 0.01, type: 'triangle', at });
      at += 0.6 + Math.random() * 0.9;
    }
  };
  musicTimer = setInterval(() => { if (Math.random() < 0.35) playPhrase(); }, 12000);
}
