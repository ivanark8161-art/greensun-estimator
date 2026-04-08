'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const { PublicClientApplication } = require('@azure/msal-node');
const http = require('http');
const path = require('path');
const url  = require('url');

// ── Azure AD config ───────────────────────────────────────────────────────────
const CLIENT_ID  = '6d3e9ad5-f2c4-4542-b1f4-43d64838e122';
const TENANT_ID  = 'b0ef5554-1d19-4200-a5d9-3544e65f0574';
const AUTHORITY  = `https://login.microsoftonline.com/${TENANT_ID}`;
const SCOPES     = ['openid', 'profile', 'email', 'User.Read'];
const REDIRECT_URI = 'http://localhost:42069/auth';
const RAILWAY_URL  = 'https://greensun-estimator-production.up.railway.app';

// ── Module-level auth state ───────────────────────────────────────────────────
let cachedIdToken = null;
let cachedUser    = null;
let mainWindow    = null;

// ── MSAL PublicClientApplication ─────────────────────────────────────────────
const pca = new PublicClientApplication({
  auth: {
    clientId:  CLIENT_ID,
    authority: AUTHORITY,
  },
  cache: {
    cachePlugin: null,
  },
});

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function getCachedToken() {
  try {
    const accounts = await pca.getAllAccounts();
    if (!accounts || accounts.length === 0) return null;
    const result = await pca.acquireTokenSilent({
      account: accounts[0],
      scopes: SCOPES,
    });
    return result;
  } catch {
    return null;
  }
}

function startAuthServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const parsed = url.parse(req.url, true);
      if (parsed.pathname !== '/auth') {
        res.end('Not found');
        return;
      }

      const code = parsed.query.code;
      if (!code) {
        res.end('<h1>Auth failed: no code received</h1>');
        reject(new Error('No auth code received'));
        server.close();
        return;
      }

      try {
        const tokenResult = await pca.acquireTokenByCode({
          code: Array.isArray(code) ? code[0] : code,
          scopes: SCOPES,
          redirectUri: REDIRECT_URI,
        });
        res.end('<h1>Login successful! You can close this tab.</h1>');
        server.close();
        resolve(tokenResult);
      } catch (err) {
        res.end(`<h1>Login failed: ${err.message}</h1>`);
        server.close();
        reject(err);
      }
    });

    server.listen(42069, '127.0.0.1', (err) => {
      if (err) reject(err);
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Auth timed out'));
    }, 5 * 60 * 1000);
  });
}

async function doLogin() {
  const authCodeUrlParams = {
    scopes: SCOPES,
    redirectUri: REDIRECT_URI,
  };
  const authUrl = await pca.getAuthCodeUrl(authCodeUrlParams);

  // Start the redirect listener BEFORE opening browser
  const serverPromise = startAuthServer();
  await shell.openExternal(authUrl);

  const tokenResult = await serverPromise;
  return tokenResult;
}

async function checkAllowlist(idToken) {
  const resp = await fetch(`${RAILWAY_URL}/api/auth/check`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  return resp;
}

// ── Window creation ───────────────────────────────────────────────────────────

function createMainWindow() {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  mainWindow = new BrowserWindow({
    width:  1400,
    height: 900,
    webPreferences: {
      preload:         path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
    icon: path.join(__dirname, '..', 'public', 'logo.png'),
    show: false,
  });

  Menu.setApplicationMenu(null);

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5176');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Auto-updater (only in packaged app)
    if (app.isPackaged) {
      try {
        autoUpdater.checkForUpdatesAndNotify();
      } catch {
        // Ignore updater errors in dev
      }
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('auth:getToken', () => cachedIdToken);

ipcMain.handle('auth:getUser', () => cachedUser);

ipcMain.handle('auth:logout', async () => {
  try { await pca.clearCache(); } catch { /* ignore */ }
  cachedIdToken = null;
  cachedUser    = null;
  app.relaunch();
  app.exit();
});

// ── Auto-updater config ───────────────────────────────────────────────────────
autoUpdater.setFeedURL({
  provider: 'github',
  owner:    'ivanark8161-art',
  repo:     'greensun-estimator',
});

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  try {
    // 1. Try silent token from cache
    let tokenResult = await getCachedToken();

    // 2. If no cached token, do interactive login
    if (!tokenResult) {
      tokenResult = await doLogin();
    }

    if (!tokenResult || !tokenResult.idToken) {
      dialog.showErrorBox('Authentication Failed', 'Could not obtain a valid token. Please try again.');
      app.quit();
      return;
    }

    cachedIdToken = tokenResult.idToken;
    const claims  = tokenResult.idTokenClaims || {};
    cachedUser    = {
      email: claims.preferred_username || claims.email || claims.upn || '',
      name:  claims.name || '',
    };

    // 3. Validate against Railway allowlist
    let checkResp;
    try {
      checkResp = await checkAllowlist(cachedIdToken);
    } catch (err) {
      dialog.showErrorBox('Network Error', `Could not reach the server to validate your access.\n${err.message}`);
      app.quit();
      return;
    }

    if (!checkResp.ok) {
      const body = await checkResp.json().catch(() => ({}));
      dialog.showErrorBox(
        'Access Denied',
        body.error || 'Your account is not authorized to use GreenSun Estimator. Contact your administrator.'
      );
      app.quit();
      return;
    }

    // 4. Create window
    createMainWindow();

  } catch (err) {
    dialog.showErrorBox('Login Error', err.message || 'An unknown error occurred during login.');
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null && cachedIdToken) createMainWindow();
});
