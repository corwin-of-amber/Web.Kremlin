const { app, BrowserWindow } = require('electron')
const fs = require('fs'),
      path = require('path');

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = '1' // sorry Electron. CSP just doesn't cut it.
//  <meta http-equiv="Content-Security-Policy"
//     content="default-src 'self'; script-src 'unsafe-inline'">  ???
//  https://github.com/electron/electron/issues/26973  ???

// This will stop working at some point, currently some pretty central modules
// (e.g. `node-pty`) still require it.
app.allowRendererProcessReuse = false;

var appdir = process.cwd(),
    m = JSON.parse(fs.readFileSync('package.json'));

let win

function createWindow () {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile(path.resolve(appdir,
      (m.app && m.app.main) || m.main || 'index.html'));

  win.on('closed', () => { win = null });
}

app.on('ready', createWindow)
app.on('window-all-closed', () => { app.quit() });

