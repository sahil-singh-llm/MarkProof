import { registerAppIpc } from './app.ipc';
import { registerCasesIpc } from './cases.ipc';
import type { CaseService } from '../services/case.service';

export type IpcServices = {
  caseService: CaseService;
};

export function registerIpcHandlers(services: IpcServices): void {
  registerAppIpc();
  registerCasesIpc(services.caseService);
}
