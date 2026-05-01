import { app } from 'electron';
import { extname, join, resolve, sep } from 'node:path';

export type EvidenceStorageAddress = {
  caseId: string;
  sha256: string;
  sourceFilename: string;
};

const CASE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA_256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_EXTENSION_PATTERN = /^\.[a-z0-9]{1,16}$/;

function getCasesRoot(): string {
  return resolve(app.getPath('userData'), 'cases');
}

function assertWithinCasesRoot(candidatePath: string): string {
  const resolved = resolve(candidatePath);
  const root = getCasesRoot();

  if (resolved !== root && !resolved.startsWith(root + sep)) {
    throw new Error('Resolved path escapes the cases directory.');
  }

  return resolved;
}

export function getCaseEvidenceDirectory(caseId: string): string {
  if (!CASE_ID_PATTERN.test(caseId)) {
    throw new Error('caseId must be a UUID.');
  }

  return assertWithinCasesRoot(join(getCasesRoot(), caseId, 'evidence'));
}

export function getEvidenceStoragePath(address: EvidenceStorageAddress): string {
  if (!SHA_256_PATTERN.test(address.sha256)) {
    throw new Error('sha256 must be a lowercase SHA-256 hex digest.');
  }

  const extension = extname(address.sourceFilename).toLowerCase();

  if (extension !== '' && !SAFE_EXTENSION_PATTERN.test(extension)) {
    throw new Error('sourceFilename has an unsupported file extension.');
  }

  return assertWithinCasesRoot(
    join(getCaseEvidenceDirectory(address.caseId), `${address.sha256}${extension}`)
  );
}
