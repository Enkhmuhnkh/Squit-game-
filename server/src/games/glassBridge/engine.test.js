import test from 'node:test';
import assert from 'node:assert/strict';
import { GlassBridgeEngine } from './GlassBridgeEngine.js';
import { GB } from './constants.js';

function setup(n = 3) {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, nickname: `P${i}` }));
  const e = new GlassBridgeEngine({ players });
  e.start();
  return e;
}
const other = (s) => (s === 'L' ? 'R' : 'L');

test('public state never leaks the bridge', () => {
  const e = setup();
  const json = JSON.stringify(e.getPublicState('p0'));
  assert.ok(!json.includes('"bridge"'));
  assert.deepEqual(e.getPublicState('p0').revealed.filter(Boolean), []);
});

test('only the current player can choose', () => {
  const e = setup();
  const cur = e.currentPlayerId;
  const wrong = e.turnOrder.find((id) => id !== cur);
  assert.throws(() => e.handleAction(wrong, { type: 'choose', side: 'L' }), { code: 'NOT_YOUR_TURN' });
});

test('opener of a new step is paid and advances', () => {
  const e = setup();
  const cur = e.currentPlayerId;
  e.handleAction(cur, { type: 'choose', side: e.bridge[0] });
  const p = e.players.get(cur);
  assert.equal(p.step, 1);
  assert.equal(p.balance, GB.START_BALANCE + GB.OPENER_REWARD);
});

test('walking an already-opened step is free: no reward', () => {
  const e = setup(3);
  const opener = e.currentPlayerId;
  e.handleAction(opener, { type: 'choose', side: e.bridge[0] }); // нээгч
  const follower = e.currentPlayerId;
  e.handleAction(follower, { type: 'choose', side: e.bridge[0] }); // өмнө нь нээгдсэн
  const f = e.players.get(follower);
  assert.equal(f.step, 1);
  assert.equal(f.balance, GB.START_BALANCE); // шагналгүй
});

test('failed opening reveals the step for others', () => {
  const e = setup(3);
  const opener = e.currentPlayerId;
  e.handleAction(opener, { type: 'choose', side: other(e.bridge[0]) });
  assert.equal(e.revealed[0], e.bridge[0]);
  const next = e.currentPlayerId;
  e.handleAction(next, { type: 'choose', side: e.bridge[0] });
  assert.equal(e.players.get(next).step, 1);
  assert.equal(e.players.get(next).alive, true);
});

test('wrong step eliminates and moves balance to death pool', () => {
  const e = setup();
  const cur = e.currentPlayerId;
  e.handleAction(cur, { type: 'choose', side: other(e.bridge[0]) });
  const p = e.players.get(cur);
  assert.equal(p.alive, false);
  assert.equal(p.balance, 0);
  assert.equal(e.deathPool, GB.START_BALANCE);
  assert.ok(!e.turnOrder.includes(cur));
});

test('shield saves once and costs $600', () => {
  const e = setup();
  const cur = e.currentPlayerId;
  e.handleAction(cur, { type: 'buy', item: 'shield' });
  assert.equal(e.players.get(cur).balance, GB.START_BALANCE - 600);
  e.handleAction(cur, { type: 'choose', side: other(e.bridge[0]) });
  const p = e.players.get(cur);
  assert.equal(p.alive, true);
  assert.equal(p.step, 0);
  assert.equal(p.items.shield, 0);
});

test('cheat reveals only to the buyer and costs $450', () => {
  const e = setup();
  const cur = e.currentPlayerId;
  e.handleAction(cur, { type: 'buy', item: 'cheat' });
  assert.equal(e.players.get(cur).balance, GB.START_BALANCE - 450);
  const { events } = e.handleAction(cur, { type: 'use', item: 'cheat' });
  const reveal = events.find((x) => x.type === 'gb:cheatReveal');
  assert.equal(reveal.to, cur);
  assert.equal(reveal.payload.safeSide, e.bridge[0]);
});

test('insufficient funds', () => {
  const e = setup();
  const cur = e.currentPlayerId;
  e.handleAction(cur, { type: 'buy', item: 'swap' }); // 600
  assert.throws(() => e.handleAction(cur, { type: 'buy', item: 'swap' }), { code: 'INSUFFICIENT_FUNDS' });
});

test('swap exchanges turn with a player behind', () => {
  const e = setup();
  const cur = e.currentPlayerId;
  const behind = e.turnOrder[1];
  e.handleAction(cur, { type: 'buy', item: 'swap' });
  e.handleAction(cur, { type: 'use', item: 'swap', targetId: behind });
  assert.equal(e.currentPlayerId, behind);
});

test('timeout auto-steps the current player', () => {
  let t = 1000;
  const players = [{ id: 'a', nickname: 'A' }, { id: 'b', nickname: 'B' }];
  const e = new GlassBridgeEngine({ players, now: () => t });
  e.start();
  const first = e.currentPlayerId;
  t += GB.TURN_MS + 1;
  e.tick();
  assert.notEqual(e.currentPlayerId, first);
});

test('full game: everyone crosses, finishes, death pool split to winners', () => {
  const e = setup(2);
  let guard = 0;
  while (!e.isFinished() && guard++ < 200) {
    const cur = e.currentPlayerId;
    const step = e.players.get(cur).step;
    e.handleAction(cur, { type: 'choose', side: e.bridge[step] });
  }
  assert.ok(e.isFinished());
  const r = e.getResult();
  assert.equal(r.players.every((p) => p.isWinner), true);
  assert.ok(r.ledger.length > 0);
});

test('last survivor wins the pool when others fall', () => {
  const e = setup(3);
  // Двоос бусад нь буруу гишгэнэ, үлдсэн хүн гүүрийг давна
  const survivor = e.currentPlayerId;
  let guard = 0;
  while (!e.isFinished() && guard++ < 500) {
    const cur = e.currentPlayerId;
    const step = e.players.get(cur).step;
    const side = cur === survivor ? e.bridge[step] : other(e.bridge[step]);
    e.handleAction(cur, { type: 'choose', side });
  }
  const r = e.getResult();
  const win = r.players.find((p) => p.id === survivor);
  assert.equal(win.isWinner, true);
  assert.equal(win.payout, 2 * GB.START_BALANCE);
});

test('nobody crosses: pool goes to the furthest player(s)', () => {
  const e = setup(3);
  // Хүн бүр өөрийн ээлжинд нээгч болж буруу гишгэнэ; гэхдээ эхлээд нэг нь хэдэн шат давуулна
  const ids = [...e.turnOrder];
  const hero = ids[0];
  // hero 3 шат нээнэ (бусад нь чөлөөтэй алхана), дараа нь бүгд унана
  let guard = 0;
  while (!e.isFinished() && guard++ < 300) {
    const cur = e.currentPlayerId;
    const step = e.players.get(cur).step;
    const stepOpen = e.revealed[step] === null;
    const heroTurn = cur === hero;
    // hero 3-р шат хүртэл зөв, дараа нь бүгд буруу сонгоно
    const correct = !stepOpen || (heroTurn && step < 3);
    e.handleAction(cur, { type: 'choose', side: correct ? e.bridge[step] : other(e.bridge[step]) });
  }
  assert.ok(e.isFinished());
  assert.equal(e.finishReason, 'furthest');
  const r = e.getResult();
  const paid = r.players.filter((p) => p.payout > 0);
  assert.ok(paid.length >= 1);
  const maxStep = Math.max(...r.players.map((p) => p.finalStep));
  assert.ok(paid.every((p) => p.finalStep === maxStep));
  // Death Pool бүтнээрээ олгогдсон: нийт олгосон = үхсэн тоглогчдын нийт алдагдал
  const lost = e.ledger.filter((t) => t.kind === 'death_pool_in').reduce((a, t) => a - t.amount, 0);
  assert.equal(Object.values(r.payouts).reduce((a, b) => a + b, 0), lost);
  assert.equal(r.deathPool, 0);
});

test('serialize/restore keeps the game identical and secret stays server-side', () => {
  const e = setup(4);
  for (let i = 0; i < 5; i++) {
    const cur = e.currentPlayerId;
    const step = e.players.get(cur).step;
    e.handleAction(cur, { type: 'choose', side: e.bridge[step] });
  }
  const snap = JSON.parse(JSON.stringify(e.serialize())); // JSON-оор дамжих ёстой
  const r = GlassBridgeEngine.restore(snap);
  assert.deepEqual(r.getPublicState('p0').players, e.getPublicState('p0').players);
  assert.deepEqual(r.bridge, e.bridge);
  assert.equal(r.currentPlayerId, e.currentPlayerId);
  // restore-ийн дараа тоглолт үргэлжилнэ
  const cur = r.currentPlayerId;
  const step = r.players.get(cur).step;
  r.handleAction(cur, { type: 'choose', side: r.bridge[step] });
  assert.ok(r.players.get(cur).step >= 1);
  // resume() ээлжийн хугацааг шинээр эхлүүлнэ
  const { events } = r.resume();
  assert.equal(events[0].type, 'gb:turn');
});

test('finished game exposes result in public state (for refresh)', () => {
  const e = setup(2);
  let guard = 0;
  while (!e.isFinished() && guard++ < 200) {
    const cur = e.currentPlayerId;
    e.handleAction(cur, { type: 'choose', side: e.bridge[e.players.get(cur).step] });
  }
  const pub = e.getPublicState('p0');
  assert.equal(pub.status, 'finished');
  assert.equal(pub.result.reason, 'crossed');
});

test('max players is 20', () => {
  assert.equal(GlassBridgeEngine.meta.maxPlayers, 20);
});
