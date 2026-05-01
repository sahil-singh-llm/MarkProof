import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AuditRepository } from '../src/main/db/audit.repository';
import { CasesRepository } from '../src/main/db/cases.repository';
import type { SqliteDatabase } from '../src/main/db/database';
import { createInMemoryDatabase } from '../src/main/db/database';
import { EvidenceService } from '../src/main/services/evidence.service';
import { EvidenceStorageService } from '../src/main/services/storage.service';
import type { GoodsService, TrademarkCase } from '../src/shared/types/case';
import type { EvidenceImportResult } from '../src/shared/types/evidence';

const PDF_BYTES = Buffer.from('%PDF-1.4\nInvalid demo PDF\n%%EOF\n');
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00
]);

type TestCase = {
  trademarkCase: TrademarkCase;
  goodsService: GoodsService;
};

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function expectStatus<T extends EvidenceImportResult['status']>(
  result: EvidenceImportResult,
  status: T
): Extract<EvidenceImportResult, { status: T }> {
  if (result.status !== status) {
    throw new Error(`Expected import result status ${status}, received ${JSON.stringify(result)}.`);
  }

  expect(result.status).toBe(status);

  return result as Extract<EvidenceImportResult, { status: T }>;
}

function expectSingleResult(results: readonly EvidenceImportResult[]): EvidenceImportResult {
  expect(results).toHaveLength(1);

  const result = results[0];

  if (!result) {
    throw new Error('Expected one import result.');
  }

  return result;
}

function createTrademarkCase(db: SqliteDatabase): TestCase {
  const cases = new CasesRepository(db);
  const trademarkCase = cases.create({
    markName: 'MarkProof',
    ownerName: 'Example GmbH',
    registrationNumber: '302026000001',
    jurisdiction: 'DPMA',
    usePeriodFrom: '2021-01-01',
    usePeriodTo: '2026-01-01'
  });
  const goodsService = cases.createGoodsService({
    caseId: trademarkCase.id,
    niceClass: 9,
    description: 'Downloadable software for evidence management'
  });

  return {
    trademarkCase,
    goodsService
  };
}

describe('evidence service', () => {
  let db: SqliteDatabase | null = null;
  let tempRoot: string | null = null;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    tempRoot = join(process.cwd(), '.tmp-tests', `evidence-${randomUUID()}`);
    await mkdir(tempRoot, { recursive: true });
  });

  afterEach(async () => {
    db?.close();
    db = null;

    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
      tempRoot = null;
    }
  });

  it('imports a PDF through content-addressed storage and records audit metadata', async () => {
    const currentDb = db as SqliteDatabase;
    const currentTempRoot = tempRoot as string;
    const { trademarkCase } = createTrademarkCase(currentDb);
    const service = new EvidenceService(
      currentDb,
      new EvidenceStorageService(join(currentTempRoot, 'cases'))
    );
    const sourcePath = join(currentTempRoot, 'invoice.pdf');
    await writeFile(sourcePath, PDF_BYTES);

    const result = expectSingleResult(await service.importFiles(trademarkCase.id, [sourcePath]));
    const imported = expectStatus(result, 'imported');
    const evidence = imported.evidence.evidence;

    expect(evidence.sourceFilename).toBe('invoice.pdf');
    expect(evidence.fileHash).toBe(sha256(PDF_BYTES));
    expect(evidence.hashAlgo).toBe('sha256');
    expect(evidence.mimeType).toBe('application/pdf');
    expect(evidence.extractedTextStatus).toBe('failed');
    expect(imported.evidence.dateCandidates.map((candidate) => candidate.source)).toEqual(
      expect.arrayContaining(['file_created', 'file_modified'])
    );
    expect(
      new AuditRepository(currentDb).listByCase(trademarkCase.id).map((entry) => entry.eventType)
    ).toContain('evidence_imported');
  });

  it('returns duplicate import results without creating another evidence row', async () => {
    const currentDb = db as SqliteDatabase;
    const currentTempRoot = tempRoot as string;
    const { trademarkCase } = createTrademarkCase(currentDb);
    const service = new EvidenceService(
      currentDb,
      new EvidenceStorageService(join(currentTempRoot, 'cases'))
    );
    const sourcePath = join(currentTempRoot, 'product.png');
    await writeFile(sourcePath, PNG_BYTES);

    const firstResult = expectSingleResult(
      await service.importFiles(trademarkCase.id, [sourcePath])
    );
    const firstImport = expectStatus(firstResult, 'imported');
    const secondResult = expectSingleResult(
      await service.importFiles(trademarkCase.id, [sourcePath])
    );
    const duplicate = expectStatus(secondResult, 'duplicate');

    expect(duplicate.evidence.evidence.id).toBe(firstImport.evidence.evidence.id);
    expect(service.listByCase(trademarkCase.id)).toHaveLength(1);
    expect(
      new AuditRepository(currentDb)
        .listByCase(trademarkCase.id)
        .filter((entry) => entry.eventType === 'evidence_imported')
    ).toHaveLength(1);
  });

  it('rejects unsupported, mismatched, and oversized files with per-file results', async () => {
    const currentDb = db as SqliteDatabase;
    const currentTempRoot = tempRoot as string;
    const { trademarkCase } = createTrademarkCase(currentDb);
    const service = new EvidenceService(
      currentDb,
      new EvidenceStorageService(join(currentTempRoot, 'cases'), 16)
    );
    const textPath = join(currentTempRoot, 'notes.txt');
    const mismatchedPdfPath = join(currentTempRoot, 'not-a-pdf.pdf');
    const oversizedPath = join(currentTempRoot, 'oversized.pdf');
    await writeFile(textPath, 'plain text');
    await writeFile(mismatchedPdfPath, 'not a pdf');
    await writeFile(oversizedPath, PDF_BYTES);

    const results = await service.importFiles(trademarkCase.id, [
      textPath,
      mismatchedPdfPath,
      oversizedPath
    ]);

    expect(results.map((result) => expectStatus(result, 'rejected').reason)).toEqual([
      'unsupported_type',
      'unsupported_type',
      'too_large'
    ]);
    expect(service.listByCase(trademarkCase.id)).toEqual([]);
  });

  it('updates review metadata, links covered goods/services, deletes evidence, and audits both', async () => {
    const currentDb = db as SqliteDatabase;
    const currentTempRoot = tempRoot as string;
    const { trademarkCase, goodsService } = createTrademarkCase(currentDb);
    const storage = new EvidenceStorageService(join(currentTempRoot, 'cases'));
    const service = new EvidenceService(currentDb, storage);
    const sourcePath = join(currentTempRoot, 'product.png');
    await writeFile(sourcePath, PNG_BYTES);
    const result = expectSingleResult(await service.importFiles(trademarkCase.id, [sourcePath]));
    const imported = expectStatus(result, 'imported');

    const updated = await service.update(imported.evidence.evidence.id, {
      evidenceType: 'photo',
      dateOfUse: '2024-03-15',
      territory: 'Germany',
      coveredGoodsServiceIds: [goodsService.id],
      notes: 'Reviewed product screenshot.'
    });

    expect(updated?.evidence.dateOfUse).toBe('2024-03-15');
    expect(updated?.evidence.territory).toBe('Germany');
    expect(updated?.evidence.notes).toBe('Reviewed product screenshot.');
    expect(updated?.evidence.extractedTextStatus).toBe('not_applicable');
    expect(updated?.goodsServiceLinks).toEqual([
      expect.objectContaining({
        evidenceId: imported.evidence.evidence.id,
        goodsServiceId: goodsService.id
      })
    ]);

    const storedPath = storage.resolveStoredRelativePath(
      imported.evidence.evidence.storedRelativePath
    );
    await expect(access(storedPath)).resolves.toBeUndefined();

    await expect(service.delete(imported.evidence.evidence.id)).resolves.toEqual({ deleted: true });
    await expect(access(storedPath)).rejects.toThrow();
    expect(service.listByCase(trademarkCase.id)).toEqual([]);
    expect(
      new AuditRepository(currentDb).listByCase(trademarkCase.id).map((entry) => entry.eventType)
    ).toEqual(expect.arrayContaining(['evidence_updated', 'evidence_deleted']));
  });
});
