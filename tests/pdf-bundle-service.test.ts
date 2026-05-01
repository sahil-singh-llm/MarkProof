import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';

import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AuditRepository } from '../src/main/db/audit.repository';
import { CasesRepository } from '../src/main/db/cases.repository';
import type { SqliteDatabase } from '../src/main/db/database';
import { createInMemoryDatabase } from '../src/main/db/database';
import { EvidenceRepository } from '../src/main/db/evidence.repository';
import { PdfBundleService } from '../src/main/services/pdf-bundle.service';
import { EvidenceStorageService } from '../src/main/services/storage.service';
import type { GoodsService, TrademarkCase } from '../src/shared/types/case';
import type { EvidenceType } from '../src/shared/types/evidence';

type TestCase = {
  trademarkCase: TrademarkCase;
  goodsService: GoodsService;
};

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;

    for (let index = 0; index < 8; index += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);

  return Buffer.concat([length, typeBytes, data, crc]);
}

function createPngBytes(): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const imageData = deflateSync(Buffer.from([0, 0x2c, 0x7a, 0x68, 0xff]));

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', imageData),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

async function createPdfBytes(text: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([420, 240]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  page.drawText(text, {
    x: 40,
    y: 150,
    size: 12,
    font
  });

  return Buffer.from(await pdf.save());
}

function createTrademarkCase(db: SqliteDatabase): TestCase {
  const cases = new CasesRepository(db);
  const trademarkCase = cases.create({
    markName: 'MarkProof',
    ownerName: 'Example GmbH',
    registrationNumber: '302026000001',
    jurisdiction: 'EUIPO',
    usePeriodFrom: '2021-01-01',
    usePeriodTo: '2026-01-01'
  });
  const goodsService = cases.createGoodsService({
    caseId: trademarkCase.id,
    niceClass: 9,
    description: 'Downloadable software for evidence management'
  });

  return { trademarkCase, goodsService };
}

async function createStoredEvidence(input: {
  db: SqliteDatabase;
  storage: EvidenceStorageService;
  caseId: string;
  goodsServiceId: string;
  sourceFilename: string;
  bytes: Buffer;
  mimeType: string;
  evidenceType: EvidenceType;
  dateOfUse: string;
}): Promise<void> {
  const evidence = new EvidenceRepository(input.db);
  const fileHash = sha256(input.bytes);
  const address = {
    caseId: input.caseId,
    sha256: fileHash,
    sourceFilename: input.sourceFilename
  };
  const storedAbsolutePath = input.storage.getEvidenceStoragePath(address);
  const storedRelativePath = input.storage.getEvidenceStorageRelativePath(address);
  await mkdir(dirname(storedAbsolutePath), { recursive: true });
  await writeFile(storedAbsolutePath, input.bytes);

  const item = evidence.create({
    caseId: input.caseId,
    evidenceType: input.evidenceType,
    sourceFilename: input.sourceFilename,
    storedRelativePath,
    fileHash,
    fileSizeBytes: input.bytes.length,
    mimeType: input.mimeType,
    dateOfUse: input.dateOfUse,
    territory: 'Germany',
    notes: 'Reviewed for export.'
  });

  evidence.replaceGoodsServiceLinks(item.id, [input.goodsServiceId]);
}

describe('PDF bundle service', () => {
  let db: SqliteDatabase | null = null;
  let tempRoot: string | null = null;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    tempRoot = join(process.cwd(), '.tmp-tests', `bundle-${randomUUID()}`);
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

  it('exports a structured PDF bundle, appends originals, and records audit metadata', async () => {
    const currentDb = db as SqliteDatabase;
    const currentTempRoot = tempRoot as string;
    const { trademarkCase, goodsService } = createTrademarkCase(currentDb);
    const storage = new EvidenceStorageService(join(currentTempRoot, 'cases'));
    const pdfBytes = await createPdfBytes('Invoice evidence for MarkProof.');
    await createStoredEvidence({
      db: currentDb,
      storage,
      caseId: trademarkCase.id,
      goodsServiceId: goodsService.id,
      sourceFilename: 'invoice.pdf',
      bytes: pdfBytes,
      mimeType: 'application/pdf',
      evidenceType: 'invoice',
      dateOfUse: '2024-03-15'
    });
    await createStoredEvidence({
      db: currentDb,
      storage,
      caseId: trademarkCase.id,
      goodsServiceId: goodsService.id,
      sourceFilename: 'product.png',
      bytes: createPngBytes(),
      mimeType: 'image/png',
      evidenceType: 'photo',
      dateOfUse: '2024-04-20'
    });
    const service = new PdfBundleService(currentDb, storage);
    const outputPath = join(currentTempRoot, 'markproof-bundle.pdf');

    const result = await service.exportCaseBundle(trademarkCase.id, outputPath);

    expect(result?.status).toBe('exported');
    expect(result?.exhibitsCount).toBe(2);
    expect(result?.appendedOriginalsCount).toBe(2);
    expect(result?.skippedOriginalsCount).toBe(0);

    const exportedBytes = await readFile(outputPath);
    expect(result?.bundleHash).toBe(sha256(exportedBytes));

    const exportedPdf = await PDFDocument.load(exportedBytes);
    expect(result?.pageCount).toBe(exportedPdf.getPageCount());
    expect(exportedPdf.getPageCount()).toBeGreaterThanOrEqual(7);

    const auditEntry = new AuditRepository(currentDb)
      .listByCase(trademarkCase.id)
      .find((entry) => entry.eventType === 'bundle_exported');

    expect(auditEntry?.entityType).toBe('bundle');
    expect(auditEntry?.entityId).toBe(result?.bundleHash);
    expect(auditEntry?.details).toEqual(
      expect.objectContaining({
        outputFilename: 'markproof-bundle.pdf',
        exhibitsCount: 2,
        pageCount: result?.pageCount,
        appendedOriginalsCount: 2,
        skippedOriginalsCount: 0
      })
    );
  });

  it('returns null without writing a bundle when the case is missing', async () => {
    const currentDb = db as SqliteDatabase;
    const currentTempRoot = tempRoot as string;
    const service = new PdfBundleService(
      currentDb,
      new EvidenceStorageService(join(currentTempRoot, 'cases'))
    );

    await expect(
      service.exportCaseBundle(randomUUID(), join(currentTempRoot, 'missing.pdf'))
    ).resolves.toBeNull();
  });

  it('suggests a stable PDF filename from the mark name', () => {
    const currentDb = db as SqliteDatabase;
    const currentTempRoot = tempRoot as string;
    const { trademarkCase } = createTrademarkCase(currentDb);
    const service = new PdfBundleService(
      currentDb,
      new EvidenceStorageService(join(currentTempRoot, 'cases'))
    );

    expect(service.getSuggestedFilename(trademarkCase.id)).toBe('markproof-proof-bundle.pdf');
  });
});
