import { registerAppIpc } from './app.ipc';
import { registerBundleIpc } from './bundle.ipc';
import { registerCasesIpc } from './cases.ipc';
import { registerEvidenceIpc } from './evidence.ipc';
import type { CaseService } from '../services/case.service';
import type { EvidenceService } from '../services/evidence.service';
import type { PdfBundleService } from '../services/pdf-bundle.service';

export type IpcServices = {
  caseService: CaseService;
  evidenceService: EvidenceService;
  pdfBundleService: PdfBundleService;
};

export function registerIpcHandlers(services: IpcServices): void {
  registerAppIpc();
  registerCasesIpc(services.caseService);
  registerEvidenceIpc(services.evidenceService);
  registerBundleIpc(services.pdfBundleService);
}
