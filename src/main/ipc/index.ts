import { registerAppIpc } from './app.ipc';
import { registerCasesIpc } from './cases.ipc';
import { registerEvidenceIpc } from './evidence.ipc';
import type { CaseService } from '../services/case.service';
import type { EvidenceService } from '../services/evidence.service';

export type IpcServices = {
  caseService: CaseService;
  evidenceService: EvidenceService;
};

export function registerIpcHandlers(services: IpcServices): void {
  registerAppIpc();
  registerCasesIpc(services.caseService);
  registerEvidenceIpc(services.evidenceService);
}
