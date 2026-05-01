import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AuditRepository } from '../src/main/db/audit.repository';
import { CasesRepository } from '../src/main/db/cases.repository';
import { EvidenceRepository } from '../src/main/db/evidence.repository';
import type { SqliteDatabase } from '../src/main/db/database';
import { createInMemoryDatabase } from '../src/main/db/database';
import { EvidenceService } from '../src/main/services/evidence.service';
import { EvidenceStorageService } from '../src/main/services/storage.service';
import {
  parseEvidenceId,
  parseUpdateEvidenceReviewInput
} from '../src/main/validation/evidence.validation';
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

async function createSearchablePdfBytes(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([420, 240]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  page.drawText('MarkProof invoice dated 2024-03-15 for trademark use review.', {
    x: 40,
    y: 150,
    size: 12,
    font
  });

  return Buffer.from(await pdf.save());
}

function createExifJpegBytes(dateTimeOriginal: string): Buffer {
  const dateBytes = Buffer.from(`${dateTimeOriginal}\0`, 'ascii');
  const tiff = Buffer.alloc(8 + 2 + 12 + 4 + 2 + 12 + 4 + dateBytes.length);
  let offset = 0;

  tiff.write('II', offset, 'ascii');
  offset += 2;
  tiff.writeUInt16LE(42, offset);
  offset += 2;
  tiff.writeUInt32LE(8, offset);
  offset += 4;

  // IFD0 only points to the EXIF sub-IFD where DateTimeOriginal lives.
  tiff.writeUInt16LE(1, offset);
  offset += 2;
  tiff.writeUInt16LE(0x8769, offset);
  offset += 2;
  tiff.writeUInt16LE(4, offset);
  offset += 2;
  tiff.writeUInt32LE(1, offset);
  offset += 4;
  const exifIfdOffset = 8 + 2 + 12 + 4;
  tiff.writeUInt32LE(exifIfdOffset, offset);
  offset += 4;
  tiff.writeUInt32LE(0, offset);
  offset += 4;

  tiff.writeUInt16LE(1, offset);
  offset += 2;
  tiff.writeUInt16LE(0x9003, offset);
  offset += 2;
  tiff.writeUInt16LE(2, offset);
  offset += 2;
  tiff.writeUInt32LE(dateBytes.length, offset);
  offset += 4;
  const dateOffset = exifIfdOffset + 2 + 12 + 4;
  tiff.writeUInt32LE(dateOffset, offset);
  offset += 4;
  tiff.writeUInt32LE(0, offset);
  offset += 4;
  dateBytes.copy(tiff, offset);

  const exifHeader = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
  const app1 = Buffer.alloc(4);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(exifHeader.length + 2, 2);

  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, exifHeader, Buffer.from([0xff, 0xd9])]);
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

  it('extracts text and candidate dates from a parseable PDF', async () => {
    const currentDb = db as SqliteDatabase;
    const currentTempRoot = tempRoot as string;
    const { trademarkCase } = createTrademarkCase(currentDb);
    const service = new EvidenceService(
      currentDb,
      new EvidenceStorageService(join(currentTempRoot, 'cases'))
    );
    const sourcePath = join(currentTempRoot, 'searchable-invoice.pdf');
    await writeFile(sourcePath, await createSearchablePdfBytes());

    const result = expectSingleResult(await service.importFiles(trademarkCase.id, [sourcePath]));
    const imported = expectStatus(result, 'imported');

    expect(imported.evidence.evidence.extractedTextStatus).toBe('completed');
    expect(imported.evidence.evidence.extractedText).toContain('MarkProof invoice');
    expect(imported.evidence.dateCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidateDate: '2024-03-15',
          source: 'pdf_text'
        })
      ])
    );
  });

  it('extracts EXIF metadata and candidate dates from a JPEG', async () => {
    const currentDb = db as SqliteDatabase;
    const currentTempRoot = tempRoot as string;
    const { trademarkCase } = createTrademarkCase(currentDb);
    const service = new EvidenceService(
      currentDb,
      new EvidenceStorageService(join(currentTempRoot, 'cases'))
    );
    const sourcePath = join(currentTempRoot, 'photo-with-exif.jpg');
    await writeFile(sourcePath, createExifJpegBytes('2024:05:10 10:30:00'));

    const result = expectSingleResult(await service.importFiles(trademarkCase.id, [sourcePath]));
    const imported = expectStatus(result, 'imported');

    expect(imported.evidence.evidence.extractedTextStatus).toBe('not_applicable');
    expect(imported.evidence.evidence.exifJson).toEqual(
      expect.objectContaining({
        DateTimeOriginal: expect.stringMatching(/^2024-05-10T/)
      })
    );
    expect(imported.evidence.dateCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidateDate: '2024-05-10',
          source: 'exif'
        })
      ])
    );
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

  it('rejects goods/services links from another case', async () => {
    const currentDb = db as SqliteDatabase;
    const currentTempRoot = tempRoot as string;
    const cases = new CasesRepository(currentDb);
    const caseA = createTrademarkCase(currentDb);
    const trademarkCaseB = cases.create({
      markName: 'Other Mark',
      ownerName: 'Other GmbH',
      registrationNumber: '302026000002',
      jurisdiction: 'EUIPO',
      usePeriodFrom: '2021-01-01',
      usePeriodTo: '2026-01-01'
    });
    const goodsServiceB = cases.createGoodsService({
      caseId: trademarkCaseB.id,
      niceClass: 35,
      description: 'Advertising services for unrelated products'
    });
    const service = new EvidenceService(
      currentDb,
      new EvidenceStorageService(join(currentTempRoot, 'cases'))
    );
    const sourcePath = join(currentTempRoot, 'product.png');
    await writeFile(sourcePath, PNG_BYTES);
    const result = expectSingleResult(
      await service.importFiles(caseA.trademarkCase.id, [sourcePath])
    );
    const imported = expectStatus(result, 'imported');

    await expect(
      service.update(imported.evidence.evidence.id, {
        evidenceType: 'photo',
        coveredGoodsServiceIds: [goodsServiceB.id]
      })
    ).rejects.toThrow('Covered goods/services must belong to the evidence case.');
  });

  it('records previous and new values in evidence update audit details', async () => {
    const currentDb = db as SqliteDatabase;
    const currentTempRoot = tempRoot as string;
    const { trademarkCase, goodsService } = createTrademarkCase(currentDb);
    const service = new EvidenceService(
      currentDb,
      new EvidenceStorageService(join(currentTempRoot, 'cases'))
    );
    const sourcePath = join(currentTempRoot, 'product.png');
    await writeFile(sourcePath, PNG_BYTES);
    const result = expectSingleResult(await service.importFiles(trademarkCase.id, [sourcePath]));
    const imported = expectStatus(result, 'imported');

    await service.update(imported.evidence.evidence.id, {
      evidenceType: 'screenshot',
      dateOfUse: '2024-03-15',
      territory: 'Germany',
      coveredGoodsServiceIds: [goodsService.id],
      notes: 'Reviewed metadata.'
    });

    const updateAudit = new AuditRepository(currentDb)
      .listByCase(trademarkCase.id)
      .find((entry) => entry.eventType === 'evidence_updated');

    expect(updateAudit?.details).toEqual(
      expect.objectContaining({
        previousEvidenceType: 'photo',
        evidenceType: 'screenshot',
        previousDateOfUse: null,
        dateOfUse: '2024-03-15',
        previousTerritory: '',
        territory: 'Germany',
        notesChanged: true,
        coveredGoodsServicesChanged: true,
        previousCoveredGoodsServicesCount: 0,
        coveredGoodsServicesCount: 1
      })
    );
  });

  it('returns a missing delete result without creating an audit row', async () => {
    const currentDb = db as SqliteDatabase;
    const currentTempRoot = tempRoot as string;
    const { trademarkCase } = createTrademarkCase(currentDb);
    const service = new EvidenceService(
      currentDb,
      new EvidenceStorageService(join(currentTempRoot, 'cases'))
    );

    await expect(service.delete(randomUUID())).resolves.toEqual({ deleted: false });
    expect(new AuditRepository(currentDb).listByCase(trademarkCase.id)).toEqual([]);
  });

  it('rejects stored relative paths that escape the cases root', () => {
    const currentTempRoot = tempRoot as string;
    const storage = new EvidenceStorageService(join(currentTempRoot, 'cases'));

    expect(() => storage.resolveStoredRelativePath('cases/../../evil.pdf')).toThrow(
      'Resolved path escapes the cases directory.'
    );
    expect(() => storage.resolveStoredRelativePath('cases/abc/../../../evil.pdf')).toThrow(
      'Resolved path escapes the cases directory.'
    );
    expect(() => storage.resolveStoredRelativePath('cases/abc/..\\..\\evil.pdf')).toThrow(
      'Resolved path escapes the cases directory.'
    );
  });

  it('keeps duplicate handling idempotent when the stored file was removed', async () => {
    const currentDb = db as SqliteDatabase;
    const currentTempRoot = tempRoot as string;
    const { trademarkCase } = createTrademarkCase(currentDb);
    const storage = new EvidenceStorageService(join(currentTempRoot, 'cases'));
    const service = new EvidenceService(currentDb, storage);
    const sourcePath = join(currentTempRoot, 'product.png');
    await writeFile(sourcePath, PNG_BYTES);
    const firstResult = expectSingleResult(
      await service.importFiles(trademarkCase.id, [sourcePath])
    );
    const firstImport = expectStatus(firstResult, 'imported');
    await rm(storage.resolveStoredRelativePath(firstImport.evidence.evidence.storedRelativePath), {
      force: true
    });

    const secondResult = expectSingleResult(
      await service.importFiles(trademarkCase.id, [sourcePath])
    );
    const duplicate = expectStatus(secondResult, 'duplicate');

    expect(duplicate.evidence.evidence.id).toBe(firstImport.evidence.evidence.id);
    expect(new EvidenceRepository(currentDb).listByCase(trademarkCase.id)).toHaveLength(1);
  });

  it('validates evidence IPC payloads before they reach services', () => {
    const evidenceId = randomUUID();

    expect(parseEvidenceId(evidenceId.toUpperCase())).toBe(evidenceId);
    expect(() => parseEvidenceId('not-an-id')).toThrow('Evidence id must be a UUID.');
    expect(() => parseUpdateEvidenceReviewInput(null)).toThrow(
      'Evidence review input must be an object.'
    );
    expect(() => parseUpdateEvidenceReviewInput({ evidenceType: 'unknown' })).toThrow(
      'evidenceType is not supported.'
    );
    expect(() =>
      parseUpdateEvidenceReviewInput({
        evidenceType: 'invoice',
        coveredGoodsServiceIds: [randomUUID(), 123]
      })
    ).toThrow('coveredGoodsServiceIds must be an array of strings.');
    expect(() =>
      parseUpdateEvidenceReviewInput({
        evidenceType: 'invoice',
        coveredGoodsServiceIds: ['not-a-uuid']
      })
    ).toThrow('coveredGoodsServiceIds[0] must be a UUID.');
  });
});
