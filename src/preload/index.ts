import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { MarkProofApi } from '@shared/ipc/contracts';

const markProofApi: MarkProofApi = Object.freeze({
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.app.getInfo)
  }
});

contextBridge.exposeInMainWorld('markProof', markProofApi);
