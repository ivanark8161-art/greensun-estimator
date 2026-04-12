import { PublicClientApplication } from '@azure/msal-browser';

// ── Environment ───────────────────────────────────────────────────────────────
const TENANT_ID = import.meta.env.VITE_AZURE_TENANT_ID ?? 'b0ef5554-1d19-4200-a5d9-3544e65f0574';
const CLIENT_ID = import.meta.env.VITE_AZURE_CLIENT_ID ?? '6d3e9ad5-f2c4-4542-b1f4-43d64838e122';

// ── Cached session ────────────────────────────────────────────────────────────
let _token: string | null = null;
let _user: { email: string; name: string } | null = null;

export const isElectron =
  typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

// ── MSAL (web only) ───────────────────────────────────────────────────────────
let _msalApp: PublicClientApplication | null = null;

async function getMsalApp(): Promise<PublicClientApplication> {
  if (!_msalApp) {
    _msalApp = new PublicClientApplication({
      auth: {
        clientId: CLIENT_ID,
        authority: `https://login.microsoftonline.com/${TENANT_ID}`,
        redirectUri: window.location.origin + '/',
      },
      cache: { cacheLocation: 'sessionStorage' },
    });
    await _msalApp.initialize();
  }
  return _msalApp;
}

const SCOPES = ['User.Read', 'openid', 'profile', 'email'];

// ── initAuth: called on app mount ─────────────────────────────────────────────
// Returns token if already authenticated, null if login is required.
export async function initAuth(): Promise<{
  token: string | null;
  user: { email: string; name: string } | null;
}> {
  if (isElectron) {
    const api = (window as any).electronAPI;
    _token = await api.getToken();
    _user  = await api.getUser();
    return { token: _token, user: _user };
  }

  // Web: check for a cached MSAL session (e.g. page refresh)
  const msal = await getMsalApp();
  const accounts = msal.getAllAccounts();
  if (accounts.length > 0) {
    try {
      const result = await msal.acquireTokenSilent({ scopes: SCOPES, account: accounts[0] });
      _token = result.idToken;
      _user  = { email: result.account?.username ?? '', name: result.account?.name ?? '' };
      return { token: _token, user: _user };
    } catch {
      // Silent refresh failed — user needs to log in again
    }
  }

  return { token: null, user: null };
}

// ── loginWithMicrosoft: triggers the Microsoft login popup ───────────────────
export async function loginWithMicrosoft(): Promise<{
  token: string | null;
  user: { email: string; name: string } | null;
}> {
  const msal = await getMsalApp();
  try {
    const result = await msal.loginPopup({ scopes: SCOPES });
    _token = result.idToken;
    _user  = { email: result.account?.username ?? '', name: result.account?.name ?? '' };
    return { token: _token, user: _user };
  } catch (err) {
    console.error('Microsoft login failed:', err);
    return { token: null, user: null };
  }
}

// ── Accessors used throughout the app ─────────────────────────────────────────
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
  if (isElectron) {
    await (window as any).electronAPI.logout();
    return;
  }
  _token = null;
  _user  = null;
  const msal = await getMsalApp();
  const accounts = msal.getAllAccounts();
  if (accounts.length > 0) {
    await msal.logoutPopup({ account: accounts[0] });
  }
}
