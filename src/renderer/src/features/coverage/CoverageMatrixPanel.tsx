import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import { buildCoverageMatrix } from '../../../../shared/coverage/matrix';
import type {
  CoverageMatrixCell,
  CoverageReviewReason
} from '../../../../shared/coverage/matrix';
import type { TrademarkCaseRecord } from '../../../../shared/types/case';
import type { EvidenceRecord, EvidenceType } from '../../../../shared/types/evidence';

type CoverageMatrixPanelProps = {
  record: TrademarkCaseRecord | null;
  refreshKey: number;
};

type PanelMessage = {
  tone: 'error' | 'neutral';
  text: string;
};

const evidenceTypeLabels: Record<EvidenceType, string> = {
  invoice: 'Invoice',
  screenshot: 'Screenshot',
  photo: 'Photo',
  catalogue: 'Catalogue',
  ad: 'Advertisement',
  other: 'Other'
};

const reviewReasonLabels: Record<CoverageReviewReason, string> = {
  missing_date: 'Missing date of use',
  outside_period: 'Date outside period',
  unmapped_goods_services: 'No goods/services mapping'
};

function niceClassLabel(niceClass: number | null): string {
  return niceClass === null ? 'No class' : `Class ${niceClass}`;
}

function cellClass(cell: CoverageMatrixCell): string {
  return cell.status === 'coverage_detected'
    ? 'border-accent/35 bg-accentSoft text-accent'
    : 'border-warning/45 bg-[oklch(0.965_0.035_82)] text-ink';
}

function cellLabel(cell: CoverageMatrixCell): string {
  return cell.status === 'coverage_detected' ? 'Evidence on file' : 'No evidence in period';
}

// Shape redundancy alongside the color cue, so cells remain distinguishable
// for users with deuteranopia/protanopia where the warm/cool hues collapse.
function CellStatusIcon({ status }: { status: CoverageMatrixCell['status'] }): ReactElement {
  if (status === 'coverage_detected') {
    return (
      <svg
        aria-hidden="true"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.5}
        viewBox="0 0 24 24"
      >
        <path d="M5 12.5l5 5L20 7" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2.5}
      viewBox="0 0 24 24"
    >
      <path d="M6 12h12" />
    </svg>
  );
}

export function CoverageMatrixPanel({
  record,
  refreshKey
}: CoverageMatrixPanelProps): ReactElement {
  const caseId = record?.trademarkCase.id ?? null;
  const [evidenceRecords, setEvidenceRecords] = useState<EvidenceRecord[]>([]);
  const [loadedCaseId, setLoadedCaseId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [manualRefreshKey, setManualRefreshKey] = useState(0);
  const [message, setMessage] = useState<PanelMessage | null>(null);

  useEffect(() => {
    let isActive = true;

    if (!caseId) {
      return () => {
        isActive = false;
      };
    }

    const loadTimer = window.setTimeout(() => {
      setIsLoading(true);
      setMessage(null);

      void window.markProof.evidence
        .listByCase(caseId)
        .then((records) => {
          if (isActive) {
            setEvidenceRecords(records);
            setLoadedCaseId(caseId);
          }
        })
        .catch(() => {
          if (isActive) {
            setMessage({ tone: 'error', text: 'Could not load coverage data.' });
            setEvidenceRecords([]);
            setLoadedCaseId(caseId);
          }
        })
        .finally(() => {
          if (isActive) {
            setIsLoading(false);
          }
        });
    }, 0);

    return () => {
      isActive = false;
      window.clearTimeout(loadTimer);
    };
  }, [caseId, manualRefreshKey, refreshKey]);

  const currentEvidenceRecords = useMemo(
    () => (caseId !== null && loadedCaseId === caseId ? evidenceRecords : []),
    [caseId, evidenceRecords, loadedCaseId]
  );
  const isMatrixLoading = isLoading || (caseId !== null && loadedCaseId !== caseId);

  const matrix = useMemo(
    () =>
      record
        ? buildCoverageMatrix({
            trademarkCase: record.trademarkCase,
            goodsServices: record.goodsServices,
            evidenceRecords: currentEvidenceRecords
          })
        : null,
    [currentEvidenceRecords, record]
  );
  const totalCells = matrix ? matrix.rows.length * matrix.periods.length : 0;

  return (
    <section className="mt-4 rounded-lg border border-line bg-surface shadow-panel">
      <div className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Coverage Matrix</h3>
            <p className="mt-1 text-sm text-muted">
              {record
                ? `${record.trademarkCase.markName}: ${record.trademarkCase.usePeriodFrom} to ${record.trademarkCase.usePeriodTo}`
                : 'Select a trademark case to review coverage.'}
            </p>
          </div>
          <button
            className="rounded-md border border-line px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-panel hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-65"
            disabled={!caseId || isMatrixLoading}
            onClick={() => {
              setIsLoading(true);
              setManualRefreshKey((current) => current + 1);
            }}
            type="button"
          >
            {isMatrixLoading ? 'Loading' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {message && (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              message.tone === 'error'
                ? 'border-danger/35 bg-[oklch(0.96_0.026_29)] text-ink'
                : 'border-line bg-panel text-muted'
            }`}
          >
            {message.text}
          </div>
        )}

        {!record || !matrix ? (
          <div className="rounded-md border border-line bg-panel px-4 py-10 text-sm text-muted">
            No case selected.
          </div>
        ) : isMatrixLoading ? (
          <div className="space-y-3" role="status" aria-busy="true">
            <div className="h-16 rounded-md border border-line bg-panel" />
            <div className="h-44 rounded-md border border-line bg-panel" />
          </div>
        ) : matrix.periods.length === 0 ? (
          <div className="rounded-md border border-warning/45 bg-[oklch(0.965_0.035_82)] px-4 py-6 text-sm text-ink">
            Review recommended: the selected use period cannot be converted into matrix periods.
          </div>
        ) : matrix.rows.length === 0 ? (
          <div className="rounded-md border border-line bg-panel px-4 py-10 text-sm text-muted">
            Add goods/services descriptions to show coverage rows.
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-line bg-panel px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                  Periods with evidence
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {matrix.totals.coveredCells} of {totalCells} cells
                </p>
              </div>
              <div className="rounded-md border border-line bg-panel px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                  Periods without evidence
                </p>
                <p className="mt-1 text-sm font-semibold">{matrix.totals.gapCells} cells</p>
              </div>
              <div className="rounded-md border border-line bg-panel px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                  Review recommended
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {matrix.totals.reviewRecommendedEvidenceItems} evidence item
                  {matrix.totals.reviewRecommendedEvidenceItems === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border border-line">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 min-w-72 border-b border-line bg-panel px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                      Goods/services
                    </th>
                    {matrix.periods.map((period) => (
                      <th
                        className="min-w-32 border-b border-l border-line bg-panel px-3 py-3 text-left"
                        key={period.id}
                        title={`${period.startDate} to ${period.endDate}`}
                      >
                        <span className="block text-sm font-semibold">{period.label}</span>
                        <span className="mt-1 block text-xs font-normal text-muted">
                          {period.startDate} to {period.endDate}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.rows.map((row) => (
                    <tr key={row.goodsService.id}>
                      <th className="sticky left-0 z-10 max-w-96 border-b border-line bg-surface px-3 py-3 text-left align-top">
                        <div className="min-w-0">
                          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                            {niceClassLabel(row.goodsService.niceClass)}
                          </p>
                          <p className="mt-1 text-sm font-semibold leading-5">
                            {row.goodsService.description}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                            <span>
                              {row.totalEvidenceCount} evidence item
                              {row.totalEvidenceCount === 1 ? '' : 's'} mapped
                            </span>
                            {row.reviewRecommendedEvidenceIds.length > 0 && (
                              <span className="rounded-full border border-warning/45 bg-[oklch(0.965_0.035_82)] px-2 py-0.5 text-ink">
                                Review recommended
                              </span>
                            )}
                          </div>
                        </div>
                      </th>
                      {row.cells.map((cell) => (
                        <td
                          className="border-b border-l border-line bg-surface p-2 align-middle"
                          key={cell.periodId}
                        >
                          <div
                            aria-label={`${cellLabel(cell)} for ${row.goodsService.description}`}
                            className={`flex h-16 min-w-28 flex-col items-center justify-center rounded-md border px-2 text-center ${cellClass(
                              cell
                            )}`}
                          >
                            <div className="flex items-center gap-1.5">
                              <CellStatusIcon status={cell.status} />
                              <span className="text-base font-semibold">{cell.evidenceCount}</span>
                            </div>
                            <span className="mt-0.5 text-[0.7rem] font-medium">
                              {cellLabel(cell)}
                            </span>
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {matrix.reviewItems.length > 0 && (
              <section className="rounded-md border border-line bg-panel">
                <div className="border-b border-line px-4 py-3">
                  <h4 className="text-sm font-semibold">Review recommended</h4>
                </div>
                <div className="divide-y divide-line">
                  {matrix.reviewItems.slice(0, 6).map((item) => (
                    <div
                      className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1fr_auto]"
                      key={`${item.reason}-${item.evidenceId}-${item.goodsServiceIds.join('-')}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.sourceFilename}</p>
                        <p className="mt-1 text-xs text-muted">
                          {evidenceTypeLabels[item.evidenceType]},{' '}
                          {item.dateOfUse ?? 'No date of use'}
                        </p>
                      </div>
                      <span className="self-start rounded-full border border-warning/45 bg-[oklch(0.965_0.035_82)] px-2.5 py-1 text-xs font-medium text-ink">
                        {reviewReasonLabels[item.reason]}
                      </span>
                    </div>
                  ))}
                  {matrix.reviewItems.length > 6 && (
                    <div className="px-4 py-3 text-xs text-muted">
                      {matrix.reviewItems.length - 6} more review item
                      {matrix.reviewItems.length - 6 === 1 ? '' : 's'}
                    </div>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </section>
  );
}
