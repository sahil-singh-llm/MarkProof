import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

import { openDatabase } from './db/database';
import type { SqliteDatabase } from './db/database';
import { registerIpcHandlers } from './ipc';
import { CaseService } from './services/case.service';
import { EvidenceService } from './services/evidence.service';
import { PdfBundleService } from './services/pdf-bundle.service';
import { configureDefaultSession, createMainWindow, registerAppProtocol } from './windows';

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
  registerAppLifecycle();
  registerAppProtocol();

  await app.whenReady();
  configureDefaultSession();
  applicationDatabase = openDatabase(join(app.getPath('userData'), 'markproof.sqlite3'));
  registerIpcHandlers({
    caseService: new CaseService(applicationDatabase),
    evidenceService: new EvidenceService(applicationDatabase),
    pdfBundleService: new PdfBundleService(applicationDatabase)
  });
  await createMainWindow();
}

void bootstrap();
