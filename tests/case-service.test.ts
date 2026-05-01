import { afterEach, describe, expect, it } from 'vitest';

import { AuditRepository } from '../src/main/db/audit.repository';
import type { SqliteDatabase } from '../src/main/db/database';
import { createInMemoryDatabase } from '../src/main/db/database';
import { CaseService } from '../src/main/services/case.service';
import {
  parseCaseId,
  parseCreateTrademarkCaseRecordInput
} from '../src/main/validation/cases.validation';

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
});
