import { afterEach, describe, expect, it } from 'vitest';

import { AuditRepository } from '../src/main/db/audit.repository';
import { CasesRepository } from '../src/main/db/cases.repository';
import type { SqliteDatabase } from '../src/main/db/database';
import { createInMemoryDatabase } from '../src/main/db/database';
import { EvidenceRepository } from '../src/main/db/evidence.repository';

const FIXED_TIME = new Date('2026-04-30T12:00:00.000Z');
const SHA_256 = 'a'.repeat(64);

describe('repositories', () => {
  let db: SqliteDatabase | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  it('persists trademark cases and goods/services below Nice class level', () => {
    db = createInMemoryDatabase();
    const cases = new CasesRepository(db, () => FIXED_TIME);

    const trademarkCase = cases.create({
      id: 'case-1',
      markName: '  MarkProof  ',
      ownerName: 'Example GmbH',
      registrationNumber: '302026000001',
      jurisdiction: 'DPMA',
      usePeriodFrom: '2021-01-01',
      usePeriodTo: '2026-01-01'
    });

    const goodsService = cases.createGoodsService({
      id: 'gs-1',
      caseId: trademarkCase.id,
      niceClass: 9,
      description: 'Downloadable software for evidence management',
      sortOrder: 1
    });

    expect(trademarkCase.markName).toBe('MarkProof');
    expect(cases.getById('case-1')).toEqual(trademarkCase);
    expect(cases.listGoodsServices('case-1')).toEqual([goodsService]);
  });

  it('persists evidence metadata, candidate dates, and goods/services mappings', () => {
    db = createInMemoryDatabase();
    const cases = new CasesRepository(db, () => FIXED_TIME);
    const evidence = new EvidenceRepository(db, () => FIXED_TIME);

    cases.create({
      id: 'case-1',
      markName: 'MarkProof',
      ownerName: 'Example GmbH',
      registrationNumber: '302026000001',
      jurisdiction: 'EUIPO',
      usePeriodFrom: '2021-01-01',
      usePeriodTo: '2026-01-01'
    });

    cases.createGoodsService({
      id: 'gs-1',
      caseId: 'case-1',
      niceClass: 42,
      description: 'Software as a service for trademark evidence organization'
    });

    const evidenceItem = evidence.create({
      id: 'ev-1',
      caseId: 'case-1',
      evidenceType: 'invoice',
      sourceFilename: 'invoice.pdf',
      storedRelativePath: `cases/case-1/evidence/${SHA_256}.pdf`,
      fileHash: SHA_256.toUpperCase(),
      fileSizeBytes: 4096,
      mimeType: 'application/pdf',
      dateOfUse: '2024-03-15',
      territory: 'Germany',
      notes: 'Quarterly invoice',
      extractedTextStatus: 'completed',
      exifJson: { pageCount: 2 },
      fileCreatedAt: '2024-03-16T08:00:00.000Z',
      fileModifiedAt: '2024-03-17T08:00:00.000Z'
    });

    const candidate = evidence.addDateCandidate({
      id: 'date-1',
      evidenceId: 'ev-1',
      candidateDate: '2024-03-15',
      source: 'pdf_text',
      rawValue: '15.03.2024'
    });

    const links = evidence.replaceGoodsServiceLinks('ev-1', ['gs-1']);

    expect(evidenceItem.hashAlgo).toBe('sha256');
    expect(evidenceItem.fileHash).toBe(SHA_256);
    expect(evidenceItem.exifJson).toEqual({ pageCount: 2 });
    expect(evidence.listByCase('case-1')).toEqual([evidenceItem]);
    expect(evidence.listDateCandidates('ev-1')).toEqual([candidate]);
    expect(links).toEqual([
      {
        evidenceId: 'ev-1',
        goodsServiceId: 'gs-1',
        createdAt: FIXED_TIME.toISOString()
      }
    ]);
  });

  it('preserves extracted evidence metadata when review updates omit optional fields', () => {
    db = createInMemoryDatabase();
    const cases = new CasesRepository(db, () => FIXED_TIME);
    const evidence = new EvidenceRepository(db, () => FIXED_TIME);

    cases.create({
      id: 'case-1',
      markName: 'MarkProof',
      ownerName: 'Example GmbH',
      registrationNumber: '302026000001',
      jurisdiction: 'EUIPO',
      usePeriodFrom: '2021-01-01',
      usePeriodTo: '2026-01-01'
    });

    evidence.create({
      id: 'ev-1',
      caseId: 'case-1',
      evidenceType: 'photo',
      sourceFilename: 'product-photo.jpg',
      storedRelativePath: `cases/case-1/evidence/${SHA_256}.jpg`,
      fileHash: SHA_256,
      fileSizeBytes: 2048,
      dateOfUse: '2024-05-10',
      extractedText: 'Original extracted text',
      extractedTextStatus: 'completed',
      exifJson: { DateTimeOriginal: '2024:05:10 10:30:00' },
      fileCreatedAt: '2024-05-10T09:00:00.000Z',
      fileModifiedAt: '2024-05-10T10:00:00.000Z'
    });

    const updated = evidence.update('ev-1', {
      evidenceType: 'photo',
      dateOfUse: '2024-05-11',
      territory: 'Germany',
      notes: 'Reviewed date of use'
    });

    expect(updated?.extractedText).toBe('Original extracted text');
    expect(updated?.extractedTextStatus).toBe('completed');
    expect(updated?.exifJson).toEqual({ DateTimeOriginal: '2024:05:10 10:30:00' });
    expect(updated?.fileCreatedAt).toBe('2024-05-10T09:00:00.000Z');
    expect(updated?.fileModifiedAt).toBe('2024-05-10T10:00:00.000Z');
    expect(updated?.dateOfUse).toBe('2024-05-11');
  });

  it('records audit events and preserves their case reference when a case is deleted', () => {
    db = createInMemoryDatabase();
    const cases = new CasesRepository(db, () => FIXED_TIME);
    const audit = new AuditRepository(db, () => FIXED_TIME);

    cases.create({
      id: 'case-1',
      markName: 'MarkProof',
      ownerName: 'Example GmbH',
      registrationNumber: '302026000001',
      jurisdiction: 'OTHER',
      usePeriodFrom: '2021-01-01',
      usePeriodTo: '2026-01-01'
    });

    const entry = audit.append({
      id: 'audit-1',
      caseId: 'case-1',
      eventType: 'case_created',
      entityType: 'case',
      entityId: 'case-1',
      actor: 'local-user',
      details: {
        markName: 'MarkProof'
      }
    });

    expect(audit.listByCase('case-1')).toEqual([entry]);

    cases.delete('case-1');

    expect(cases.getById('case-1')).toBeNull();
    expect(audit.getById('audit-1')).toEqual(entry);
    expect(audit.listByCase('case-1')).toEqual([entry]);
  });
});
