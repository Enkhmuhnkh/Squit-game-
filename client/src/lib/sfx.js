// Нэмэлт файлгүй, WebAudio-оор үүсгэсэн энгийн дуу.
let ctx = null;

function audio() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
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
