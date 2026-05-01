import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { MarkProofApi } from '@shared/ipc/contracts';

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }

  return Object.freeze(value);
}

const markProofApi: MarkProofApi = deepFreeze({
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.app.getInfo)
  },
  cases: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.cases.list),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.cases.get, id),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.cases.create, input),
    update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.cases.update, id, input),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.cases.delete, id)
  }
});

contextBridge.exposeInMainWorld('markProof', markProofApi);
