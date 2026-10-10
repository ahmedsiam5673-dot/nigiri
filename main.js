'use strict';
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, globalShortcut, safeStorage, clipboard } = require('electron');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const { Store, PROVIDERS } = require('./lib/store');
const { streamChat, listModels } = require('./lib/providers');
const { HookCore, startServer, installHooks, uninstallHooks, hookStatus } = require('./lib/hooks');
const { createDemo } = require('./lib/demo');

const WIN_W = 640;
const WIN_H = 540;
const CLAUDE_SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let win = null;
let tray = null;
let store = null;
let core = null;
let demo = null;
let hookPort = 0;
let cursorTimer = null;
const chats = new Map();

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function place() {
  if (!win) return;
  const wa = screen.getPrimaryDisplay().bounds;
  win.setBounds({ x: Math.round(wa.x + (wa.width - WIN_W) / 2), y: wa.y, width: WIN_W, height: WIN_H });
}

function createWindow() {
  win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: 'Nigiri',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => {
    place();
    win.showInactive();
  });
  win.on('blur', () => send('island:blur'));
  win.on('closed', () => (win = null));

  // eyes follow the real cursor, even outside the window
  let last = '';
  cursorTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    const key = `${p.x - b.x},${p.y - b.y}`;
    if (key === last) return;
    last = key;
    send('island:cursor', { x: p.x - b.x, y: p.y - b.y });
  }, 40);
}

function toggleIsland(tab) {
  if (!win) return;
  win.show();
  win.focus();
  send('island:toggle', tab || null);
}

function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  tray = new Tray(img);
  tray.setToolTip('Nigiri');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Nigiri', click: () => toggleIsland() },
      { label: 'Settings', click: () => { toggleIsland(); send('island:tab', 'settings'); } },
      { label: 'Try the demo', click: () => demo.start() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  );
  tray.on('click', () => toggleIsland());
}

function loginPath() {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}

function registerIpc() {
  ipcMain.handle('settings:get', () => store.get());
  ipcMain.handle('settings:set', (_e, patch) => store.set(patch));
  ipcMain.handle('keys:status', () => store.keyStatus());
  ipcMain.handle('keys:set', (_e, provider, key) => {
    try {
      store.setKey(provider, key);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle('keys:clear', (_e, provider) => {
    if (PROVIDERS.includes(provider)) store.clearKey(provider);
    return { ok: true };
  });

  ipcMain.handle('models:list', async (_e, provider) => {
    if (!PROVIDERS.includes(provider)) return { ok: false, error: 'Unknown provider' };
    try {
      const s = store.get();
      const models = await listModels({
        provider,
        key: store.getKey(provider),
        baseUrl: s.urls[provider],
        signal: AbortSignal.timeout(8000)
      });
      return { ok: true, models };
    } catch (err) {
      return { ok: false, error: err.name === 'TimeoutError' ? 'Timed out' : err.message };
    }
  });

  ipcMain.handle('chat:send', (_e, req) => {
    const { provider, model } = req || {};
    if (!PROVIDERS.includes(provider)) return { ok: false, error: 'Unknown provider' };
    const messages = (Array.isArray(req.messages) ? req.messages : [])
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content)
      .slice(-60)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 60000) }));
    if (!messages.length) return { ok: false, error: 'Nothing to send' };
    const needsKey = !['ollama', 'lmstudio'].includes(provider);
    const key = store.getKey(provider);
    if (needsKey && !key) return { ok: false, error: 'Add your API key in Settings first' };

    const id = crypto.randomUUID();
    const ctrl = new AbortController();
    chats.set(id, ctrl);
    (async () => {
      try {
        for await (const text of streamChat({ provider, model: String(model || ''), messages, key, baseUrl: store.get().urls[provider], signal: ctrl.signal })) {
          send('chat:chunk', { id, text });
        }
        send('chat:done', { id });
      } catch (err) {
        if (ctrl.signal.aborted) send('chat:done', { id, aborted: true });
        else send('chat:error', { id, message: err && err.message ? err.message : 'Something went wrong' });
      } finally {
        chats.delete(id);
      }
    })();
    return { ok: true, id };
  });
  ipcMain.handle('chat:abort', (_e, id) => {
    const c = chats.get(id);
    if (c) c.abort();
    return true;
  });

  ipcMain.handle('agents:snapshot', () => core.snapshot());
  ipcMain.handle('agents:decide', (_e, id, decision) => (['allow', 'deny', 'terminal'].includes(decision) ? core.decide(String(id), decision) : false));

  const hookArgs = () => ({ file: CLAUDE_SETTINGS, port: hookPort, token: store.token });
  ipcMain.handle('hooks:status', () => ({ ...hookStatus(hookArgs()), port: hookPort }));
  ipcMain.handle('hooks:install', () => {
    try {
      installHooks(hookArgs());
      return { ok: true, ...hookStatus(hookArgs()) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle('hooks:uninstall', () => {
    try {
      uninstallHooks({ file: CLAUDE_SETTINGS });
      return { ok: true, ...hookStatus(hookArgs()) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.on('island:interactive', (_e, v) => {
    if (win) win.setIgnoreMouseEvents(!v, { forward: true });
  });
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), port: hookPort, platform: process.platform, shortcut: 'Ctrl+Alt+N' }));
  ipcMain.handle('app:copy', (_e, text) => {
    clipboard.writeText(String(text).slice(0, 200000));
    return true;
  });
  ipcMain.handle('app:login', (_e, v) => {
    app.setLoginItemSettings({ openAtLogin: v, path: loginPath() });
    return app.getLoginItemSettings({ path: loginPath() }).openAtLogin;
  });
  ipcMain.handle('demo:start', () => {
    demo.start();
    return true;
  });
  ipcMain.on('app:quit', () => app.quit());
}

app.on('second-instance', () => toggleIsland());

app.whenReady().then(async () => {
  store = new Store(app.getPath('userData'), {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (s) => safeStorage.encryptString(s),
    decrypt: (b) => safeStorage.decryptString(b)
  });
  core = new HookCore();
  demo = createDemo(core);
  core.on('change', (snap) => send('agents:update', snap));
  core.on('finish', (s) => send('agents:finish', s));

  try {
    const r = await startServer(core, { port: store.get().port, token: store.token });
    hookPort = r.port;
  } catch (err) {
    hookPort = 0; // the app still works for chat; settings shows that hooks are unavailable
  }

  registerIpc();
  createWindow();
  createTray();
  globalShortcut.register('Control+Alt+N', () => toggleIsland());
  screen.on('display-metrics-changed', place);
  screen.on('display-added', place);
  screen.on('display-removed', place);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  clearInterval(cursorTimer);
  if (core) core.close();
});

app.on('window-all-closed', () => {
  // the island lives in the tray; only Quit exits
});
