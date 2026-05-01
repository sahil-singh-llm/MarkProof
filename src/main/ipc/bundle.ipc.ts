import { BrowserWindow, dialog } from 'electron';
import type { SaveDialogOptions } from 'electron';
import { extname } from 'node:path';

import { IPC_CHANNELS } from '@shared/ipc/channels';

import { registerSafeHandle } from './safe-handler';
import type { PdfBundleService } from '../services/pdf-bundle.service';
import { parseCaseId } from '../validation/cases.validation';

function ensurePdfExtension(filePath: string): string {
  return extname(filePath).toLowerCase() === '.pdf' ? filePath : `${filePath}.pdf`;
}

export function registerBundleIpc(pdfBundleService: PdfBundleService): void {
  registerSafeHandle(IPC_CHANNELS.bundle.chooseAndExport, async (event, caseId) => {
    const parsedCaseId = parseCaseId(caseId);
    const suggestedFilename = pdfBundleService.getSuggestedFilename(parsedCaseId);

    if (!suggestedFilename) {
      return { status: 'case_not_found' };
    }

    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const options: SaveDialogOptions = {
      title: 'Export PDF evidence bundle',
      defaultPath: suggestedFilename,
      filters: [
        {
          name: 'PDF bundle',
          extensions: ['pdf']
        }
      ]
    };
    const result = parentWindow
      ? await dialog.showSaveDialog(parentWindow, options)
      : await dialog.showSaveDialog(options);

    if (result.canceled || !result.filePath) {
      return { status: 'cancelled' };
    }

    return (
      (await pdfBundleService.exportCaseBundle(
        parsedCaseId,
        ensurePdfExtension(result.filePath)
      )) ?? { status: 'case_not_found' }
    );
  });
}
