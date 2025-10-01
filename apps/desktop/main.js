const { app, BrowserWindow, dialog, ipcMain, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const STORAGE_ROOT = 'SchematicsApp';
const STORAGE_SUBDIRS = ['downloads', 'imports', 'backups'];

function ensureStorageDirs() {
  const documentsDir = app.getPath('documents');
  const storageRoot = path.join(documentsDir, STORAGE_ROOT);
  if (!fs.existsSync(storageRoot)) {
    fs.mkdirSync(storageRoot, { recursive: true });
  }

  const resolved = { root: storageRoot };
  for (const name of STORAGE_SUBDIRS) {
    const target = path.join(storageRoot, name);
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
    }
    resolved[name] = target;
  }
  return resolved;
}

function getDistDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'dist');
  }
  return path.resolve(__dirname, '../../dist');
}

function registerIpc(storagePaths) {
  ipcMain.handle('filesystem:select-import', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      defaultPath: storagePaths.imports
    });
    if (result.canceled || !result.filePaths.length) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('filesystem:get-paths', async () => storagePaths);
}

function createWindow(storagePaths) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false
    }
  });

  const distDir = getDistDir();
  const indexFile = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexFile)) {
    win.loadURL('data:text/plain;charset=utf-8,' + encodeURIComponent('Build output not found. Run "npm run build" before starting the desktop shell.'));
  } else {
    win.loadFile(indexFile);
  }

  return win;
}

app.whenReady().then(() => {
  const storagePaths = ensureStorageDirs();
  app.setPath('downloads', storagePaths.downloads);

  session.defaultSession.on('will-download', (event, item) => {
    const filePath = path.join(storagePaths.downloads, item.getFilename());
    item.setSavePath(filePath);
  });

  registerIpc(storagePaths);
  createWindow(storagePaths);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(storagePaths);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
