const TAB_USERNAME_KEY = 'wp_tab_username';
const TAB_USER_ID_KEY = 'wp_tab_userId';
const LAST_USED_NAME_KEY = 'wp_last_username';

/**
 * Returns the current tab's active username from sessionStorage.
 * This ensures each tab acts as an independent participant session.
 */
export function getStoredUsername(): string | null {
  if (typeof window === 'undefined') return null;
  const tabName = sessionStorage.getItem(TAB_USERNAME_KEY);
  if (tabName && tabName.trim()) return tabName.trim();
  return null;
}

/**
 * Returns the user's previously used username across tabs for convenient pre-filling.
 */
export function getLastUsedUsername(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(LAST_USED_NAME_KEY);
}

/**
 * Sets the username for this tab's session and updates last-used in localStorage.
 */
export function setStoredUsername(username: string): void {
  if (typeof window === 'undefined') return;
  const clean = username.trim();
  sessionStorage.setItem(TAB_USERNAME_KEY, clean);
  localStorage.setItem(LAST_USED_NAME_KEY, clean);
}

/**
 * Returns or creates a unique userId for this specific browser tab.
 * Persists across page refreshes in the same tab, but remains isolated between different tabs.
 */
export function getStoredUserId(): string {
  if (typeof window === 'undefined') return '';
  let id = sessionStorage.getItem(TAB_USER_ID_KEY);
  if (!id) {
    id = 'user_' + Math.random().toString(36).substring(2, 10);
    sessionStorage.setItem(TAB_USER_ID_KEY, id);
  }
  return id;
}

export function clearStoredSession(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(TAB_USERNAME_KEY);
  sessionStorage.removeItem(TAB_USER_ID_KEY);
}

export function getStoredSessionToken(roomCode: string): string | null {
  if (typeof window === 'undefined' || !roomCode) return null;
  return sessionStorage.getItem(`wp_token_${roomCode.toUpperCase()}`);
}

export function setStoredSessionToken(roomCode: string, token: string): void {
  if (typeof window === 'undefined' || !roomCode || !token) return;
  sessionStorage.setItem(`wp_token_${roomCode.toUpperCase()}`, token);
}

export function clearStoredSessionToken(roomCode: string): void {
  if (typeof window === 'undefined' || !roomCode) return;
  sessionStorage.removeItem(`wp_token_${roomCode.toUpperCase()}`);
}
