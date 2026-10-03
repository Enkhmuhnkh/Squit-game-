# Multiplayer Party Game Hub — Архитектур

Эхний тоглоом: **30 шаттай Шилэн гүүр (Glass Bridge)**. Дараа нь шинэ мини тоглоомууд plugin хэлбэрээр нэмэгдэнэ.

## 1. Үндсэн зарчмууд

1. **Server-authoritative.** Тоглоомын бүх үнэн төлөв (хэний ээлж, хэний үлдэгдэл, аль шил зөв) зөвхөн серверт байна. Клиент зөвхөн "хүсэлт" илгээж, серверийн "үр дүн"-г дүрсэлнэ.
2. **Нууц мэдээлэл клиент рүү хэзээ ч явахгүй.** Bridge map (аль шил Safe) серверт л байна. Клиент рүү зөвхөн *шалгагдаж дууссан* шатны үр дүн, мөн `Cheat` авсан тухайн тоглогчид 3 секундийн мэдээлэл очно.
3. **Game plugin загвар.** Hub нь тоглоомын дүрмийг мэдэхгүй. Тоглоом бүр нэг ижил `GameEngine` интерфэйсийг хэрэгжүүлнэ. Шинэ тоглоом нэмэх = шинэ folder нэмэх.
4. **Бүртгэлгүй.** `localStorage` дахь `sessionToken` (UUID) + nickname. Reconnect хийхэд ижил token-оор өмнөх тоглогчоо сэргээнэ.
5. **Хурдан төлөв memory-д, түүх DB-д.** Идэвхтэй тоглоомын төлөв server memory-д (хурдан). Тоглоом дуусахад үр дүн, гүйлгээ, map-ийг PostgreSQL-д хадгална. Идэвхтэй өрөөг DB-д snapshot хийж, server restart-д сэргээх боломжтой (Phase 3).
6. **Pure engine.** Engine нь socket, DB-г мэдэхгүй — зөвхөн `(state, action) -> (newState, events)`. Тиймээс unit test хийхэд амархан.

## 2. Folder бүтэц

```
party-game-hub/
├── ARCHITECTURE.md
├── docker-compose.yml          # postgres
├── db/
│   └── schema.sql
├── server/
│   ├── package.json
│   └── src/
│       ├── index.js            # Express + Socket.io bootstrap
│       ├── config.js
│       ├── db/
│       │   └── pool.js         # pg Pool
│       ├── hub/
│       │   ├── RoomManager.js  # өрөө үүсгэх/орох/гарах, host
│       │   ├── SessionStore.js # sessionToken -> player
│       │   └── socketHandlers.js
│       ├── games/
│       │   ├── registry.js     # gameId -> engine factory
│       │   └── glassBridge/
│       │       ├── GlassBridgeEngine.js
│       │       ├── bridgeGenerator.js
│       │       ├── items.js    # Shop тодорхойлолт
│       │       └── constants.js
│       └── persistence/
│           └── gameRepository.js
└── client/
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── lib/
        │   ├── socket.js
        │   └── session.js      # localStorage + UUID
        ├── store/
        │   └── useGameStore.js # zustand
        ├── pages/
        │   ├── Home.jsx        # nickname
        │   ├── Lobby.jsx
        │   └── Room.jsx
        └── games/
            └── glassBridge/
                ├── GlassBridgeScreen.jsx
                ├── Bridge.jsx  # isometric + camera follow
                ├── Shop.jsx
                └── PlayerHud.jsx
```

## 3. Давхаргууд

```
React UI ──(socket events)──> socketHandlers ──> RoomManager ──> GameEngine (pure)
                                                      │                │
                                                      └──> gameRepository ──> PostgreSQL
```

| Давхарга | Үүрэг | Мэдэхгүй зүйл |
|---|---|---|
| socketHandlers | Event хүлээж авах, validate, engine рүү дамжуулах, үр дүнг broadcast | Тоглоомын дүрэм |
| RoomManager | Өрөө, тоглогч, host, тоглоом сонголт | Шилэн гүүрийн дүрэм |
| GameEngine | Дүрэм, төлөв, ээлж, мөнгө, item | Socket, DB |
| gameRepository | DB-д хадгалах | Дүрэм |

## 4. GameEngine интерфэйс (plugin гэрээ)

```js
class GameEngine {
  static id = 'glass-bridge';
  static meta = { name, minPlayers, maxPlayers };

  constructor({ players, options })
  start()                        // -> { events }
  handleAction(playerId, action) // -> { events }  (алдаа бол throw GameError)
  tick(now)                      // -> { events }  (timer: ээлжийн хугацаа дуусах)
  getPublicState(forPlayerId)    // тухайн хүнд харуулж болох төлөв
  isFinished()
  getResult()                    // -> DB-д хадгалах үр дүн
}
```

`events` нь `{ to: 'room' | playerId, type, payload }` хэлбэртэй. Hub тэднийг socket-ээр илгээнэ.

## 5. Шилэн гүүр — state machine

```
LOBBY ──start──> TURN_ACTIVE ──choose(L|R)──> RESOLVING ──┬─ safe ──> TURN_ACTIVE (дараагийн ээлж)
                      ▲                                    ├─ danger + shield ──> TURN_ACTIVE
                      │                                    ├─ danger ──> ELIMINATED ──> TURN_ACTIVE / FINISHED
                      └──── timeout (auto-fall) ───────────┘
                                                           └─ 30 шат дуусах / 1 хүн үлдэх ──> FINISHED
```

### Ээлж ба гүүрний дүрэм
- Тоглогчид санамсаргүй дараалалтай (`turnOrder`). Хүн бүр ээлжиндээ **өөрийн одоогийн шатнаас дараагийн шат** руу `L` эсвэл `R` сонгоно.
- Шилний үр дүн **бүх тоглогчид хуваалцдаг** (шил хагарсан бол хагарсан хэвээр, Safe нь нээгдсэн хэвээр). Тиймээс хойно байгаа хүмүүс өмнөх хүмүүсийн алдаанаас суралцана — Squid Game-ийн жинхэнэ механик.
- Шагнал: **зөвхөн шинэ шатыг амжилттай нээсэн хүнд $150** (`OPENER_REWARD`). Өмнө нь нээгдсэн шатаар алхвал эрсдэлгүй, гэхдээ шагналгүй (эрсдэл = шагнал; шинэ мөнгө үүсэх хэмжээг бууруулна).
- Үхсэн тоглогчийн үлдсэн мөнгө → `deathPool`. Төгсгөлд 30-р шатыг давсан ялагч(ууд) тэгш хувааж авна. **Хэн ч давсангүй бол хамгийн хол очсон (унасан ч) тоглогч(ид) авна.**
- Ээлжийн timer (default 15 сек). Хугацаа дуусвал санамсаргүй сонголтоор автоматаар гишгэнэ. `Extra Time` +10 сек.

### Item-ууд (сервер талд баталгаажуулна)
| Item | Үнэ | Үйлдэл | Серверийн дүрэм |
|---|---|---|---|
| Cheat | $450 | Дараагийн шатны Safe талыг тухайн хүнд 3 сек харуулна | Зөвхөн өөрийн ээлж/өөрийн дараагийн шатны хувьд; `cheat:reveal` event зөвхөн энэ socket-д |
| Swap | $600 | Ард байгаа нэг тоглогчтой ээлж солих | `turnOrder` дахь байрлал солино; зөвхөн амьд, ард байгаа хүнтэй |
| Shield | $600 | Буруу шилэнд 1 удаа аврагдана | `shield` тоолуур, ашиглагдахад -1 |
| Extra Time | $100 | Ээлжийн хугацаа сунгана | Өөрийн ээлжинд л |
| Push | $300 | Урд байгаа хүнийг албадан сонголт хийлгэнэ | Урд байгаа амьд хүн, түүний ээлж биш үед ч ажиллах эсэхийг `options`-оор тохируулна |

Мөнгө хүрэлцэхгүй бол `GameError('INSUFFICIENT_FUNDS')`.

## 6. Socket event гэрээ

### Client → Server
| Event | Payload | Тайлбар |
|---|---|---|
| `session:init` | `{ sessionToken?, nickname }` | Guest session үүсгэх / сэргээх |
| `room:create` | `{ gameId }` | Host болно |
| `room:join` | `{ code }` | |
| `room:leave` | | |
| `room:selectGame` | `{ gameId }` | Зөвхөн host |
| `game:start` | | Зөвхөн host |
| `gb:choose` | `{ side: 'L'|'R' }` | Шилэн гүүр |
| `gb:buy` | `{ item, targetId? }` | |
| `gb:useItem` | `{ item, targetId? }` | |

Бүх event-д ack callback: `{ ok: true, ... }` эсвэл `{ ok: false, code, message }`.

### Server → Client
| Event | Payload |
|---|---|
| `session:ready` | `{ playerId, sessionToken, nickname }` |
| `room:state` | Өрөөний public төлөв (тоглогчид, host, game) |
| `game:started` | `{ turnOrder, config }` |
| `gb:turn` | `{ playerId, deadline }` |
| `gb:stepResult` | `{ step, side, safe, playerId, eliminated, shieldUsed }` |
| `gb:cheatReveal` | `{ step, safeSide, ms: 3000 }` *(зөвхөн авсан хүнд)* |
| `gb:balances` | `{ [playerId]: balance, deathPool }` |
| `gb:finished` | `{ winners, payouts }` |
| `error:game` | `{ code, message }` |

## 7. Аюулгүй байдал / Anti-cheat
- Bridge map серверт `crypto.randomInt`-ээр үүснэ. Public state-д **хэзээ ч** орохгүй.
- Бүх үйлдэл `socket.data.playerId`-аар баталгаажина; клиент өөрийн ID-г payload-оор илгээж болохгүй.
- Ээлж, мөнгө, item-ийн шалгалт зөвхөн engine дотор.
- Rate limit: socket бүр секундэд ~10 event.
- Nickname: 2–16 тэмдэгт, trim, HTML escape.
- Room code: 5 тэмдэгт, төөрөгдүүлэх үсэг (`O/0/I/1`)-гүй.
- Тоглоом дууссаны дараа л map-ийг DB-д бүтнээр нь хадгална (replay/аудит).

## 8. PostgreSQL загвар (товч)
`db/schema.sql`-ийг үз. Гол хүснэгтүүд:
- `players` — guest session (uuid, nickname)
- `rooms` — code, host, selected game
- `game_sessions` — нэг тоглолт (room, game_id, status, death_pool)
- `bridge_maps` — session бүрийн 30 шатны Safe тал
- `session_players` — тоглолт дахь тоглогчийн үр дүн (turn_order, final_step, balance, eliminated_at)
- `transactions` — мөнгөний бүх хөдөлгөөн (шагнал, item, death pool, payout) — аудитад

## 9. Frontend архитектур
- **State:** `zustand` store — `session`, `room`, `game`. Socket event → store action.
- **Socket:** нэг `socket.js` singleton, `useSocket` hook-оор reconnect-д `session:init`-ийг автоматаар дахин илгээнэ.
- **Шилэн гүүрийн дүрслэл:** CSS 3D isometric transform (`rotateX(55deg) rotateZ(-45deg)`) + камер нь идэвхтэй тоглогчийн `step`-ийг дагаж `translate` анимацаар гулсана. Шил хагарахад keyframe анимаци + `Audio` чимээ.
- **Game screen plugin:** `games/<gameId>/` folder бүр нэг `Screen` компонент экспортлоно; `Room.jsx` нь `gameId`-аар динамикаар ачаална.

## 10. Roadmap
1. **Phase 1 (энэ скаффолд):** schema, hub, GlassBridge engine, guest session, энгийн UI.
2. **Phase 2:** Isometric дүрслэл, дуу, анимаци, item UI-ийн бүрэн хэлбэр.
3. **Phase 3:** DB snapshot, reconnect-ийг бүрэн сайжруулах, spectator.
4. **Phase 4:** 2-р мини тоглоом нэмж plugin загварыг баталгаажуулах.
5. **Phase 5:** Engine unit test, load test, deploy (Docker).


## 11. Хадгалалт ба refresh (тоглолт алга болохгүй байх)

Асуудал: идэвхтэй өрөө, тоглолт зөвхөн server memory-д байвал server restart (`node --watch`, deploy, crash) бүрт бүгд алга болно.

Шийдэл — гурван давхарга:
1. **Client:** `sessionToken` (UUID) `localStorage`-д. Refresh/reconnect үед `connect` event дээр `session:init`-ийг автоматаар дахин илгээнэ. Сервер token-оор тоглогчоо таниад өрөөнд нь дахин оруулж, `room:state` ба `game:state`-ийг (нууц map-гүй) шууд илгээнэ. Сэргээж байх үед "Өрөөг сэргээж байна…" харуулна.
2. **Server memory:** холбоо тасрахад тоглогч өрөөнөөс хасагдахгүй, зөвхөн `connected=false` болно. Ээлж нь timeout-оор автоматаар явна.
3. **Snapshot (restart-д тэсвэртэй):** `Snapshotter` өөрчлөгдсөн өрөөг ~1 секундэд нэг удаа (dirty flag) хадгална:
   - `DATABASE_URL` байвал PostgreSQL `room_snapshots` хүснэгтэд (JSONB),
   - байхгүй бол `server/.data/snapshots.json` файлд (атом `rename`-тэй).
   Server асахдаа өрөө, session, `GlassBridgeEngine.restore()`-оор тоглолтыг сэргээнэ. Ээлжийн хугацааг `resume()` шинээр эхлүүлнэ, ингэснээр сервер унасан хугацаанд хэн ч автоматаар унахгүй. `SIGINT/SIGTERM`-д сүүлийн flush хийнэ.
- **Аюулгүй байдал:** snapshot-д нууц bridge ба sessionToken байдаг тул зөвхөн сервертэй хамт байна, клиент рүү хэзээ ч явахгүй. `game:state` нь зөвхөн `getPublicState()`.
- **Үр дүнгийн дэлгэц:** дууссан тоглолтын үр дүн `game:state.result`-д байна; тоглогч "Өрөө рүү буцах" дарахад `game:ackResult` явж, refresh хийвэл дахин гарахгүй.
- **Хязгаар:** нэг сервер instance-ийн загвар. Олон instance болгох бол Socket.io Redis adapter + engine-ийг нэг instance-д "эзэмшүүлэх" (sticky/lock) хэрэгтэй (Phase 5).

## 12. 3D дүрслэл (react-three-fiber)

- `Bridge3D.jsx`: `Canvas` + `Pane` (шил) + `Character` (тоглогч) + `CameraRig` + `Environment`. Gameplay логик энд огт байхгүй — зөвхөн `game` төлөвийг дүрсэлнэ.
- **Газар/орчин:** эхлэх ба төгсгөлийн тавцан, ган дам нуруу, алтлаг гэрэлтэх хашлага, цэнхэр гэрэлтэй тулгуур багана, тоос, мананцар (fog), доор улаан гэрэл (ан цав).
- **Тоглогч:** бүгд ИЖИЛ хувцастай (ногоон цамц/өмд, цагаан судал, цагаан гутал); ялгах зүйл нь зөвхөн нуруу/цээж дээрх **дугаар** (`seat`), "та" = алтан бөгж, ээлжтэй хүн = дээр нь алтан сум, нэр хаяг.
- **Камер:** ээлжтэй тоглогчийн шатыг дагаж зөөлөн гулсана; шил хагарахад богино сэгсрэлт. 
- **Шил:** туршигдаагүй = цэнхэр, Safe нээгдсэн = ногоон, `Cheat` = зөвхөн надад 3 сек ногоон гялбаа, хагарсан = эргэлдэж унаад алга болно.
- **Fallback:** WebGL алдаа гарвал `ErrorBoundary` автоматаар 2D (`Bridge.jsx`) горимд шилжүүлнэ. Гар утсанд зориулсан том ЗҮҮН/БАРУУН товч мөн байгаа.
- `three` том тул `React.lazy`-аар зөвхөн Шилэн гүүр нээгдэхэд ачаална.
- **Одоогийн хязгаар:** дүрс нь энгийн геометрээс (capsule, box) бүтсэн. Жинхэнэ MLBB-ийн түвшний model/animation-д `.glb` загвар (Blender) хэрэгтэй — `Character`-ийг `useGLTF`-ээр солиход л болно.

## 13. Эдийн засгийн тооцоо (Monte Carlo)

Таамаглал: бүх тоглогч санамсаргүй сонгоно, item ашиглахгүй, 40,000–200,000 тоглолт.

**Хамгийн багадаа 1 ялагчтай байх магадлал** (шагналын загвараас үл хамаарна):

| Шат \ Тоглогч | 4 | 6 | 8 | 12 | 20 |
|---|---|---|---|---|---|
| 10 | 0.17 | 0.62 | 0.95 | 1.00 | 1.00 |
| 15 | 0.02 | 0.15 | 0.50 | 0.98 | 1.00 |
| 20 | 0.00 | 0.02 | 0.13 | 0.75 | 1.00 |
| 30 | 0.00 | 0.00 | 0.00 | 0.10 | 0.95 |

- Шат бүр яг нэг удаа нээгдэж, нээгч 50% унана → S шат ≈ S/2 үхэл. 30 шат нь ~20 тоглогчтой үед л тохирно. Иймд хамгийн ихдээ 20 тоглогч, мөн ялагчгүй үед "хамгийн хол очсон" дүрэм нэмсэн.
- **Ээлжийн байрлал** (8 хүн, 15 шат, нээгчийн шагнал): байр 1 ≈ −$1000, байр 8 ≈ +$1668 (ялах магадлал 50%). Swap/Push нь үүнийг тэнцвэржүүлэх гол хэрэгсэл.
- **Шинэ мөнгө:** бүх алхамд $50 өгвөл 8 хүн/15 шатад ≈ $3,064, зөвхөн нээгчид $50 өгвөл ≈ $348, $150 өгвөл ≈ $1,047.
- **Item үнэ (шинжилгээ, симуляцигүй):** Shield нэг үхлийг ($500–1000) аварна, Cheat нэг 50/50 эрсдэлийг арилгана (≈$500) → Shield-ийг $350-аас $600 болгосон.
