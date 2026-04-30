import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

import { openDatabase } from './db/database';
import type { SqliteDatabase } from './db/database';
import { registerIpcHandlers } from './ipc';
import { createMainWindow } from './windows';

let applicationDatabase: SqliteDatabase | null = null;

function registerAppLifecycle(): void {
  app.on('before-quit', () => {
    applicationDatabase?.close();
    applicationDatabase = null;
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

async function bootstrap(): Promise<void> {
  registerIpcHandlers();
  registerAppLifecycle();

  await app.whenReady();
  applicationDatabase = openDatabase(join(app.getPath('userData'), 'markproof.sqlite3'));
  await createMainWindow();
}

void bootstrap();
