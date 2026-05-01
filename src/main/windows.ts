import { BrowserWindow, app, session } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function getRendererIndexFileUrl(): string {
  return pathToFileURL(join(__dirname, '../renderer/index.html')).href;
}

function getDevServerUrl(): string | undefined {
  if (app.isPackaged) {
    return undefined;
  }

  return process.env.ELECTRON_RENDERER_URL;
}

function isAllowedRendererUrl(targetUrl: string): boolean {
  try {
    const parsedUrl = new URL(targetUrl);

    if (parsedUrl.protocol === 'file:') {
      const expected = new URL(getRendererIndexFileUrl());

      return parsedUrl.href.toLowerCase() === expected.href.toLowerCase();
    }

    if (app.isPackaged) {
      return false;
    }

    const devServerUrl = getDevServerUrl();

    if (devServerUrl) {
      const devOrigin = new URL(devServerUrl).origin;

      if (parsedUrl.origin === devOrigin) {
        return true;
      }
    }

    return (
      (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'ws:') &&
      LOCAL_DEV_HOSTS.has(parsedUrl.hostname)
    );
  } catch {
    return false;
  }
}

function buildCspHeader(): string {
  const directives = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'"
  ];

  if (app.isPackaged) {
    directives.push("connect-src 'self'");
  } else {
    directives.push(
      "connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*"
    );
    directives.push(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* http://127.0.0.1:*"
    );
  }

  return directives.join('; ') + ';';
}

let sessionConfigured = false;

export function configureDefaultSession(): void {
  if (sessionConfigured) {
    return;
  }

  sessionConfigured = true;

  const csp = buildCspHeader();

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...(details.responseHeaders ?? {}) };

    for (const key of Object.keys(responseHeaders)) {
      if (key.toLowerCase() === 'content-security-policy') {
        delete responseHeaders[key];
      }
    }

    responseHeaders['Content-Security-Policy'] = [csp];
    callback({ responseHeaders });
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  session.defaultSession.setPermissionCheckHandler(() => false);
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
  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  const devServerUrl = getDevServerUrl();

  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}
