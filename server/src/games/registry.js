import { GlassBridgeEngine } from './glassBridge/GlassBridgeEngine.js';

// Шинэ тоглоом нэмэх: engine класс бичээд энд бүртгэхэд л болно.
const engines = new Map([[GlassBridgeEngine.id, GlassBridgeEngine]]);

export function getEngineClass(gameId) {
  return engines.get(gameId) ?? null;
}

export function listGames() {
  return [...engines.values()].map((E) => E.meta);
}
