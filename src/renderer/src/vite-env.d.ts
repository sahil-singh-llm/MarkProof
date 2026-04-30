/// <reference types="vite/client" />

import type { MarkProofApi } from '../../shared/ipc/contracts';

declare global {
  interface Window {
    markProof: MarkProofApi;
  }
}

export {};
