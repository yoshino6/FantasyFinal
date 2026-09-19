const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 320,
    height: 420,
    frame: false,
    transparent: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  await win.loadFile(path.join(__dirname, 'shot-pet-only.html'));
  await new Promise(r => setTimeout(r, 700));
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, 'preview-pet.png'), image.toPNG());
  app.quit();
});
