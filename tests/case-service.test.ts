import { afterEach, describe, expect, it } from 'vitest';

import { AuditRepository } from '../src/main/db/audit.repository';
import type { SqliteDatabase } from '../src/main/db/database';
import { createInMemoryDatabase } from '../src/main/db/database';
import { EvidenceRepository } from '../src/main/db/evidence.repository';
import { CaseService } from '../src/main/services/case.service';
import {
  parseCaseId,
  parseCreateTrademarkCaseRecordInput
} from '../src/main/validation/cases.validation';

const SHA_256 = 'b'.repeat(64);

function baseCaseInput() {
  return {
    markName: 'MarkProof',
    ownerName: 'Example GmbH',
    registrationNumber: '302026000001',
    jurisdiction: 'DPMA' as const,
    usePeriodFrom: '2021-01-01',
    usePeriodTo: '2026-01-01',
    goodsServices: [
      {
        niceClass: 9,
        description: 'Downloadable software for trademark evidence management'
      }
    ]
  };
}

describe('case service', () => {
  let db: SqliteDatabase | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  it('creates, updates, deletes, and records case audit events', () => {
    db = createInMemoryDatabase();
    const service = new CaseService(db);
    const audit = new AuditRepository(db);

    const created = service.create({
      markName: 'MarkProof',
      ownerName: 'Example GmbH',
      registrationNumber: '302026000001',
      jurisdiction: 'DPMA',
      usePeriodFrom: '2021-01-01',
      usePeriodTo: '2026-01-01',
      goodsServices: [
        {
          niceClass: 9,
          description: 'Downloadable software for trademark evidence management'
        }
      ]
    });

    expect(created.trademarkCase.id).toBeTruthy();
    expect(created.goodsServices).toHaveLength(1);
    expect(service.list()).toHaveLength(1);
    expect(audit.listByCase(created.trademarkCase.id).map((entry) => entry.eventType)).toContain(
      'case_created'
    );

    const updated = service.update(created.trademarkCase.id, {
      markName: 'MarkProof',
      ownerName: 'Example GmbH',
      registrationNumber: '302026000001',
      jurisdiction: 'EUIPO',
      usePeriodFrom: '2021-01-01',
      usePeriodTo: '2026-01-01',
      goodsServices: [
        {
          niceClass: 9,
          description: 'Downloadable software for trademark evidence management'
        },
        {
          niceClass: 42,
          description: 'Hosted software services for organizing trademark proof-of-use evidence'
        }
      ]
    });

    expect(updated?.trademarkCase.jurisdiction).toBe('EUIPO');
    expect(updated?.goodsServices).toHaveLength(2);
    expect(audit.listByCase(created.trademarkCase.id).map((entry) => entry.eventType)).toContain(
      'case_updated'
    );

    const deleted = service.delete(created.trademarkCase.id);

    expect(deleted).toEqual({ deleted: true });
    expect(service.list()).toEqual([]);
    expect(audit.listByCase(created.trademarkCase.id).map((entry) => entry.eventType)).toEqual(
      expect.arrayContaining(['case_created', 'case_updated', 'case_deleted'])
    );
  });

  it('validates IPC case payload shape before it reaches repositories', () => {
    expect(() => parseCaseId('')).toThrow('Case id must be a non-empty string.');
    expect(() => parseCreateTrademarkCaseRecordInput({ markName: 'MarkProof' })).toThrow(
      'ownerName must be a string.'
    );
  });

  it('preserves goods service identity and createdAt across an update that resends the same ids', () => {
    db = createInMemoryDatabase();
    const service = new CaseService(db);

    const created = service.create(baseCaseInput());
    const originalGoodsService = created.goodsServices[0]!;

    const updated = service.update(created.trademarkCase.id, {
      ...baseCaseInput(),
      goodsServices: [
        {
          id: originalGoodsService.id,
          niceClass: originalGoodsService.niceClass,
          description: originalGoodsService.description
        }
      ]
    });

    expect(updated?.goodsServices).toHaveLength(1);
    expect(updated?.goodsServices[0]!.id).toBe(originalGoodsService.id);
    expect(updated?.goodsServices[0]!.createdAt).toBe(originalGoodsService.createdAt);
  });

  it('preserves evidence_goods_services links across a case update that retains the goods service id', () => {
    db = createInMemoryDatabase();
    const service = new CaseService(db);
    const evidence = new EvidenceRepository(db);

    const created = service.create(baseCaseInput());
    const goodsService = created.goodsServices[0]!;

    const evidenceItem = evidence.create({
      caseId: created.trademarkCase.id,
      evidenceType: 'photo',
      sourceFilename: 'photo.jpg',
      storedRelativePath: `cases/${created.trademarkCase.id}/evidence/${SHA_256}.jpg`,
      fileHash: SHA_256,
      fileSizeBytes: 2048,
      extractedTextStatus: 'not_applicable'
    });

    evidence.replaceGoodsServiceLinks(evidenceItem.id, [goodsService.id]);

    service.update(created.trademarkCase.id, {
      ...baseCaseInput(),
      ownerName: 'Renamed GmbH',
      goodsServices: [
        {
          id: goodsService.id,
          niceClass: goodsService.niceClass,
          description: goodsService.description
        }
      ]
    });

    const linksAfter = evidence
      .listGoodsServiceLinks(evidenceItem.id)
      .map((link) => link.goodsServiceId);

    expect(linksAfter).toEqual([goodsService.id]);
  });

  it('removes goods services that are absent from the update input', () => {
    db = createInMemoryDatabase();
    const service = new CaseService(db);

    const created = service.create({
      ...baseCaseInput(),
      goodsServices: [
        { niceClass: 9, description: 'Downloadable software' },
        { niceClass: 42, description: 'Hosted software services' }
      ]
    });

    const keep = created.goodsServices.find((item) => item.niceClass === 9)!;

    const updated = service.update(created.trademarkCase.id, {
      ...baseCaseInput(),
      goodsServices: [
        { id: keep.id, niceClass: keep.niceClass, description: keep.description }
      ]
    });

    expect(updated?.goodsServices.map((item) => item.id)).toEqual([keep.id]);
  });

  it('records ownerName, jurisdiction and use period transitions in the case_updated audit details', () => {
    db = createInMemoryDatabase();
    const service = new CaseService(db);
    const audit = new AuditRepository(db);

    const created = service.create(baseCaseInput());

    service.update(created.trademarkCase.id, {
      ...baseCaseInput(),
      ownerName: 'Renamed GmbH',
      jurisdiction: 'EUIPO',
      usePeriodFrom: '2022-06-01',
      usePeriodTo: '2027-06-01'
    });

    const updateEntry = audit
      .listByCase(created.trademarkCase.id)
      .find((entry) => entry.eventType === 'case_updated');

    expect(updateEntry?.details).toMatchObject({
      previousOwnerName: 'Example GmbH',
      ownerName: 'Renamed GmbH',
      previousJurisdiction: 'DPMA',
      jurisdiction: 'EUIPO',
      previousUsePeriodFrom: '2021-01-01',
      usePeriodFrom: '2022-06-01',
      previousUsePeriodTo: '2026-01-01',
      usePeriodTo: '2027-06-01'
    });
  });

  it('returns null and writes no audit entry when updating a non-existent case', () => {
    db = createInMemoryDatabase();
    const service = new CaseService(db);
    const audit = new AuditRepository(db);

    const result = service.update('00000000-0000-0000-0000-000000000000', baseCaseInput());

    expect(result).toBeNull();
    expect(audit.listRecent().some((entry) => entry.eventType === 'case_updated')).toBe(false);
  });

  it('captures the pre-cascade goodsServicesCount in the case_deleted audit', () => {
    db = createInMemoryDatabase();
    const service = new CaseService(db);
    const audit = new AuditRepository(db);

    const created = service.create({
      ...baseCaseInput(),
      goodsServices: [
        { niceClass: 9, description: 'Software' },
        { niceClass: 42, description: 'Services' },
        { niceClass: 35, description: 'Advertising' }
      ]
    });

    service.delete(created.trademarkCase.id);

    const deleteEntry = audit
      .listByCase(created.trademarkCase.id)
      .find((entry) => entry.eventType === 'case_deleted');

    expect(deleteEntry?.details.goodsServicesCount).toBe(3);

    const remainingGoodsServices = db
      .prepare('SELECT COUNT(*) as count FROM goods_services WHERE case_id = ?')
      .get(created.trademarkCase.id) as { count: number };

    expect(remainingGoodsServices.count).toBe(0);
  });
});
