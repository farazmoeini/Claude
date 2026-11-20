// Zerfallzone – PC-App: startet den eingebauten Server und öffnet das Spiel im eigenen Fenster.
// Freunde im selben Netzwerk (oder per Portfreigabe) können über diesen PC mitspielen –
// mit der PC-App oder einfach im Browser.
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let info = null;

async function startEmbeddedServer() {
  const { startServer } = await import(pathToFileURL(path.join(__dirname, '..', 'server', 'server.js')).href);
  for (const port of [7777, 7778, 7779, 7780]) {
    try { return await startServer({ port, log: () => {} }); } catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
  }
  throw new Error('Kein freier Port zwischen 7777 und 7780.');
}

async function createWindow() {
  try { info = await startEmbeddedServer(); }
  catch (e) { console.error(e); dialog.showErrorBox('Zerfallzone', `Der Spielserver konnte nicht starten:\n${e.message}`); app.quit(); return; }
  // Namen der Audio-Ausgabegeräte für die Geräteauswahl im Spiel (nur für den eingebauten Server)
  const { session } = require('electron');
  const own = (origin) => { try { const u = new URL(origin); return u.hostname === 'localhost' && Number(u.port) === info.port; } catch { return false; } };
  session.defaultSession.setPermissionCheckHandler((wc, permission, origin) => (permission === 'media' || permission === 'speaker-selection') && own(origin));
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => cb(permission === 'speaker-selection' && own(details.requestingUrl || '')));
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 600, backgroundColor: '#05060d', title: 'Zerfallzone', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const hostInfo = () => {
    const lines = info.addresses.map((a) => `${a}:${info.port}`);
    dialog.showMessageBox(win, {
      type: 'info', title: 'Mit Freunden spielen',
      message: lines.length ? `Dein PC ist Spielserver.\n\nFreunde im selben Netzwerk geben in der App als Server ein:\n${lines.join('\n')}\n\nOder sie öffnen im Browser:\n${lines.map((l) => 'http://' + l).join('\n')}\n\nÜber das Internet: Port ${info.port} (TCP) im Router freigeben und deine öffentliche IP weitergeben.` : 'Keine Netzwerkadresse gefunden.',
    });
  };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Spiel', submenu: [
      { label: 'Mit Freunden spielen (Server-Adresse)', click: hostInfo },
      { type: 'separator' },
      { label: 'Vollbild', accelerator: 'F11', click: () => win.setFullScreen(!win.isFullScreen()) },
      { role: 'reload', label: 'Neu laden' },
      { role: 'toggleDevTools', label: 'Entwicklerwerkzeuge' },
      { type: 'separator' },
      { role: 'quit', label: 'Beenden' },
    ] },
  ]));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  await win.loadURL(`http://localhost:${info.port}/`);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
