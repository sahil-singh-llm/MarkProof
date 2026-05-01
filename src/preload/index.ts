import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { IpcChannelContract, MarkProofApi } from '@shared/ipc/contracts';

type ContractArgs<TChannel extends keyof IpcChannelContract> = Parameters<
  IpcChannelContract[TChannel]
>;
type ContractReturn<TChannel extends keyof IpcChannelContract> = Awaited<
  ReturnType<IpcChannelContract[TChannel]>
>;

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }

  return Object.freeze(value);
}

function invoke<TChannel extends keyof IpcChannelContract>(
  channel: TChannel,
  ...args: ContractArgs<TChannel>
): Promise<ContractReturn<TChannel>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<ContractReturn<TChannel>>;
}

const markProofApi: MarkProofApi = deepFreeze({
  app: {
    getInfo: () => invoke(IPC_CHANNELS.app.getInfo)
  },
  cases: {
    list: () => invoke(IPC_CHANNELS.cases.list),
    get: (id) => invoke(IPC_CHANNELS.cases.get, id),
    create: (input) => invoke(IPC_CHANNELS.cases.create, input),
    update: (id, input) => invoke(IPC_CHANNELS.cases.update, id, input),
    delete: (id) => invoke(IPC_CHANNELS.cases.delete, id)
  },
  evidence: {
    chooseAndImport: (caseId) => invoke(IPC_CHANNELS.evidence.chooseAndImport, caseId),
    listByCase: (caseId) => invoke(IPC_CHANNELS.evidence.listByCase, caseId),
    update: (id, input) => invoke(IPC_CHANNELS.evidence.update, id, input),
    delete: (id) => invoke(IPC_CHANNELS.evidence.delete, id)
  },
  bundle: {
    chooseAndExport: (caseId) => invoke(IPC_CHANNELS.bundle.chooseAndExport, caseId)
  }
});

contextBridge.exposeInMainWorld('markProof', markProofApi);
