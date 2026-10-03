import { io } from 'socket.io-client';

export const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export const socket = io(SERVER_URL, { autoConnect: false });

/** Ack-тай emit-ийг Promise болгоно. Алдаа үед Error(message, code) шиднэ. */
export function emit(event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.timeout(8000).emit(event, payload, (err, res) => {
      if (err) return reject(new Error('Сервер хариу өгсөнгүй'));
      if (!res?.ok) {
        const e = new Error(res?.message || 'Алдаа гарлаа');
        e.code = res?.code;
        return reject(e);
      }
      resolve(res);
    });
  });
}
