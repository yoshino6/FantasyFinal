const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen } = require('electron');
const path = require('node:path');

let petWindow = null;
let tray = null;
let isQuitting = false;

function showPetWindow() {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.show();
  petWindow.moveTop();
}

function createTray() {
  const iconPath = path.join(__dirname, 'pear-cat.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32, quality: 'best' });
  tray = new Tray(icon);
  tray.setToolTip('幻想桌宠');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示桌宠', click: showPetWindow },
    { label: '隐藏桌宠', click: () => petWindow?.hide() },
    { type: 'separator' },
    { label: '退出桌宠', click: () => { isQuitting = true; app.quit(); } }
  ]));
  tray.on('click', () => {
    if (petWindow?.isVisible()) petWindow.hide();
    else showPetWindow();
  });
}

function createPetWindow() {
  petWindow = new BrowserWindow({
    width: 320,
    height: 420,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    title: '幻想桌宠',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.loadFile(path.join(__dirname, 'pet.html'));

  petWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    petWindow.hide();
  });
  petWindow.on('closed', () => { petWindow = null; });
}

ipcMain.handle('window-move', (_event, delta) => {
  if (!petWindow) return;
  const [x, y] = petWindow.getPosition();
  const [w, h] = petWindow.getSize();
  let nx = x + Math.round(delta.dx || 0);
  let ny = y + Math.round(delta.dy || 0);
  const bounds = screen.getDisplayMatching(petWindow.getBounds()).workArea;
  nx = Math.min(Math.max(nx, bounds.x), bounds.x + bounds.width - w);
  ny = Math.min(Math.max(ny, bounds.y), bounds.y + bounds.height - h);
  petWindow.setPosition(nx, ny);
  const clamped = nx !== x + Math.round(delta.dx || 0) || ny !== y + Math.round(delta.dy || 0);
  return { clamped };
});

ipcMain.on('set-ignore-mouse', (_event, ignore) => {
  if (!petWindow) return;
  petWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
});

ipcMain.on('pet-context-menu', (event) => {
  const menu = Menu.buildFromTemplate([
    {
      label: '置顶',
      type: 'checkbox',
      checked: petWindow?.isAlwaysOnTop(),
      click: () => {
        if (!petWindow) return;
        const next = !petWindow.isAlwaysOnTop();
        petWindow.setAlwaysOnTop(next, 'screen-saver');
        event.sender.send('always-on-top-changed', next);
      }
    },
    { type: 'separator' },
    { label: '退出桌宠', click: () => { isQuitting = true; app.quit(); } }
  ]);
  menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
});

app.whenReady().then(() => {
  createTray();
  createPetWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createPetWindow();
  });
});

app.on('window-all-closed', () => {
  // 桌宠由系统托盘托管，窗口隐藏或被关闭时仍保持后台进程。
});

app.on('before-quit', () => {
  isQuitting = true;
});
