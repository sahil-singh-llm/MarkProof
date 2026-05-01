import type { GoodsService, TrademarkCase } from '../types/case';
import type { EvidenceRecord, EvidenceType } from '../types/evidence';

export type EvidenceTimelineDateStatus = 'within_period' | 'outside_period';

export type EvidenceTimelineReviewReason = 'missing_date' | 'outside_period';

export type EvidenceTimelinePoint = {
  id: string;
  date: string;
  dateStatus: EvidenceTimelineDateStatus;
  evidenceType: EvidenceType;
  sourceFilename: string;
  territory: string;
  notes: string;
  fileHash: string;
  goodsServiceIds: string[];
  goodsServiceLabels: string[];
};

export type EvidenceTimelineReviewItem = {
  evidenceId: string;
  sourceFilename: string;
  evidenceType: EvidenceType;
  reason: EvidenceTimelineReviewReason;
  dateOfUse: string | null;
};

export type EvidenceTimelineTotals = {
  evidenceItems: number;
  datedEvidenceItems: number;
  reviewRecommendedEvidenceItems: number;
  outsidePeriodEvidenceItems: number;
};

export type EvidenceTimeline = {
  periodStart: string;
  periodEnd: string;
  points: EvidenceTimelinePoint[];
  reviewItems: EvidenceTimelineReviewItem[];
  totals: EvidenceTimelineTotals;
};

type BuildEvidenceTimelineInput = {
  trademarkCase: TrademarkCase;
  goodsServices: readonly GoodsService[];
  evidenceRecords: readonly EvidenceRecord[];
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function niceClassLabel(niceClass: number | null): string {
  return niceClass === null ? 'No class' : `Class ${niceClass}`;
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function sortPoints(points: readonly EvidenceTimelinePoint[]): EvidenceTimelinePoint[] {
  return [...points].sort((left, right) => {
    const byDate = left.date.localeCompare(right.date);

    if (byDate !== 0) {
      return byDate;
    }

    return left.sourceFilename.localeCompare(right.sourceFilename);
  });
}

function sortReviewItems(
  items: readonly EvidenceTimelineReviewItem[]
): EvidenceTimelineReviewItem[] {
  return [...items].sort((left, right) => {
    const byFilename = left.sourceFilename.localeCompare(right.sourceFilename);

    if (byFilename !== 0) {
      return byFilename;
    }

    return left.reason.localeCompare(right.reason);
  });
}

export function buildEvidenceTimeline({
  trademarkCase,
  goodsServices,
  evidenceRecords
}: BuildEvidenceTimelineInput): EvidenceTimeline {
  const goodsServiceById = new Map(goodsServices.map((item) => [item.id, item]));
  const points: EvidenceTimelinePoint[] = [];
  const reviewItems: EvidenceTimelineReviewItem[] = [];
  const reviewEvidenceIds = new Set<string>();
  const outsidePeriodEvidenceIds = new Set<string>();

  function addReviewItem(record: EvidenceRecord, reason: EvidenceTimelineReviewReason): void {
    reviewEvidenceIds.add(record.evidence.id);

    if (reason === 'outside_period') {
      outsidePeriodEvidenceIds.add(record.evidence.id);
    }

    reviewItems.push({
      evidenceId: record.evidence.id,
      sourceFilename: record.evidence.sourceFilename,
      evidenceType: record.evidence.evidenceType,
      reason,
      dateOfUse: record.evidence.dateOfUse
    });
  }

  for (const record of evidenceRecords) {
    const evidence = record.evidence;
    const dateOfUse = evidence.dateOfUse;

    if (!dateOfUse || !isValidIsoDate(dateOfUse)) {
      addReviewItem(record, 'missing_date');
      continue;
    }

    const isOutsidePeriod =
      dateOfUse < trademarkCase.usePeriodFrom || dateOfUse > trademarkCase.usePeriodTo;

    if (isOutsidePeriod) {
      addReviewItem(record, 'outside_period');
    }

    const goodsServiceIds = unique(
      record.goodsServiceLinks
        .map((link) => link.goodsServiceId)
        .filter((goodsServiceId) => goodsServiceById.has(goodsServiceId))
    );

    points.push({
      id: evidence.id,
      date: dateOfUse,
      dateStatus: isOutsidePeriod ? 'outside_period' : 'within_period',
      evidenceType: evidence.evidenceType,
      sourceFilename: evidence.sourceFilename,
      territory: evidence.territory,
      notes: evidence.notes,
      fileHash: evidence.fileHash,
      goodsServiceIds,
      goodsServiceLabels: goodsServiceIds.map((goodsServiceId) => {
        const goodsService = goodsServiceById.get(goodsServiceId)!;

        return `${niceClassLabel(goodsService.niceClass)}: ${goodsService.description}`;
      })
    });
  }

  return {
    periodStart: trademarkCase.usePeriodFrom,
    periodEnd: trademarkCase.usePeriodTo,
    points: sortPoints(points),
    reviewItems: sortReviewItems(reviewItems),
    totals: {
      evidenceItems: evidenceRecords.length,
      datedEvidenceItems: points.length,
      reviewRecommendedEvidenceItems: reviewEvidenceIds.size,
      outsidePeriodEvidenceItems: outsidePeriodEvidenceIds.size
    }
  };
}
