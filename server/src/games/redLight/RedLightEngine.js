import { GameError } from '../GameError.js';
import { RL } from './constants.js';

function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Улаан гэрэл, Ногоон гэрэл — цэвэр engine. Socket, DB-г мэдэхгүй.
 * Event хэлбэр: { to: 'room' | <playerId>, type, payload }
 *
 * Дүрэм:
 *  - Бүх тоглогч нэг progress track дээр 0 → TRACK_LENGTH хүртэл явна.
 *  - Light (gэрэл) GREEN ↔ RED ээлжлэн санамсаргүй хугацаагаар солигдоно — бүгдэд ил.
 *  - Тоглогч "move" илгээнэ: GREEN үед ахиц нэмэгдэнэ, RED үед ирвэл шууд хасагдана.
 *  - Раундын нийт хугацаа дуусахад хүрч амжаагүй амьд тоглогчид мөн хасагдана.
 *  - Хасагдсан тоглогчийн үлдэгдэл Death Pool руу; дуусахад track-ийг давсан (эсвэл
 *    хэн ч давсангүй бол хамгийн хол очсон) тоглогч(ид) Death Pool-ийг тэгш хуваана.
 */
export class RedLightEngine {
  static id = 'red-light-green-light';
  static meta = {
    id: 'red-light-green-light',
    name: 'Улаан гэрэл, Ногоон гэрэл',
    minPlayers: RL.MIN_PLAYERS,
    maxPlayers: RL.MAX_PLAYERS,
  };

  constructor({ players, now = () => Date.now() }) {
    this.now = now;
    this.status = 'idle'; // idle | running | finished
    this.light = 'GREEN'; // GREEN | RED — нууц биш, бүгдэд ил
    this.lightDeadline = null;
    this.roundDeadline = null;
    this.deathPool = 0;
    this.order = players.map((p) => p.id);
    this.payouts = {};
    this.winnerIds = [];
    this.finishReason = null; // 'crossed' | 'furthest' | 'none'
    this.finalResult = null;
    this.ledger = [];
    this.players = new Map();
    for (const p of players) {
      this.ledger.push({ playerId: p.id, kind: 'initial', item: null, amount: RL.START_BALANCE });
      this.players.set(p.id, {
        id: p.id,
        nickname: p.nickname,
        balance: RL.START_BALANCE,
        progress: 0,
        alive: true,
        finished: false,
        eliminatedAt: null,
        lastPulseAt: null,
      });
    }
  }

  // ───────────────────────── амьдралын мөчлөг ─────────────────────────

  start() {
    if (this.players.size < RL.MIN_PLAYERS) {
      throw new GameError('NOT_ENOUGH_PLAYERS', `Хамгийн багадаа ${RL.MIN_PLAYERS} тоглогч хэрэгтэй`);
    }
    this.status = 'running';
    this.roundDeadline = this.now() + RL.ROUND_MS;
    const events = [
      {
        to: 'room',
        type: 'game:started',
        payload: { trackLength: RL.TRACK_LENGTH, roundDeadline: this.roundDeadline, serverTime: this.now() },
      },
    ];
    events.push(...this.#beginLight('GREEN'));
    return { events };
  }

  isFinished() {
    return this.status === 'finished';
  }

  /** Hub-аас ~500мс тутам дуудна: gэрэл солих, раунд дуусахыг шалгана. */
  tick() {
    if (this.status !== 'running') return { events: [] };
    const now = this.now();
    const events = [];
    if (now >= this.roundDeadline) {
      events.push(...this.#finish());
      return { events };
    }
    if (this.lightDeadline !== null && now >= this.lightDeadline) {
      events.push(...this.#beginLight(this.light === 'GREEN' ? 'RED' : 'GREEN'));
    }
    return { events };
  }

  // ───────────────────────── үйлдлүүд ─────────────────────────

  handleAction(playerId, action) {
    if (this.status !== 'running') throw new GameError('NOT_RUNNING', 'Тоглоом явагдаагүй байна');
    const p = this.#player(playerId);

    switch (action?.type) {
      case 'move':
        return { events: this.#move(p) };
      default:
        throw new GameError('UNKNOWN_ACTION', 'Танигдаагүй үйлдэл');
    }
  }

  #move(p) {
    if (!p.alive || p.finished) return []; // хоцорсон pulse — чимээгүй үл тооно

    const now = this.now();
    if (p.lastPulseAt !== null && now - p.lastPulseAt < RL.MIN_PULSE_GAP_MS) return []; // хэт хурдан — хурд hack
    p.lastPulseAt = now;

    const events = [];

    if (this.light === 'RED') {
      p.alive = false;
      p.eliminatedAt = now;
      this.deathPool += p.balance;
      this.ledger.push({ playerId: p.id, kind: 'death_pool_in', item: null, amount: -p.balance });
      p.balance = 0;
      events.push({ to: 'room', type: 'rl:eliminated', payload: { playerId: p.id, progress: p.progress } });
    } else {
      p.progress = Math.min(RL.TRACK_LENGTH, p.progress + RL.MOVE_STEP);
      if (p.progress >= RL.TRACK_LENGTH) p.finished = true;
      events.push({
        to: 'room',
        type: 'rl:progress',
        payload: { playerId: p.id, progress: p.progress, finished: p.finished },
      });
    }

    if ([...this.players.values()].every((q) => !q.alive || q.finished)) {
      events.push(...this.#finish());
    }
    return events;
  }

  // ───────────────────────── гол логик ─────────────────────────

  #beginLight(color) {
    this.light = color;
    const [min, max] = color === 'GREEN' ? [RL.GREEN_MIN_MS, RL.GREEN_MAX_MS] : [RL.RED_MIN_MS, RL.RED_MAX_MS];
    this.lightDeadline = this.now() + randBetween(min, max);
    return [{ to: 'room', type: 'rl:light', payload: { light: this.light, deadline: this.lightDeadline, serverTime: this.now() } }];
  }

  #finish() {
    this.status = 'finished';
    this.lightDeadline = null;
    const all = [...this.players.values()];
    let winners = all.filter((p) => p.alive && p.finished);
    this.finishReason = 'crossed';
    if (winners.length === 0) {
      const maxProgress = Math.max(...all.map((p) => p.progress));
      winners = maxProgress > 0 ? all.filter((p) => p.progress === maxProgress) : [];
      this.finishReason = winners.length ? 'furthest' : 'none';
    }
    this.winnerIds = winners.map((w) => w.id);
    this.payouts = {};
    if (winners.length > 0 && this.deathPool > 0) {
      const share = Math.floor(this.deathPool / winners.length);
      let remainder = this.deathPool - share * winners.length;
      for (const w of winners) {
        const extra = remainder > 0 ? 1 : 0;
        remainder -= extra;
        const amount = share + extra;
        w.balance += amount;
        this.payouts[w.id] = amount;
        this.ledger.push({ playerId: w.id, kind: 'payout', item: null, amount });
      }
      this.deathPool = 0;
    }
    this.finalResult = {
      winners: this.winnerIds,
      payouts: this.payouts,
      reason: this.finishReason,
      trackLength: RL.TRACK_LENGTH,
    };
    return [
      { to: 'room', type: 'rl:balances', payload: this.#balances() },
      { to: 'room', type: 'rl:finished', payload: this.finalResult },
    ];
  }

  // ───────────────────────── туслахууд ─────────────────────────

  #player(id) {
    const p = this.players.get(id);
    if (!p) throw new GameError('NO_SUCH_PLAYER', 'Тоглогч олдсонгүй');
    return p;
  }

  #balances() {
    const balances = {};
    for (const p of this.players.values()) balances[p.id] = p.balance;
    return { balances, deathPool: this.deathPool };
  }

  // ───────────────────────── мэдээлэл гаргах ─────────────────────────

  getPublicState() {
    return {
      status: this.status,
      trackLength: RL.TRACK_LENGTH,
      light: this.light,
      lightDeadline: this.lightDeadline,
      roundDeadline: this.roundDeadline,
      serverTime: this.now(),
      deathPool: this.deathPool,
      players: [...this.players.values()].map((p, i) => ({
        id: p.id,
        nickname: p.nickname,
        seat: this.order.indexOf(p.id) + 1 || i + 1,
        balance: p.balance,
        progress: p.progress,
        alive: p.alive,
        finished: p.finished,
      })),
      result: this.finalResult,
    };
  }

  /** DB-д хадгалах эцсийн үр дүн — Glass Bridge-тэй ИЖИЛ хэлбэртэй тул gameRepository өөрчлөгдөхгүй. */
  getResult() {
    return {
      deathPool: this.deathPool,
      payouts: this.payouts,
      ledger: this.ledger,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        nickname: p.nickname,
        turnOrder: this.order.indexOf(p.id),
        finalStep: p.progress, // "step" баганыг progress-оор дахин ашиглав
        finalBalance: p.balance,
        eliminatedAt: p.eliminatedAt,
        isWinner: this.winnerIds.includes(p.id),
        payout: this.payouts[p.id] ?? 0,
      })),
    };
  }

  // ───────────────────────── хадгалалт (snapshot) ─────────────────────────

  serialize() {
    return {
      v: 1,
      status: this.status,
      light: this.light,
      lightDeadline: this.lightDeadline,
      roundDeadline: this.roundDeadline,
      deathPool: this.deathPool,
      order: this.order,
      payouts: this.payouts,
      winnerIds: this.winnerIds,
      finishReason: this.finishReason,
      finalResult: this.finalResult,
      ledger: this.ledger,
      players: [...this.players.values()],
    };
  }

  static restore(data, { now = () => Date.now() } = {}) {
    const e = new RedLightEngine({ players: [], now });
    e.status = data.status;
    e.light = data.light;
    e.lightDeadline = data.lightDeadline;
    e.roundDeadline = data.roundDeadline;
    e.deathPool = data.deathPool;
    e.order = data.order;
    e.payouts = data.payouts;
    e.winnerIds = data.winnerIds ?? [];
    e.finishReason = data.finishReason ?? null;
    e.finalResult = data.finalResult ?? null;
    e.ledger = data.ledger ?? [];
    e.players = new Map(data.players.map((p) => [p.id, { ...p }]));
    return e;
  }

  /** Server restart-ийн дараа дуудна: gэрлийг шинээр GREEN-ээр эхлүүлж, раундын цагийг сунгана. */
  resume() {
    if (this.status !== 'running') return { events: [] };
    const now = this.now();
    if (this.roundDeadline <= now) this.roundDeadline = now + RL.ROUND_MS;
    return { events: this.#beginLight('GREEN') };
  }
}
