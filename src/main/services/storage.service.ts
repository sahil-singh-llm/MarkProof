import { app } from 'electron';
import { extname, join } from 'node:path';

export type EvidenceStorageAddress = {
  caseId: string;
  sha256: string;
  sourceFilename: string;
};

export function getCaseEvidenceDirectory(caseId: string): string {
  return join(app.getPath('userData'), 'cases', caseId, 'evidence');
}

export function getEvidenceStoragePath(address: EvidenceStorageAddress): string {
  const extension = extname(address.sourceFilename).toLowerCase();

  return join(getCaseEvidenceDirectory(address.caseId), `${address.sha256}${extension}`);
}
