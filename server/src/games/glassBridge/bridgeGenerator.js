import { randomInt } from 'node:crypto';
import { GB } from './constants.js';

/** Криптографаар аюулгүй санамсаргүй гүүр: массивын index 0 = 1-р шат. */
export function generateBridge(steps = GB.STEPS) {
  return Array.from({ length: steps }, () => (randomInt(0, 2) === 0 ? 'L' : 'R'));
}

export function randomSide() {
  return randomInt(0, 2) === 0 ? 'L' : 'R';
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
