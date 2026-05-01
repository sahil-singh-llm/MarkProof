import { describe, expect, it } from 'vitest';

import { buildCoverageMatrix } from '../src/shared/coverage/matrix';
import type { GoodsService, TrademarkCase } from '../src/shared/types/case';
import type { EvidenceRecord, EvidenceType } from '../src/shared/types/evidence';

const NOW = '2026-01-01T00:00:00.000Z';
const SHA_256 = 'a'.repeat(64);

function trademarkCase(input: Partial<TrademarkCase> = {}): TrademarkCase {
  return {
    id: 'case-1',
    markName: 'MarkProof',
    ownerName: 'Example GmbH',
    registrationNumber: '302026000001',
    jurisdiction: 'DPMA',
    usePeriodFrom: '2021-01-01',
    usePeriodTo: '2022-12-31',
    createdAt: NOW,
    updatedAt: NOW,
    ...input
  };
}

function goodsService(id: string, description: string, niceClass = 9): GoodsService {
  return {
    id,
    caseId: 'case-1',
    niceClass,
    description,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW
  };
}

function evidenceRecord(input: {
  id: string;
  dateOfUse: string | null;
  goodsServiceIds?: string[];
  evidenceType?: EvidenceType;
  sourceFilename?: string;
}): EvidenceRecord {
  return {
    evidence: {
      id: input.id,
      caseId: 'case-1',
      evidenceType: input.evidenceType ?? 'invoice',
      sourceFilename: input.sourceFilename ?? `${input.id}.pdf`,
      storedRelativePath: `cases/case-1/evidence/${SHA_256}.pdf`,
      fileHash: SHA_256,
      hashAlgo: 'sha256',
      fileSizeBytes: 1200,
      mimeType: 'application/pdf',
      dateOfUse: input.dateOfUse,
      territory: 'Germany',
      territories: ['DE'],
      markFormAsUsed: '',
      useAmountValue: null,
      useAmountCurrency: null,
      useUnitsCount: null,
      notes: '',
      extractedText: null,
      extractedTextStatus: 'completed',
      exifJson: {},
      fileCreatedAt: null,
      fileModifiedAt: null,
      importedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW
    },
    dateCandidates: [],
    goodsServiceLinks: (input.goodsServiceIds ?? []).map((goodsServiceId) => ({
      evidenceId: input.id,
      goodsServiceId,
      createdAt: NOW
    }))
  };
}

describe('coverage matrix', () => {
  it('creates annual periods clipped to the relevant use period', () => {
    const matrix = buildCoverageMatrix({
      trademarkCase: trademarkCase({
        usePeriodFrom: '2021-06-01',
        usePeriodTo: '2023-05-31'
      }),
      goodsServices: [],
      evidenceRecords: []
    });

    expect(matrix.periods).toEqual([
      {
        id: '2021-06-01:2021-12-31',
        label: '2021',
        startDate: '2021-06-01',
        endDate: '2021-12-31'
      },
      {
        id: '2022-01-01:2022-12-31',
        label: '2022',
        startDate: '2022-01-01',
        endDate: '2022-12-31'
      },
      {
        id: '2023-01-01:2023-05-31',
        label: '2023',
        startDate: '2023-01-01',
        endDate: '2023-05-31'
      }
    ]);
  });

  it('counts mapped evidence by goods/services row and period column', () => {
    const software = goodsService('gs-software', 'Downloadable software');
    const consulting = goodsService('gs-consulting', 'Trademark evidence consulting', 42);
    const matrix = buildCoverageMatrix({
      trademarkCase: trademarkCase(),
      goodsServices: [software, consulting],
      evidenceRecords: [
        evidenceRecord({
          id: 'ev-2021',
          dateOfUse: '2021-07-10',
          goodsServiceIds: [software.id]
        }),
        evidenceRecord({
          id: 'ev-2022',
          dateOfUse: '2022-02-14',
          goodsServiceIds: [software.id, consulting.id]
        })
      ]
    });

    expect(matrix.rows.map((row) => row.cells.map((cell) => cell.evidenceCount))).toEqual([
      [1, 1],
      [0, 1]
    ]);
    expect(matrix.rows[0]?.cells.map((cell) => cell.status)).toEqual([
      'coverage_detected',
      'coverage_detected'
    ]);
    expect(matrix.rows[1]?.cells.map((cell) => cell.status)).toEqual([
      'gap_detected',
      'coverage_detected'
    ]);
    expect(matrix.totals).toEqual({
      evidenceItems: 2,
      coveredCells: 3,
      gapCells: 1,
      reviewRecommendedEvidenceItems: 0,
      unmappedEvidenceItems: 0
    });
  });

  it('flags missing dates, outside-period dates, and unmapped evidence for review', () => {
    const software = goodsService('gs-software', 'Downloadable software');
    const matrix = buildCoverageMatrix({
      trademarkCase: trademarkCase(),
      goodsServices: [software],
      evidenceRecords: [
        evidenceRecord({
          id: 'ev-unmapped',
          dateOfUse: '2021-07-10',
          goodsServiceIds: []
        }),
        evidenceRecord({
          id: 'ev-missing-date',
          dateOfUse: null,
          goodsServiceIds: [software.id]
        }),
        evidenceRecord({
          id: 'ev-outside',
          dateOfUse: '2020-12-31',
          goodsServiceIds: [software.id]
        })
      ]
    });

    expect(matrix.reviewItems.map((item) => item.reason).sort()).toEqual([
      'missing_date',
      'outside_period',
      'unmapped_goods_services'
    ]);
    expect(matrix.rows[0]?.reviewRecommendedEvidenceIds).toEqual(['ev-missing-date', 'ev-outside']);
    expect(matrix.totals.reviewRecommendedEvidenceItems).toBe(3);
    expect(matrix.totals.unmappedEvidenceItems).toBe(1);
  });
});
