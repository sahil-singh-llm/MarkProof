import { BrowserWindow, app, protocol, session } from 'electron';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const APP_PROTOCOL = 'markproof';
const APP_HOST = 'app';
const APP_ORIGIN = `${APP_PROTOCOL}://${APP_HOST}`;

function getRendererIndexFileUrl(): string {
  return pathToFileURL(join(__dirname, '../renderer/index.html')).href;
}

function getRendererRoot(): string {
  return resolve(__dirname, '../renderer');
}

function getRendererAppUrl(): string {
  return `${APP_ORIGIN}/index.html`;
}

function getDevServerUrl(): string | undefined {
  if (app.isPackaged) {
    return undefined;
  }

  return process.env.ELECTRON_RENDERER_URL;
}

export function isAllowedRendererUrl(targetUrl: string): boolean {
  try {
    const parsedUrl = new URL(targetUrl);

    if (parsedUrl.protocol === 'file:') {
      const expected = new URL(getRendererIndexFileUrl());

      return parsedUrl.href.toLowerCase() === expected.href.toLowerCase();
    }

    if (parsedUrl.protocol === `${APP_PROTOCOL}:`) {
      return (
        parsedUrl.hostname === APP_HOST &&
        (parsedUrl.pathname === '/' || parsedUrl.pathname === '/index.html')
      );
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
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'"
  ];

  if (app.isPackaged) {
    directives.push("script-src 'self'");
    directives.push("connect-src 'self'");
  } else {
    directives.push(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* http://127.0.0.1:*"
    );
    directives.push(
      "connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*"
    );
  }

  return directives.join('; ') + ';';
}

let sessionConfigured = false;
let appProtocolRegistered = false;
let appProtocolHandlerRegistered = false;

export function registerAppProtocol(): void {
  if (appProtocolRegistered) {
    return;
  }

  appProtocolRegistered = true;
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true
      }
    }
  ]);
}

function getContentType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}

function resolveRendererAssetPath(pathname: string): string {
  const rendererRoot = getRendererRoot();
  const relativePath = decodeURIComponent(pathname === '/' ? '/index.html' : pathname).replace(
    /^\/+/,
    ''
  );
  const resolved = resolve(rendererRoot, relativePath);

  if (resolved !== rendererRoot && !resolved.startsWith(rendererRoot + sep)) {
    throw new Error('Renderer asset path escapes the renderer directory.');
  }

  return resolved;
}

function registerAppProtocolHandler(): void {
  if (appProtocolHandlerRegistered) {
    return;
  }

  appProtocolHandlerRegistered = true;
  protocol.handle(APP_PROTOCOL, async (request) => {
    try {
      const requestUrl = new URL(request.url);

      if (requestUrl.hostname !== APP_HOST) {
        return new Response('Not found.', { status: 404 });
      }

      const assetPath = resolveRendererAssetPath(requestUrl.pathname);
      const body = await readFile(assetPath);

      return new Response(new Uint8Array(body), {
        headers: {
          'Content-Type': getContentType(assetPath),
          'Content-Security-Policy': buildCspHeader()
        }
      });
    } catch {
      return new Response('Not found.', { status: 404 });
    }
  });
}

export function configureDefaultSession(): void {
  if (sessionConfigured) {
    return;
  }

  sessionConfigured = true;
  registerAppProtocolHandler();

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
    await mainWindow.loadURL(getRendererAppUrl());
  }

  return mainWindow;
}
