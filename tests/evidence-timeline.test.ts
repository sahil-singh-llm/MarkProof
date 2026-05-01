import { describe, expect, it } from 'vitest';

import { buildEvidenceTimeline } from '../src/shared/timeline/evidence-timeline';
import type { GoodsService, TrademarkCase } from '../src/shared/types/case';
import type { EvidenceRecord, EvidenceType } from '../src/shared/types/evidence';

const NOW = '2026-01-01T00:00:00.000Z';
const SHA_256 = 'b'.repeat(64);

function trademarkCase(input: Partial<TrademarkCase> = {}): TrademarkCase {
  return {
    id: 'case-1',
    markName: 'MarkProof',
    ownerName: 'Example GmbH',
    registrationNumber: '302026000001',
    jurisdiction: 'EUIPO',
    usePeriodFrom: '2021-01-01',
    usePeriodTo: '2023-12-31',
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
      notes: 'Reviewed for timeline.',
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

describe('evidence timeline', () => {
  it('orders dated evidence chronologically and then by filename', () => {
    const timeline = buildEvidenceTimeline({
      trademarkCase: trademarkCase(),
      goodsServices: [],
      evidenceRecords: [
        evidenceRecord({
          id: 'ev-late',
          dateOfUse: '2022-05-10',
          sourceFilename: 'z-invoice.pdf'
        }),
        evidenceRecord({
          id: 'ev-early',
          dateOfUse: '2021-01-20',
          sourceFilename: 'a-photo.jpg'
        }),
        evidenceRecord({
          id: 'ev-same-day',
          dateOfUse: '2022-05-10',
          sourceFilename: 'a-ad.pdf'
        })
      ]
    });

    expect(timeline.points.map((point) => point.id)).toEqual([
      'ev-early',
      'ev-same-day',
      'ev-late'
    ]);
    expect(timeline.totals.datedEvidenceItems).toBe(3);
  });

  it('flags missing and outside-period dates for review without dropping dated points', () => {
    const timeline = buildEvidenceTimeline({
      trademarkCase: trademarkCase(),
      goodsServices: [],
      evidenceRecords: [
        evidenceRecord({ id: 'ev-missing', dateOfUse: null }),
        evidenceRecord({ id: 'ev-outside', dateOfUse: '2020-12-31' }),
        evidenceRecord({ id: 'ev-inside', dateOfUse: '2021-02-01' })
      ]
    });

    expect(timeline.points.map((point) => [point.id, point.dateStatus])).toEqual([
      ['ev-outside', 'outside_period'],
      ['ev-inside', 'within_period']
    ]);
    expect(timeline.reviewItems.map((item) => item.reason).sort()).toEqual([
      'missing_date',
      'outside_period'
    ]);
    expect(timeline.totals).toEqual({
      evidenceItems: 3,
      datedEvidenceItems: 2,
      reviewRecommendedEvidenceItems: 2,
      outsidePeriodEvidenceItems: 1
    });
  });

  it('maps linked goods/services labels onto timeline points', () => {
    const software = goodsService('gs-software', 'Downloadable evidence management software');
    const services = goodsService('gs-services', 'Evidence organization consulting', 42);
    const timeline = buildEvidenceTimeline({
      trademarkCase: trademarkCase(),
      goodsServices: [software, services],
      evidenceRecords: [
        evidenceRecord({
          id: 'ev-1',
          dateOfUse: '2022-04-01',
          goodsServiceIds: [software.id, services.id]
        })
      ]
    });

    expect(timeline.points[0]?.goodsServiceLabels).toEqual([
      'Class 9: Downloadable evidence management software',
      'Class 42: Evidence organization consulting'
    ]);
  });
});
