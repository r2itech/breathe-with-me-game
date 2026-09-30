const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');

let win = null;

// only ever hand real web links to the OS
function openSafe(url) {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    resizable: true,
    minWidth: 640,
    minHeight: 360,
    backgroundColor: '#000000',
    title: 'Breathe With Me',
    autoHideMenuBar: true,
    // lives next to main.cjs so it ships inside the asar too
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required',
      // keep the music/breath timing alive if the window is behind something
      backgroundThrottling: false,
    },
  });

  win.setMenu(null);

  // no popup windows: external links open in the system browser instead
  win.webContents.setWindowOpenHandler(({ url }) => {
    openSafe(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault();
      openSafe(url);
    }
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  win.on('closed', () => {
    win = null;
  });
}

ipcMain.on('hs:set-fullscreen', (_e, on) => {
  if (win) win.setFullScreen(!!on);
});

ipcMain.handle('hs:is-fullscreen', () => (win ? win.isFullScreen() : false));

ipcMain.on('hs:open-external', (_e, url) => openSafe(url));

ipcMain.on('hs:quit', () => {
  app.quit();
});

Menu.setApplicationMenu(null);

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});
