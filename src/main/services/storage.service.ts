import { app } from 'electron';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, open, rename, stat, unlink } from 'node:fs/promises';
import { basename, extname, join, resolve, sep } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';

export type EvidenceStorageAddress = {
  caseId: string;
  sha256: string;
  sourceFilename: string;
};

export type StoredEvidenceFileKind = 'pdf' | 'jpeg' | 'png';

export type StoredEvidenceFile = {
  sourceFilename: string;
  sha256: string;
  storedAbsolutePath: string;
  storedRelativePath: string;
  fileSizeBytes: number;
  mimeType: string;
  kind: StoredEvidenceFileKind;
  fileCreatedAt: string | null;
  fileModifiedAt: string | null;
  alreadyStored: boolean;
};

export type EvidenceStorageRejectedReason =
  | 'unsupported_type'
  | 'too_large'
  | 'not_found'
  | 'read_failed'
  | 'copy_failed';

export class EvidenceStorageError extends Error {
  constructor(
    readonly reason: EvidenceStorageRejectedReason,
    message: string
  ) {
    super(message);
    this.name = 'EvidenceStorageError';
  }
}

const CASE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA_256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_EXTENSION_PATTERN = /^\.[a-z0-9]{1,16}$/;
const DEFAULT_MAX_FILE_SIZE_BYTES = 250 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);

function getCasesRoot(): string {
  return resolve(app.getPath('userData'), 'cases');
}

function ensureValidCaseId(caseId: string): void {
  if (!CASE_ID_PATTERN.test(caseId)) {
    throw new Error('caseId must be a UUID.');
  }
}

function ensureValidSha256(sha256: string): void {
  if (!SHA_256_PATTERN.test(sha256)) {
    throw new Error('sha256 must be a lowercase SHA-256 hex digest.');
  }
}

function ensureSafeExtension(extension: string): void {
  if (extension !== '' && !SAFE_EXTENSION_PATTERN.test(extension)) {
    throw new Error('sourceFilename has an unsupported file extension.');
  }
}

function toIsoOrNull(value: Date): string | null {
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

function formatImportLimit(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

function detectFileKind(
  extension: string,
  header: Buffer
): { kind: StoredEvidenceFileKind; mimeType: string } | null {
  if (extension === '.pdf' && header.subarray(0, 4).equals(Buffer.from('%PDF'))) {
    return { kind: 'pdf', mimeType: 'application/pdf' };
  }

  if (
    (extension === '.jpg' || extension === '.jpeg') &&
    header.length >= 3 &&
    header[0] === 0xff &&
    header[1] === 0xd8 &&
    header[2] === 0xff
  ) {
    return { kind: 'jpeg', mimeType: 'image/jpeg' };
  }

  if (
    extension === '.png' &&
    header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { kind: 'png', mimeType: 'image/png' };
  }

  return null;
}

async function fsyncFile(path: string): Promise<void> {
  const fileHandle = await open(path, 'r+');

  try {
    await fileHandle.sync();
  } finally {
    await fileHandle.close();
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export class EvidenceStorageService {
  private readonly casesRoot: string | null;

  constructor(
    casesRoot?: string,
    private readonly maxFileSizeBytes: number = DEFAULT_MAX_FILE_SIZE_BYTES
  ) {
    this.casesRoot = casesRoot ? resolve(casesRoot) : null;
  }

  getCaseEvidenceDirectory(caseId: string): string {
    ensureValidCaseId(caseId);

    return this.assertWithinCasesRoot(join(this.getCasesRoot(), caseId, 'evidence'));
  }

  getEvidenceStoragePath(address: EvidenceStorageAddress): string {
    ensureValidSha256(address.sha256);

    const extension = extname(address.sourceFilename).toLowerCase();
    ensureSafeExtension(extension);

    return this.assertWithinCasesRoot(
      join(this.getCaseEvidenceDirectory(address.caseId), `${address.sha256}${extension}`)
    );
  }

  getEvidenceStorageRelativePath(address: EvidenceStorageAddress): string {
    ensureValidCaseId(address.caseId);
    ensureValidSha256(address.sha256);

    const extension = extname(address.sourceFilename).toLowerCase();
    ensureSafeExtension(extension);

    return `cases/${address.caseId}/evidence/${address.sha256}${extension}`;
  }

  resolveStoredRelativePath(storedRelativePath: string): string {
    if (!storedRelativePath.startsWith('cases/')) {
      throw new Error('storedRelativePath must start with cases/.');
    }

    const withoutRoot = storedRelativePath.slice('cases/'.length);

    return this.assertWithinCasesRoot(join(this.getCasesRoot(), withoutRoot));
  }

  async storeFile(caseId: string, sourcePath: string): Promise<StoredEvidenceFile> {
    const sourceFilename = basename(sourcePath);
    const extension = extname(sourceFilename).toLowerCase();

    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      throw new EvidenceStorageError(
        'unsupported_type',
        'Only PDF, JPEG, and PNG files are supported.'
      );
    }

    let sourceStats: Awaited<ReturnType<typeof stat>>;

    try {
      sourceStats = await stat(sourcePath);
    } catch {
      throw new EvidenceStorageError('not_found', 'The selected file could not be found.');
    }

    if (!sourceStats.isFile()) {
      throw new EvidenceStorageError('unsupported_type', 'Only regular files can be imported.');
    }

    if (sourceStats.size > this.maxFileSizeBytes) {
      throw new EvidenceStorageError(
        'too_large',
        `File exceeds the ${formatImportLimit(this.maxFileSizeBytes)} import limit.`
      );
    }

    const evidenceDirectory = this.getCaseEvidenceDirectory(caseId);
    await mkdir(evidenceDirectory, { recursive: true });

    const tempPath = join(evidenceDirectory, `.import-${randomUUID()}.tmp`);
    const hash = createHash('sha256');
    let header = Buffer.alloc(0);
    let bytesWritten = 0;

    try {
      const hashAndSniffStream = new Transform({
        transform(chunk: Buffer, _encoding, callback): void {
          bytesWritten += chunk.length;
          hash.update(chunk);

          if (header.length < 16) {
            header = Buffer.concat([header, chunk]).subarray(0, 16);
          }

          callback(null, chunk);
        }
      });

      await pipeline(
        createReadStream(sourcePath),
        hashAndSniffStream,
        createWriteStream(tempPath, { flags: 'wx' })
      );
      await fsyncFile(tempPath);
    } catch {
      await unlink(tempPath).catch(() => undefined);
      throw new EvidenceStorageError('copy_failed', 'The selected file could not be copied.');
    }

    if (bytesWritten !== sourceStats.size) {
      await unlink(tempPath).catch(() => undefined);
      throw new EvidenceStorageError('read_failed', 'The selected file changed during import.');
    }

    const detected = detectFileKind(extension, header);

    if (!detected) {
      await unlink(tempPath).catch(() => undefined);
      throw new EvidenceStorageError(
        'unsupported_type',
        'File content does not match its extension.'
      );
    }

    const sha256 = hash.digest('hex');
    const address = { caseId, sha256, sourceFilename };
    const storedAbsolutePath = this.getEvidenceStoragePath(address);
    const storedRelativePath = this.getEvidenceStorageRelativePath(address);
    let alreadyStored = false;

    if (await pathExists(storedAbsolutePath)) {
      alreadyStored = true;
      await unlink(tempPath).catch(() => undefined);
    } else {
      try {
        await rename(tempPath, storedAbsolutePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          alreadyStored = true;
          await unlink(tempPath).catch(() => undefined);
        } else {
          throw error;
        }
      }
    }

    return {
      sourceFilename,
      sha256,
      storedAbsolutePath,
      storedRelativePath,
      fileSizeBytes: sourceStats.size,
      mimeType: detected.mimeType,
      kind: detected.kind,
      fileCreatedAt: toIsoOrNull(sourceStats.birthtime),
      fileModifiedAt: toIsoOrNull(sourceStats.mtime),
      alreadyStored
    };
  }

  async deleteStoredFile(storedRelativePath: string): Promise<void> {
    const storedAbsolutePath = this.resolveStoredRelativePath(storedRelativePath);

    await unlink(storedAbsolutePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    });
  }

  private assertWithinCasesRoot(candidatePath: string): string {
    const resolved = resolve(candidatePath);
    const root = this.getCasesRoot();

    if (resolved !== root && !resolved.startsWith(root + sep)) {
      throw new Error('Resolved path escapes the cases directory.');
    }

    return resolved;
  }

  private getCasesRoot(): string {
    return this.casesRoot ?? getCasesRoot();
  }
}

export function getCaseEvidenceDirectory(caseId: string): string {
  return new EvidenceStorageService().getCaseEvidenceDirectory(caseId);
}

export function getEvidenceStoragePath(address: EvidenceStorageAddress): string {
  return new EvidenceStorageService().getEvidenceStoragePath(address);
}
