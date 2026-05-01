import { app } from 'electron';

import { LEGAL_DISCLAIMER } from '@shared/constants/disclaimer';
import { EVIDENCE_HASH_ALGORITHM } from '@shared/constants/hash';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { AppInfo } from '@shared/types/app';

import { registerSafeHandle } from './safe-handler';

export function registerAppIpc(): void {
  registerSafeHandle(IPC_CHANNELS.app.getInfo, (): AppInfo => {
    return {
      name: 'MarkProof',
      version: app.getVersion(),
      disclaimer: LEGAL_DISCLAIMER,
      hashAlgorithm: EVIDENCE_HASH_ALGORITHM,
      security: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        remoteContent: false
      }
    };
  });
}
