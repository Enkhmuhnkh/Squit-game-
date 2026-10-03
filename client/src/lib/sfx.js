// Нэмэлт файлгүй, WebAudio-оор үүсгэсэн энгийн дуу.
let ctx = null;
const MUTE_KEY = 'partyhub.muted';

export function isMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

export function setMuted(muted) {
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* ignore */ }
}

function audio() {
  if (isMuted()) return null;
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Богино sine "beep". */
function beep({ freq, dur, type = 'sine', gain = 0.2, delay = 0 } = {}) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Шил хагарах: богино noise burst + доош чиглэсэн өнгө. */
export function playCrack() {
  const a = audio();
  if (!a) return;
  const len = Math.floor(a.sampleRate * 0.45);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1800;
  const gain = a.createGain();
  gain.gain.value = 0.5;
  src.connect(filter).connect(gain).connect(a.destination);
  src.start();
}

export function playStep() {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(520, a.currentTime);
  osc.frequency.exponentialRampToValueAtTime(780, a.currentTime + 0.12);
  gain.gain.setValueAtTime(0.18, a.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.18);
  osc.connect(gain).connect(a.destination);
  osc.start();
  osc.stop(a.currentTime + 0.2);
}

/** Ээлжийн сүүлийн 5 секундэд нэг удаа: богино "tick". */
export function playTick() {
  beep({ freq: 880, dur: 0.08, type: 'square', gain: 0.1 });
}

/** Item худалдаж авах. */
export function playPurchase() {
  beep({ freq: 660, dur: 0.1, type: 'triangle', gain: 0.15 });
  beep({ freq: 990, dur: 0.12, type: 'triangle', gain: 0.12, delay: 0.08 });
}

/** Item ашиглах. */
export function playUse() {
  beep({ freq: 420, dur: 0.1, type: 'sawtooth', gain: 0.12 });
}

/** Товч дарах жижиг "click". */
export function playClick() {
  beep({ freq: 1200, dur: 0.03, type: 'square', gain: 0.06 });
}

/** Тоглогч хасагдах мөч (Glass Bridge: шил хагарах, Red Light: буудуулах). */
export function playElimination() {
  const a = audio();
  if (!a) return;
  const len = Math.floor(a.sampleRate * 0.5);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2000, a.currentTime);
  filter.frequency.exponentialRampToValueAtTime(80, a.currentTime + 0.5);
  const gain = a.createGain();
  gain.gain.value = 0.4;
  src.connect(filter).connect(gain).connect(a.destination);
  src.start();
}

/** Ялалтын богино fanfare. */
export function playVictory() {
  [523, 659, 784, 1047].forEach((freq, i) => {
    beep({ freq, dur: 0.3, type: 'triangle', gain: 0.18, delay: i * 0.12 });
  });
}
