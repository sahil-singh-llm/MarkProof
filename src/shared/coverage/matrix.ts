import type { GoodsService, TrademarkCase } from '../types/case';
import type { EvidenceRecord, EvidenceType } from '../types/evidence';

export type CoverageCellStatus = 'coverage_detected' | 'gap_detected';

export type CoverageReviewReason = 'missing_date' | 'outside_period' | 'unmapped_goods_services';

export type CoveragePeriod = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
};

export type CoverageMatrixCell = {
  goodsServiceId: string;
  periodId: string;
  evidenceCount: number;
  evidenceIds: string[];
  status: CoverageCellStatus;
};

export type CoverageMatrixRow = {
  goodsService: GoodsService;
  cells: CoverageMatrixCell[];
  totalEvidenceCount: number;
  reviewRecommendedEvidenceIds: string[];
};

export type CoverageReviewItem = {
  evidenceId: string;
  sourceFilename: string;
  evidenceType: EvidenceType;
  dateOfUse: string | null;
  reason: CoverageReviewReason;
  goodsServiceIds: string[];
};

export type CoverageMatrixTotals = {
  evidenceItems: number;
  coveredCells: number;
  gapCells: number;
  reviewRecommendedEvidenceItems: number;
  unmappedEvidenceItems: number;
};

export type CoverageMatrix = {
  periods: CoveragePeriod[];
  rows: CoverageMatrixRow[];
  reviewItems: CoverageReviewItem[];
  totals: CoverageMatrixTotals;
};

type BuildCoverageMatrixInput = {
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

function yearOf(value: string): number {
  return Number(value.slice(0, 4));
}

function maxDate(left: string, right: string): string {
  return left > right ? left : right;
}

function minDate(left: string, right: string): string {
  return left < right ? left : right;
}

function createCoveragePeriods(usePeriodFrom: string, usePeriodTo: string): CoveragePeriod[] {
  if (
    !isValidIsoDate(usePeriodFrom) ||
    !isValidIsoDate(usePeriodTo) ||
    usePeriodFrom > usePeriodTo
  ) {
    return [];
  }

  const periods: CoveragePeriod[] = [];

  for (let year = yearOf(usePeriodFrom); year <= yearOf(usePeriodTo); year += 1) {
    const startDate = maxDate(usePeriodFrom, `${year}-01-01`);
    const endDate = minDate(usePeriodTo, `${year}-12-31`);

    periods.push({
      id: `${startDate}:${endDate}`,
      label: String(year),
      startDate,
      endDate
    });
  }

  return periods;
}

function findPeriodForDate(periods: readonly CoveragePeriod[], date: string): CoveragePeriod | null {
  return periods.find((period) => date >= period.startDate && date <= period.endDate) ?? null;
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function sortReviewItems(items: readonly CoverageReviewItem[]): CoverageReviewItem[] {
  return [...items].sort((left, right) => {
    const byFilename = left.sourceFilename.localeCompare(right.sourceFilename);

    if (byFilename !== 0) {
      return byFilename;
    }

    return left.reason.localeCompare(right.reason);
  });
}

export function buildCoverageMatrix({
  trademarkCase,
  goodsServices,
  evidenceRecords
}: BuildCoverageMatrixInput): CoverageMatrix {
  const periods = createCoveragePeriods(
    trademarkCase.usePeriodFrom,
    trademarkCase.usePeriodTo
  );
  const goodsServiceIds = new Set(goodsServices.map((goodsService) => goodsService.id));
  const rowReviewIds = new Map<string, Set<string>>();
  const reviewItems = new Map<string, CoverageReviewItem>();
  const reviewEvidenceIds = new Set<string>();
  const unmappedEvidenceIds = new Set<string>();

  const rows = goodsServices.map<CoverageMatrixRow>((goodsService) => {
    rowReviewIds.set(goodsService.id, new Set());

    return {
      goodsService,
      cells: periods.map((period) => ({
        goodsServiceId: goodsService.id,
        periodId: period.id,
        evidenceCount: 0,
        evidenceIds: [],
        status: 'gap_detected'
      })),
      totalEvidenceCount: 0,
      reviewRecommendedEvidenceIds: []
    };
  });
  const rowByGoodsServiceId = new Map(rows.map((row) => [row.goodsService.id, row]));

  function addReviewItem(
    record: EvidenceRecord,
    reason: CoverageReviewReason,
    goodsServiceIdsForReview: readonly string[]
  ): void {
    const evidence = record.evidence;
    const key = `${reason}:${evidence.id}:${goodsServiceIdsForReview.join(',')}`;

    reviewEvidenceIds.add(evidence.id);

    if (reason === 'unmapped_goods_services') {
      unmappedEvidenceIds.add(evidence.id);
    }

    for (const goodsServiceId of goodsServiceIdsForReview) {
      rowReviewIds.get(goodsServiceId)?.add(evidence.id);
    }

    if (!reviewItems.has(key)) {
      reviewItems.set(key, {
        evidenceId: evidence.id,
        sourceFilename: evidence.sourceFilename,
        evidenceType: evidence.evidenceType,
        dateOfUse: evidence.dateOfUse,
        reason,
        goodsServiceIds: [...goodsServiceIdsForReview]
      });
    }
  }

  for (const record of evidenceRecords) {
    const linkedGoodsServiceIds = unique(
      record.goodsServiceLinks
        .map((link) => link.goodsServiceId)
        .filter((goodsServiceId) => goodsServiceIds.has(goodsServiceId))
    );

    if (linkedGoodsServiceIds.length === 0) {
      addReviewItem(record, 'unmapped_goods_services', []);
      continue;
    }

    const dateOfUse = record.evidence.dateOfUse;

    if (!dateOfUse || !isValidIsoDate(dateOfUse)) {
      addReviewItem(record, 'missing_date', linkedGoodsServiceIds);
      continue;
    }

    const period = findPeriodForDate(periods, dateOfUse);

    if (!period) {
      addReviewItem(record, 'outside_period', linkedGoodsServiceIds);
      continue;
    }

    for (const goodsServiceId of linkedGoodsServiceIds) {
      const row = rowByGoodsServiceId.get(goodsServiceId);
      const cell = row?.cells.find((candidate) => candidate.periodId === period.id);

      if (cell && !cell.evidenceIds.includes(record.evidence.id)) {
        cell.evidenceIds.push(record.evidence.id);
      }
    }
  }

  let coveredCells = 0;
  let gapCells = 0;

  for (const row of rows) {
    row.totalEvidenceCount = 0;
    row.reviewRecommendedEvidenceIds = [...(rowReviewIds.get(row.goodsService.id) ?? [])].sort();

    for (const cell of row.cells) {
      cell.evidenceIds.sort();
      cell.evidenceCount = cell.evidenceIds.length;
      cell.status = cell.evidenceCount > 0 ? 'coverage_detected' : 'gap_detected';
      row.totalEvidenceCount += cell.evidenceCount;

      if (cell.status === 'coverage_detected') {
        coveredCells += 1;
      } else {
        gapCells += 1;
      }
    }
  }

  return {
    periods,
    rows,
    reviewItems: sortReviewItems([...reviewItems.values()]),
    totals: {
      evidenceItems: evidenceRecords.length,
      coveredCells,
      gapCells,
      reviewRecommendedEvidenceItems: reviewEvidenceIds.size,
      unmappedEvidenceItems: unmappedEvidenceIds.size
    }
  };
}

