import type { EvidenceHashAlgorithm } from '../constants/hash';

export type AppInfo = {
  name: string;
  version: string;
  disclaimer: string;
  hashAlgorithm: EvidenceHashAlgorithm;
  security: {
    contextIsolation: true;
    nodeIntegration: false;
    sandbox: true;
    remoteContent: false;
  };
};
