import test from 'node:test';
import assert from 'node:assert/strict';
import { RedLightEngine } from './RedLightEngine.js';
import { RL } from './constants.js';

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

function setup(n = 2, now) {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, nickname: `P${i}` }));
  const e = new RedLightEngine({ players, now });
  e.start();
  return e;
}

test('GREEN үед move хийвэл progress нэмэгдэнэ', () => {
  const { now, advance } = clock();
  const e = setup(2, now);
  advance(1);
  e.handleAction('p0', { type: 'move' });
  assert.equal(e.players.get('p0').progress, RL.MOVE_STEP);
  assert.equal(e.players.get('p0').alive, true);
});

test('RED үед move хийвэл шууд хасагдаж, Death Pool руу орно', () => {
  const { now, advance } = clock();
  const e = setup(2, now);
  advance(1);
  e.light = 'RED';
  e.handleAction('p0', { type: 'move' });
  const p = e.players.get('p0');
  assert.equal(p.alive, false);
  assert.equal(p.balance, 0);
  assert.equal(e.deathPool, RL.START_BALANCE);
});

test('MIN_PULSE_GAP_MS-аас богино зайтай pulse-ийг үл тооно', () => {
  const { now, advance } = clock();
  const e = setup(2, now);
  advance(1);
  e.handleAction('p0', { type: 'move' });
  e.handleAction('p0', { type: 'move' }); // ижил цаг — gap=0 < MIN
  assert.equal(e.players.get('p0').progress, RL.MOVE_STEP);
});

test('хангалттай зайтай дараалсан pulse бүр тоологдоно', () => {
  const { now, advance } = clock();
  const e = setup(2, now);
  advance(RL.MIN_PULSE_GAP_MS + 1);
  e.handleAction('p0', { type: 'move' });
  advance(RL.MIN_PULSE_GAP_MS + 1);
  e.handleAction('p0', { type: 'move' });
  assert.equal(e.players.get('p0').progress, RL.MOVE_STEP * 2);
});

test('track дүүрэхэд finished болж, хасагдсан хүн байхгүй бол ялна', () => {
  const { now, advance } = clock();
  const e = setup(2, now);
  const pulses = Math.ceil(RL.TRACK_LENGTH / RL.MOVE_STEP);
  for (let i = 0; i < pulses; i++) {
    advance(RL.MIN_PULSE_GAP_MS + 1);
    e.handleAction('p0', { type: 'move' });
  }
  const p = e.players.get('p0');
  assert.equal(p.finished, true);
  assert.equal(p.progress, RL.TRACK_LENGTH);
});

test('бүх тоглогч finished/eliminated болмогц тоглоом автоматаар дуусна', () => {
  const { now, advance } = clock();
  const e = setup(2, now);
  advance(1);
  e.light = 'RED';
  e.handleAction('p1', { type: 'move' }); // p1 хасагдана

  const pulses = Math.ceil(RL.TRACK_LENGTH / RL.MOVE_STEP);
  for (let i = 0; i < pulses; i++) {
    advance(RL.MIN_PULSE_GAP_MS + 1);
    e.light = 'GREEN';
    e.handleAction('p0', { type: 'move' }); // p0 эцэст нь track дүүргэнэ
  }

  assert.equal(e.status, 'finished');
  assert.deepEqual(e.winnerIds, ['p0']);
  assert.equal(e.payouts.p0, RL.START_BALANCE); // p1-ийн үлдэгдэл бүхэлдээ p0-д
});

test('хасагдсан тоглогч дахин move хийхэд юу ч болохгүй (silent no-op)', () => {
  const { now, advance } = clock();
  const e = setup(3, now);
  advance(1);
  e.light = 'RED';
  e.handleAction('p0', { type: 'move' });
  assert.equal(e.players.get('p0').alive, false);

  advance(RL.MIN_PULSE_GAP_MS + 1);
  const { events } = e.handleAction('p0', { type: 'move' });
  assert.equal(events.length, 0);
  assert.equal(e.deathPool, RL.START_BALANCE); // давхар шимтгэгдээгүй
});

test('getResult() нь bridge талбаргүй — gameRepository.js-ийн guard-ыг идэвхжүүлнэ', () => {
  const { now, advance } = clock();
  const e = setup(2, now);
  advance(1);
  e.light = 'RED';
  e.handleAction('p0', { type: 'move' });
  e.handleAction('p1', { type: 'move' }); // хоёул хасагдаад тоглоом дуусна
  const result = e.getResult();
  assert.equal(result.bridge, undefined);
  assert.equal(result.players.length, 2);
});
