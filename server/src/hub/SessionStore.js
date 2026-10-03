import { randomUUID } from 'node:crypto';
import { GameError } from '../games/GameError.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sanitizeNickname(raw) {
  const nick = String(raw ?? '').replace(/[\u0000-\u001f<>&"'`]/g, '').trim().slice(0, 16);
  if (nick.length < 2) throw new GameError('BAD_NICKNAME', 'Хоч нэр 2–16 тэмдэгттэй байх ёстой');
  return nick;
}

/** Guest session-ууд. sessionToken -> player. Бүртгэл/нууц үг байхгүй. */
export class SessionStore {
  constructor() {
    this.byToken = new Map();
    this.byId = new Map();
  }

  /** Token байвал сэргээнэ, үгүй бол шинээр үүсгэнэ. */
  init({ sessionToken, nickname }) {
    if (sessionToken && UUID_RE.test(sessionToken) && this.byToken.has(sessionToken)) {
      const existing = this.byToken.get(sessionToken);
      if (nickname) existing.nickname = sanitizeNickname(nickname);
      return existing;
    }
    const player = {
      id: randomUUID(),
      token: randomUUID(),
      nickname: sanitizeNickname(nickname),
      socketId: null,
      roomCode: null,
    };
    this.byToken.set(player.token, player);
    this.byId.set(player.id, player);
    return player;
  }

  get(playerId) {
    return this.byId.get(playerId) ?? null;
  }

  /** Server restart-ийн дараа snapshot-оос session-үүдийг сэргээнэ. */
  restore(list) {
    for (const s of list) {
      if (this.byId.has(s.id)) continue;
      const player = {
        id: s.id,
        token: s.token,
        nickname: s.nickname,
        socketId: null,
        roomCode: s.roomCode ?? null,
      };
      this.byToken.set(player.token, player);
      this.byId.set(player.id, player);
    }
  }
}
