// Cached token — populated on app load from Electron IPC
let _token: string | null = null;
let _user: { email: string; name: string } | null = null;

export const isElectron =
  typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

export async function initAuth(): Promise<{
  token: string | null;
  user: { email: string; name: string } | null;
}> {
  if (!isElectron) return { token: null, user: null };
  const api = (window as any).electronAPI;
  _token = await api.getToken();
  _user  = await api.getUser();
  return { token: _token, user: _user };
}

export function getToken(): string | null {
  return _token;
}

export function getUser(): { email: string; name: string } | null {
  return _user;
}

export function getAuthHeaders(): Record<string, string> {
  return _token ? { Authorization: `Bearer ${_token}` } : {};
}

export async function logout(): Promise<void> {
  if (isElectron) await (window as any).electronAPI.logout();
}
