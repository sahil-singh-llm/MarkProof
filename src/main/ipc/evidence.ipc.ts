import { BrowserWindow, dialog } from 'electron';
import type { OpenDialogOptions } from 'electron';

import { IPC_CHANNELS } from '@shared/ipc/channels';

import { registerSafeHandle } from './safe-handler';
import type { EvidenceService } from '../services/evidence.service';
import { parseCaseId } from '../validation/cases.validation';
import { parseEvidenceId, parseUpdateEvidenceReviewInput } from '../validation/evidence.validation';

const evidenceFileFilters = [
  {
    name: 'Evidence files',
    extensions: ['pdf', 'jpg', 'jpeg', 'png']
  }
];

export function registerEvidenceIpc(evidenceService: EvidenceService): void {
  registerSafeHandle(IPC_CHANNELS.evidence.chooseAndImport, async (event, caseId) => {
    const parsedCaseId = parseCaseId(caseId);
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: 'Import evidence files',
      properties: ['openFile', 'multiSelections'],
      filters: evidenceFileFilters
    };
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return [];
    }

    return evidenceService.importFiles(parsedCaseId, result.filePaths);
  });

  registerSafeHandle(IPC_CHANNELS.evidence.listByCase, (_event, caseId) =>
    evidenceService.listByCase(parseCaseId(caseId))
  );

  registerSafeHandle(IPC_CHANNELS.evidence.update, (_event, id, input) =>
    evidenceService.update(parseEvidenceId(id), parseUpdateEvidenceReviewInput(input))
  );

  registerSafeHandle(IPC_CHANNELS.evidence.delete, (_event, id) =>
    evidenceService.delete(parseEvidenceId(id))
  );
}
