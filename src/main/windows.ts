import { BrowserWindow, app } from 'electron';
import { join } from 'node:path';

const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function isAllowedRendererUrl(targetUrl: string): boolean {
  try {
    const parsedUrl = new URL(targetUrl);

    if (parsedUrl.protocol === 'file:') {
      return true;
    }

    return !app.isPackaged && LOCAL_DEV_HOSTS.has(parsedUrl.hostname);
  } catch {
    return false;
  }
}

export async function createMainWindow(): Promise<BrowserWindow> {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    title: 'MarkProof',
    backgroundColor: '#f6f7f3',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isAllowedRendererUrl(targetUrl)) {
      event.preventDefault();
    }
  });

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;

  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}
