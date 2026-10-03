export class GameError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}
