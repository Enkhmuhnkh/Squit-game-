// Guest session: сервер өгсөн sessionToken (UUID) + nickname-ийг localStorage-д хадгална.
const KEY = 'partyhub.session.v1';

export function loadSession() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // private mode гэх мэт
  }
}

export function saveSession(session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch { /* localStorage ашиглах боломжгүй — session зөвхөн энэ tab-д */ }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}
