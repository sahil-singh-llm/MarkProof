import type { AppInfo } from '../types/app';

export type MarkProofApi = {
  app: {
    getInfo: () => Promise<AppInfo>;
  };
};
