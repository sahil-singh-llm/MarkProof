import { IPC_CHANNELS } from '@shared/ipc/channels';

import { registerSafeHandle } from './safe-handler';
import type { CaseService } from '../services/case.service';
import {
  parseCaseId,
  parseCreateTrademarkCaseRecordInput,
  parseUpdateTrademarkCaseRecordInput
} from '../validation/cases.validation';

export function registerCasesIpc(caseService: CaseService): void {
  registerSafeHandle(IPC_CHANNELS.cases.list, () => caseService.list());

  registerSafeHandle(IPC_CHANNELS.cases.get, (_event, id) => caseService.get(parseCaseId(id)));

  registerSafeHandle(IPC_CHANNELS.cases.create, (_event, input) =>
    caseService.create(parseCreateTrademarkCaseRecordInput(input))
  );

  registerSafeHandle(IPC_CHANNELS.cases.update, (_event, id, input) =>
    caseService.update(parseCaseId(id), parseUpdateTrademarkCaseRecordInput(input))
  );

  registerSafeHandle(IPC_CHANNELS.cases.delete, (_event, id) =>
    caseService.delete(parseCaseId(id))
  );
}
