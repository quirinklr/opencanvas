const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { encodeOCP, decodeOCP } = require('../shared/ocp');
const { validateDimensions, validateSavePayload, ensurePNGBase64 } = require('../preload/schema');

const APP_NAME = 'OpenCanvas';
const DEFAULT_FILE_NAME = 'untitled.ocp';
let mainWindow = null;
let currentFilePath = null;

function resolvePath(...segments) {
  return path.join(__dirname, ...segments);
}

function setWindowTitle(fileName = DEFAULT_FILE_NAME) {
  if (mainWindow) {
    mainWindow.setTitle(`${APP_NAME} - ${fileName}`);
  }
}

function ensureOcpExtension(filePath) {
  if (!filePath) return null;
  return path.extname(filePath).toLowerCase() === '.ocp' ? filePath : `${filePath}.ocp`;
}

function ensurePngExtension(filePath) {
  if (!filePath) return null;
  return path.extname(filePath).toLowerCase() === '.png' ? filePath : `${filePath}.png`;
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: `${APP_NAME} - ${DEFAULT_FILE_NAME}`,
    icon: resolvePath('..', '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: resolvePath('..', 'preload', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  const template = [
  {
    label: "View",
    submenu: [
      { role: "reload" },
      { role: "forcereload" },
      { role: "toggledevtools" }
    ]
  }
]

const menu = Menu.buildFromTemplate(template)

  Menu.setApplicationMenu(menu);

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  await mainWindow.loadFile(resolvePath('..', 'renderer', 'index.html'));
  setWindowTitle(DEFAULT_FILE_NAME);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpcHandlers() {
  ipcMain.handle('document:new', async (_event, data) => {
    const { width, height } = validateDimensions(data.width, data.height);
    currentFilePath = null;
    setWindowTitle(DEFAULT_FILE_NAME);
    return { fileName: DEFAULT_FILE_NAME, width, height };
  });

  ipcMain.handle('dialog:openOCP', async () => {
    if (!mainWindow) {
      return { canceled: true };
    }

    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'OpenCanvas Project',
      filters: [{ name: 'OpenCanvas Project', extensions: ['ocp'] }],
      properties: ['openFile']
    });

    if (canceled || !filePaths || filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = filePaths[0];

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const document = decodeOCP(content);
      currentFilePath = filePath;
      const fileName = path.basename(filePath);
      setWindowTitle(fileName);
      return {
        canceled: false,
        filePath,
        fileName,
        document
      };
    } catch (error) {
      dialog.showErrorBox(APP_NAME, `Could not open file: ${error.message}`);
      return { canceled: true, error: error.message };
    }
  });

  ipcMain.handle('dialog:saveOCP', async (_event, payload) => {
    let parsed;
    try {
      parsed = validateSavePayload(payload);
    } catch (error) {
      return { canceled: true, error: error.message };
    }

    const saveAs = Boolean(parsed.saveAs);
    let targetPath = currentFilePath;

    if (!targetPath || saveAs) {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'OpenCanvas Project',
        defaultPath: targetPath || path.join(app.getPath('documents'), DEFAULT_FILE_NAME),
        filters: [{ name: 'OpenCanvas Project', extensions: ['ocp'] }]
      });

      if (canceled || !filePath) {
        return { canceled: true };
      }

      targetPath = ensureOcpExtension(filePath);
    }

    const ocpContent = encodeOCP({
      width: parsed.width,
      height: parsed.height,
      pngBase64: parsed.pngBase64,
      meta: parsed.meta
    });

    try {
      await fs.writeFile(targetPath, ocpContent, 'utf8');
      currentFilePath = targetPath;
      const fileName = path.basename(targetPath);
      setWindowTitle(fileName);
      return { canceled: false, filePath: targetPath, fileName };
    } catch (error) {
      dialog.showErrorBox(APP_NAME, `Could not save file: ${error.message}`);
      return { canceled: true, error: error.message };
    }
  });

  ipcMain.handle('dialog:exportPNG', async (_event, payload) => {
    try {
      const pngBase64 = ensurePNGBase64(payload.pngBase64);
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Export PNG',
        defaultPath: path.join(app.getPath('pictures'), 'canvas.png'),
        filters: [{ name: 'PNG Image', extensions: ['png'] }]
      });

      if (canceled || !filePath) {
        return { canceled: true };
      }

      const targetPath = ensurePngExtension(filePath);
      const buffer = Buffer.from(pngBase64, 'base64');
      await fs.writeFile(targetPath, buffer);
      return { canceled: false, filePath: targetPath };
    } catch (error) {
      dialog.showErrorBox(APP_NAME, `PNG export failed: ${error.message}`);
      return { canceled: true, error: error.message };
    }
  });
}

app.name = APP_NAME;

app.whenReady().then(async () => {
  await createMainWindow();
  registerIpcHandlers();
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createMainWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});