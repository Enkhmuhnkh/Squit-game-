import { GameError } from '../GameError.js';
import { GB } from './constants.js';
import { ITEMS, ITEM_IDS } from './items.js';
import { generateBridge, randomSide, shuffle } from './bridgeGenerator.js';

/**
 * Шилэн гүүрийн цэвэр engine. Socket, DB-г мэдэхгүй.
 * Event хэлбэр: { to: 'room' | <playerId>, type, payload }
 *
 * Дүрэм (баримтаас гаргасан тайлбар):
 *  - Гүүр БҮХ тоглогчдод НЭГ. Шат нэг удаа туршигдмагц Safe тал нь бүгдэд ил болно.
 *  - Тоглогч бүр өөрийн ээлжинд өөрийн дараагийн шат руу L/R сонгоно.
 *  - Шагнал ($OPENER_REWARD) зөвхөн ШИНЭ шатыг амжилттай нээсэн хүнд. Өмнө нь
 *    нээгдсэн шатаар алхвал эрсдэлгүй, гэхдээ шагналгүй.
 *  - Алдвал үхэж, мөнгөө Death Pool руу өгнө.
 *  - Төгсгөл: 30-р шатыг давсан тоглогчид Death Pool-ийг тэгш хуваана. Хэн ч
 *    давсангүй бол хамгийн хол очсон тоглогч(ид) (унасан ч гэсэн) авна.
 */
export class GlassBridgeEngine {
  static id = 'glass-bridge';
  static meta = {
    id: 'glass-bridge',
    name: 'Шилэн гүүр',
    minPlayers: GB.MIN_PLAYERS,
    maxPlayers: GB.MAX_PLAYERS,
  };

  constructor({ players, now = () => Date.now() }) {
    this.now = now;
    this.status = 'idle'; // idle | running | finished
    this.bridge = generateBridge(); // НУУЦ — public state-д хэзээ ч орохгүй
    this.revealed = Array(GB.STEPS).fill(null); // нийтэд ил болсон Safe тал
    this.deathPool = 0;
    this.turnOrder = [];
    this.initialOrder = [];
    this.turnIdx = 0;
    this.deadline = null;
    this.payouts = {};
    this.winnerIds = [];
    this.finishReason = null; // 'crossed' | 'furthest' | 'none'
    this.finalResult = null; // gb:finished payload — refresh хийсэн тоглогчид дахин үзүүлнэ
    this.ledger = []; // мөнгөний бүх хөдөлгөөн -> DB transactions
    this.players = new Map();
    for (const p of players) {
      this.ledger.push({ playerId: p.id, kind: 'initial', item: null, amount: GB.START_BALANCE });
      this.players.set(p.id, {
        id: p.id,
        nickname: p.nickname,
        balance: GB.START_BALANCE,
        step: 0,
        alive: true,
        finished: false, // 30-р шатыг давсан
        items: Object.fromEntries(ITEM_IDS.map((i) => [i, 0])),
        eliminatedAt: null,
      });
    }
  }

  // ───────────────────────── амьдралын мөчлөг ─────────────────────────

  start() {
    if (this.players.size < GB.MIN_PLAYERS) {
      throw new GameError('NOT_ENOUGH_PLAYERS', `Хамгийн багадаа ${GB.MIN_PLAYERS} тоглогч хэрэгтэй`);
    }
    this.status = 'running';
    this.turnOrder = shuffle([...this.players.keys()]);
    this.initialOrder = [...this.turnOrder]; // turnOrder тоглолтын явцад богиносдог тул анхныг хадгална
    this.turnIdx = 0;
    const events = [
      { to: 'room', type: 'game:started', payload: { turnOrder: this.turnOrder, steps: GB.STEPS } },
    ];
    events.push(...this.#beginTurn());
    return { events };
  }

  isFinished() {
    return this.status === 'finished';
  }

  get currentPlayerId() {
    return this.turnOrder[this.turnIdx] ?? null;
  }

  /** Hub-аас ~500мс тутам дуудна: ээлжийн хугацаа дууссан бол автоматаар гишгүүлнэ. */
  tick() {
    if (this.status !== 'running' || this.deadline === null) return { events: [] };
    if (this.now() < this.deadline) return { events: [] };
    return { events: this.#step(this.currentPlayerId, randomSide(), { auto: true }) };
  }

  // ───────────────────────── үйлдлүүд ─────────────────────────

  handleAction(playerId, action) {
    if (this.status !== 'running') throw new GameError('NOT_RUNNING', 'Тоглоом явагдаагүй байна');
    const p = this.#player(playerId);

    switch (action?.type) {
      case 'choose':
        return { events: this.#choose(p, action.side) };
      case 'buy':
        return { events: this.#buy(p, action.item) };
      case 'use':
        return { events: this.#use(p, action.item, action.targetId) };
      default:
        throw new GameError('UNKNOWN_ACTION', 'Танигдаагүй үйлдэл');
    }
  }

  #choose(p, side) {
    if (side !== 'L' && side !== 'R') throw new GameError('BAD_SIDE', 'Зөвхөн L эсвэл R');
    this.#assertMyTurn(p);
    return this.#step(p.id, side);
  }

  #buy(p, item) {
    const def = ITEMS[item];
    if (!def) throw new GameError('UNKNOWN_ITEM', 'Ийм зүйл байхгүй');
    if (!p.alive || p.finished) throw new GameError('NOT_ACTIVE', 'Та худалдаж авах боломжгүй');
    if (p.balance < def.price) throw new GameError('INSUFFICIENT_FUNDS', 'Мөнгө хүрэлцэхгүй');
    p.balance -= def.price;
    p.items[item] += 1;
    this.ledger.push({ playerId: p.id, kind: 'item_purchase', item, amount: -def.price });
    return [
      { to: p.id, type: 'gb:inventory', payload: { items: { ...p.items } } },
      { to: 'room', type: 'gb:balances', payload: this.#balances() },
      { to: 'room', type: 'gb:purchase', payload: { playerId: p.id } }, // item нэрийг бусдад харуулахгүй
    ];
  }

  #use(p, item, targetId) {
    if (!ITEMS[item]) throw new GameError('UNKNOWN_ITEM', 'Ийм зүйл байхгүй');
    if (item === 'shield') throw new GameError('PASSIVE_ITEM', 'Shield автоматаар ажиллана');
    this.#assertMyTurn(p);
    if (p.items[item] < 1) throw new GameError('NO_ITEM', 'Танд энэ зүйл байхгүй');

    switch (item) {
      case 'cheat': return this.#useCheat(p);
      case 'extraTime': return this.#useExtraTime(p);
      case 'swap': return this.#useSwap(p, targetId);
      case 'push': return this.#usePush(p, targetId);
    }
    return [];
  }

  #useCheat(p) {
    const nextStep = p.step + 1;
    p.items.cheat -= 1;
    // Зөвхөн энэ тоглогчид — бусад хэнд ч очихгүй
    return [
      { to: p.id, type: 'gb:cheatReveal', payload: { step: nextStep, safeSide: this.bridge[nextStep - 1], ms: GB.CHEAT_REVEAL_MS } },
      { to: p.id, type: 'gb:inventory', payload: { items: { ...p.items } } },
    ];
  }

  #useExtraTime(p) {
    p.items.extraTime -= 1;
    this.deadline += GB.EXTRA_TIME_MS;
    return [
      { to: p.id, type: 'gb:inventory', payload: { items: { ...p.items } } },
      { to: 'room', type: 'gb:turn', payload: { playerId: p.id, deadline: this.deadline, serverTime: this.now() } },
    ];
  }

  #useSwap(p, targetId) {
    const t = this.#player(targetId);
    const myPos = this.turnIdx;
    const tPos = this.turnOrder.indexOf(t.id);
    if (t.id === p.id) throw new GameError('BAD_TARGET', 'Өөртэйгөө солих боломжгүй');
    if (tPos === -1 || tPos <= myPos) throw new GameError('BAD_TARGET', 'Зөвхөн ард байгаа тоглогчтой сольж болно');
    p.items.swap -= 1;
    [this.turnOrder[myPos], this.turnOrder[tPos]] = [this.turnOrder[tPos], this.turnOrder[myPos]];
    // Одоо ээлж t-д очно
    const events = [
      { to: p.id, type: 'gb:inventory', payload: { items: { ...p.items } } },
      { to: 'room', type: 'gb:swapped', payload: { from: p.id, to: t.id, turnOrder: this.turnOrder } },
    ];
    events.push(...this.#beginTurn());
    return events;
  }

  /** Push: урд байгаа (илүү өндөр шат дээрх) тоглогчийг санамсаргүй сонголтоор гишгүүлнэ.
   *  Тэр хүн өөрийн дараагийн шатыг туршина; танай ээлж үүгээр дуусна. */
  #usePush(p, targetId) {
    const t = this.#player(targetId);
    if (t.id === p.id) throw new GameError('BAD_TARGET', 'Өөрийгөө түлхэж болохгүй');
    if (!t.alive || t.finished) throw new GameError('BAD_TARGET', 'Энэ тоглогч түлхэгдэх боломжгүй');
    if (t.step <= p.step) throw new GameError('BAD_TARGET', 'Зөвхөн танаас урд (илүү өндөр шатан дээр) байгаа хүнийг түлхэнэ');
    p.items.push -= 1;
    const events = [
      { to: p.id, type: 'gb:inventory', payload: { items: { ...p.items } } },
      { to: 'room', type: 'gb:pushed', payload: { by: p.id, target: t.id } },
    ];
    events.push(...this.#step(t.id, randomSide(), { pushedBy: p.id, consumeTurnOf: p.id }));
    return events;
  }

  // ───────────────────────── гол логик ─────────────────────────

  /**
   * playerId-ийн дараагийн шатыг `side`-аар туршина.
   * consumeTurnOf: Push үед түлхэгчийн ээлжийг дуусгах.
   */
  #step(playerId, side, { auto = false, pushedBy = null, consumeTurnOf = null } = {}) {
    const p = this.players.get(playerId);
    const stepNo = p.step + 1;
    const safeSide = this.bridge[stepNo - 1];
    const safe = side === safeSide;
    const events = [];

    const opened = this.revealed[stepNo - 1] === null; // энэ шатыг анх удаа туршиж байна уу?
    this.revealed[stepNo - 1] = safeSide; // шат нэг удаа туршигдмагц нийтэд ил болно

    let shieldUsed = false;
    let eliminated = false;

    if (safe) {
      p.step = stepNo;
      if (opened) { // шагнал зөвхөн шинэ шат нээсэн хүнд
        p.balance += GB.OPENER_REWARD;
        this.ledger.push({ playerId: p.id, kind: 'step_reward', item: null, amount: GB.OPENER_REWARD });
      }
      if (p.step >= GB.STEPS) p.finished = true;
    } else if (p.items.shield > 0) {
      p.items.shield -= 1;
      shieldUsed = true; // амьд үлдэнэ, гэхдээ шат ахихгүй
      events.push({ to: p.id, type: 'gb:inventory', payload: { items: { ...p.items } } });
    } else {
      eliminated = true;
      p.alive = false;
      p.eliminatedAt = this.now();
      this.deathPool += p.balance;
      this.ledger.push({ playerId: p.id, kind: 'death_pool_in', item: null, amount: -p.balance });
      p.balance = 0;
    }

    events.push({
      to: 'room',
      type: 'gb:stepResult',
      payload: {
        playerId: p.id, step: stepNo, side, safe, safeSide,
        eliminated, shieldUsed, finished: p.finished, auto, pushedBy,
        opened, newStep: p.step,
      },
    });
    events.push({ to: 'room', type: 'gb:balances', payload: this.#balances() });

    // Ээлжийг ахиулах
    const turnOwner = consumeTurnOf ?? playerId;
    events.push(...this.#advanceTurnAfter(turnOwner));
    return events;
  }

  #advanceTurnAfter(turnOwnerId) {
    const events = [];
    const ownerPos = this.turnOrder.indexOf(turnOwnerId);

    // Идэвхгүй болсон (үхсэн/давсан) тоглогчдыг жагсаалтаас хасна
    const ownerWasCurrent = ownerPos === this.turnIdx;
    this.turnOrder = this.turnOrder.filter((id) => {
      const q = this.players.get(id);
      return q.alive && !q.finished;
    });

    if (this.turnOrder.length === 0) return [...events, ...this.#finish()];

    if (ownerWasCurrent) {
      const stillIn = this.turnOrder.indexOf(turnOwnerId);
      this.turnIdx = stillIn === -1
        ? Math.min(ownerPos, this.turnOrder.length - 1) // хассан бол дараагийн хүн тэр индекс дээр орж ирнэ
        : (stillIn + 1) % this.turnOrder.length;
    } else {
      this.turnIdx = Math.min(this.turnIdx, this.turnOrder.length - 1);
    }
    events.push(...this.#beginTurn());
    return events;
  }

  #beginTurn() {
    this.deadline = this.now() + GB.TURN_MS;
    return [{ to: 'room', type: 'gb:turn', payload: { playerId: this.currentPlayerId, deadline: this.deadline, serverTime: this.now() } }];
  }

  #finish() {
    this.status = 'finished';
    this.deadline = null;
    const all = [...this.players.values()];
    let winners = all.filter((p) => p.alive && p.finished);
    this.finishReason = 'crossed';
    if (winners.length === 0) {
      // Хэн ч гүүрийг давсангүй: хамгийн хол очсон (унасан ч) тоглогч(ид) Death Pool-ийг авна
      const maxStep = Math.max(...all.map((p) => p.step));
      winners = maxStep > 0 ? all.filter((p) => p.step === maxStep) : [];
      this.finishReason = winners.length ? 'furthest' : 'none';
    }
    this.winnerIds = winners.map((w) => w.id);
    this.payouts = {};
    if (winners.length > 0 && this.deathPool > 0) {
      const share = Math.floor(this.deathPool / winners.length);
      let remainder = this.deathPool - share * winners.length;
      for (const w of winners) {
        const extra = remainder > 0 ? 1 : 0; // үлдэгдэл төгрөгийг эхний ялагчид
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
      // Тоглоом дууссан тул map-ийг нээж болно
      bridge: this.bridge,
    };
    return [
      { to: 'room', type: 'gb:balances', payload: this.#balances() },
      { to: 'room', type: 'gb:finished', payload: this.finalResult },
    ];
  }

  // ───────────────────────── туслахууд ─────────────────────────

  #player(id) {
    const p = this.players.get(id);
    if (!p) throw new GameError('NO_SUCH_PLAYER', 'Тоглогч олдсонгүй');
    return p;
  }

  #assertMyTurn(p) {
    if (this.currentPlayerId !== p.id) throw new GameError('NOT_YOUR_TURN', 'Таны ээлж биш байна');
  }

  #balances() {
    const balances = {};
    for (const p of this.players.values()) balances[p.id] = p.balance;
    return { balances, deathPool: this.deathPool };
  }

  // ───────────────────────── мэдээлэл гаргах ─────────────────────────

  /** Тухайн тоглогчид харуулж болох төлөв. this.bridge энд ХЭЗЭЭ Ч орохгүй. */
  getPublicState(forPlayerId) {
    return {
      status: this.status,
      steps: GB.STEPS,
      revealed: this.revealed,
      turnOrder: this.turnOrder,
      currentPlayerId: this.currentPlayerId,
      deadline: this.deadline,
      serverTime: this.now(),
      deathPool: this.deathPool,
      shop: ITEMS,
      players: [...this.players.values()].map((p, i) => ({
        id: p.id,
        nickname: p.nickname,
        seat: this.initialOrder.indexOf(p.id) + 1 || i + 1, // 3D дүрс дээрх дугаар
        balance: p.balance,
        step: p.step,
        alive: p.alive,
        finished: p.finished,
      })),
      result: this.finalResult, // дууссан бол үр дүн (refresh хийсэн тоглогчид дахин харуулна)
      me: forPlayerId && this.players.has(forPlayerId)
        ? { items: { ...this.players.get(forPlayerId).items } }
        : null,
    };
  }

  /** DB-д хадгалах эцсийн үр дүн. */
  getResult() {
    return {
      bridge: this.bridge,
      deathPool: this.deathPool,
      payouts: this.payouts,
      ledger: this.ledger,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        nickname: p.nickname,
        turnOrder: this.initialOrder.indexOf(p.id),
        finalStep: p.step,
        finalBalance: p.balance,
        eliminatedAt: p.eliminatedAt,
        isWinner: this.winnerIds.includes(p.id),
        payout: this.payouts[p.id] ?? 0,
      })),
    };
  }

  // ───────────────────────── хадгалалт (snapshot) ─────────────────────────

  /**
   * Тоглолтын бүх төлөвийг JSON болгоно (НУУЦ bridge-тэй) — зөвхөн серверийн
   * хадгалалтад (DB/файл) зориулсан, клиент рүү хэзээ ч явуулахгүй.
   */
  serialize() {
    return {
      v: 1,
      status: this.status,
      bridge: this.bridge,
      revealed: this.revealed,
      deathPool: this.deathPool,
      turnOrder: this.turnOrder,
      initialOrder: this.initialOrder,
      turnIdx: this.turnIdx,
      payouts: this.payouts,
      winnerIds: this.winnerIds,
      finishReason: this.finishReason,
      finalResult: this.finalResult,
      ledger: this.ledger,
      players: [...this.players.values()].map((p) => ({ ...p, items: { ...p.items } })),
    };
  }

  static restore(data, { now = () => Date.now() } = {}) {
    const e = new GlassBridgeEngine({ players: [], now });
    e.status = data.status;
    e.bridge = data.bridge;
    e.revealed = data.revealed;
    e.deathPool = data.deathPool;
    e.turnOrder = data.turnOrder;
    e.initialOrder = data.initialOrder;
    e.turnIdx = data.turnIdx;
    e.payouts = data.payouts;
    e.winnerIds = data.winnerIds ?? [];
    e.finishReason = data.finishReason ?? null;
    e.finalResult = data.finalResult ?? null;
    e.ledger = data.ledger ?? [];
    e.players = new Map(data.players.map((p) => [p.id, { ...p, items: { ...p.items } }]));
    return e;
  }

  /**
   * Server restart-ийн дараа дуудна: ээлжийн хугацааг шинээр эхлүүлнэ, ингэснээр
   * серверийг унасан хугацаанд тоглогч автоматаар унахгүй.
   */
  resume() {
    if (this.status !== 'running') return { events: [] };
    return { events: this.#beginTurn() };
  }
}
