export const RL = {
  TRACK_LENGTH: 100,       // 0 → 100: эхлэлээс дуусах шугам хүртэлх ахиц
  MOVE_STEP: 6,            // нэг зөвшөөрөгдсөн "move" pulse-ийн ахиц
  MIN_PULSE_GAP_MS: 120,   // үүнээс богино зайтай pulse-ийг үл тооно (хурд hack хаах)
  GREEN_MIN_MS: 2_000,
  GREEN_MAX_MS: 4_000,
  RED_MIN_MS: 1_500,
  RED_MAX_MS: 3_000,
  ROUND_MS: 90_000,        // нийт раундын хугацаа — дуусахад хүрээгүй амьд хүн ч хасагдана
  START_BALANCE: 1000,
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 20,
};
