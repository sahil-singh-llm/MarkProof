import { axisBottom, scaleTime, select, timeFormat } from 'd3';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { buildEvidenceTimeline } from '../../../../shared/timeline/evidence-timeline';
import type {
  EvidenceTimelinePoint,
  EvidenceTimelineReviewReason
} from '../../../../shared/timeline/evidence-timeline';
import type { TrademarkCaseRecord } from '../../../../shared/types/case';
import type { EvidenceRecord, EvidenceType } from '../../../../shared/types/evidence';

type TimelinePanelProps = {
  record: TrademarkCaseRecord | null;
  refreshKey: number;
};

type PanelMessage = {
  tone: 'error' | 'neutral';
  text: string;
};

type EvidenceTypeStyle = {
  color: string;
  label: string;
};

const evidenceTypeStyles: Record<EvidenceType, EvidenceTypeStyle> = {
  invoice: { color: 'oklch(0.47 0.104 173)', label: 'Invoice' },
  screenshot: { color: 'oklch(0.52 0.09 236)', label: 'Screenshot' },
  photo: { color: 'oklch(0.54 0.11 145)', label: 'Photo' },
  catalogue: { color: 'oklch(0.55 0.1 305)', label: 'Catalogue' },
  ad: { color: 'oklch(0.68 0.12 78)', label: 'Advertisement' },
  other: { color: 'oklch(0.48 0.02 144)', label: 'Other' }
};

const reviewReasonLabels: Record<EvidenceTimelineReviewReason, string> = {
  missing_date: 'Missing date of use',
  outside_period: 'Date outside period'
};

const SVG_WIDTH = 920;
const SVG_HEIGHT = 260;
const MARGIN = {
  top: 34,
  right: 36,
  bottom: 54,
  left: 42
};

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 12)}...${hash.slice(-8)}`;
}

function pointRadius(point: EvidenceTimelinePoint, selectedPointId: string | null): number {
  if (point.id === selectedPointId) {
    return 8;
  }

  return point.dateStatus === 'outside_period' ? 5 : 6;
}

function pointStroke(point: EvidenceTimelinePoint, selectedPointId: string | null): string {
  if (point.id === selectedPointId) {
    return 'oklch(0.238 0.018 142)';
  }

  return point.dateStatus === 'outside_period' ? 'oklch(0.58 0.16 29)' : 'oklch(0.992 0.004 118)';
}

function minIsoDate(values: readonly string[]): string {
  return values.reduce((earliest, value) => (value < earliest ? value : earliest));
}

function maxIsoDate(values: readonly string[]): string {
  return values.reduce((latest, value) => (value > latest ? value : latest));
}

export function TimelinePanel({ record, refreshKey }: TimelinePanelProps): ReactElement {
  const caseId = record?.trademarkCase.id ?? null;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [evidenceRecords, setEvidenceRecords] = useState<EvidenceRecord[]>([]);
  const [loadedCaseId, setLoadedCaseId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [manualRefreshKey, setManualRefreshKey] = useState(0);
  const [message, setMessage] = useState<PanelMessage | null>(null);
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);

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
            setSelectedPointId((current) =>
              current && records.some((item) => item.evidence.id === current) ? current : null
            );
          }
        })
        .catch(() => {
          if (isActive) {
            setMessage({ tone: 'error', text: 'Could not load timeline data.' });
            setEvidenceRecords([]);
            setLoadedCaseId(caseId);
            setSelectedPointId(null);
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
  const isTimelineLoading = isLoading || (caseId !== null && loadedCaseId !== caseId);
  const timeline = useMemo(
    () =>
      record
        ? buildEvidenceTimeline({
            trademarkCase: record.trademarkCase,
            goodsServices: record.goodsServices,
            evidenceRecords: currentEvidenceRecords
          })
        : null,
    [currentEvidenceRecords, record]
  );
  const focusedPoint =
    timeline?.points.find((point) => point.id === hoveredPointId) ??
    timeline?.points.find((point) => point.id === selectedPointId) ??
    null;

  useEffect(() => {
    const svgElement = svgRef.current;

    if (!svgElement || !timeline || isTimelineLoading) {
      return;
    }

    const svg = select(svgElement);
    svg.selectAll('*').remove();

    if (timeline.points.length === 0) {
      return;
    }

    const domainDates = [
      timeline.periodStart,
      timeline.periodEnd,
      ...timeline.points.map((point) => point.date)
    ];
    const x = scaleTime()
      .domain([toDate(minIsoDate(domainDates)), toDate(maxIsoDate(domainDates))])
      .range([MARGIN.left, SVG_WIDTH - MARGIN.right]);
    const formatMonth = timeFormat('%b %Y');
    const axisY = SVG_HEIGHT - MARGIN.bottom;
    const periodStartX = x(toDate(timeline.periodStart));
    const periodEndX = x(toDate(timeline.periodEnd));

    svg
      .append('rect')
      .attr('x', periodStartX)
      .attr('y', MARGIN.top - 22)
      .attr('width', Math.max(1, periodEndX - periodStartX))
      .attr('height', axisY - MARGIN.top + 38)
      .attr('rx', 8)
      .attr('fill', 'oklch(0.913 0.041 174 / 0.35)');

    svg
      .append('text')
      .attr('x', periodStartX + 8)
      .attr('y', MARGIN.top - 8)
      .attr('fill', 'oklch(0.47 0.104 173)')
      .attr('font-size', 11)
      .attr('font-weight', 700)
      .text('Relevant use period');

    svg
      .append('line')
      .attr('x1', MARGIN.left)
      .attr('x2', SVG_WIDTH - MARGIN.right)
      .attr('y1', axisY)
      .attr('y2', axisY)
      .attr('stroke', 'oklch(0.872 0.012 132)')
      .attr('stroke-width', 1);

    svg
      .append('g')
      .attr('transform', `translate(0,${axisY})`)
      .call(
        axisBottom(x)
          .ticks(Math.min(6, Math.max(2, timeline.points.length)))
          .tickFormat((value) => formatMonth(value as Date))
      )
      .call((axis) => axis.select('.domain').remove())
      .call((axis) => axis.selectAll('line').attr('stroke', 'oklch(0.872 0.012 132)').attr('y2', 8))
      .call((axis) =>
        axis
          .selectAll('text')
          .attr('fill', 'oklch(0.478 0.02 144)')
          .attr('font-size', 11)
          .attr('dy', '1.8em')
      );

    const lanes = ['invoice', 'screenshot', 'photo', 'catalogue', 'ad', 'other'] as const;
    const laneY = new Map<EvidenceType, number>(
      lanes.map((type, index) => [
        type,
        MARGIN.top + index * ((axisY - MARGIN.top - 18) / Math.max(1, lanes.length - 1))
      ])
    );

    svg
      .append('g')
      .selectAll('line')
      .data(lanes)
      .join('line')
      .attr('x1', MARGIN.left)
      .attr('x2', SVG_WIDTH - MARGIN.right)
      .attr('y1', (type) => laneY.get(type) ?? MARGIN.top)
      .attr('y2', (type) => laneY.get(type) ?? MARGIN.top)
      .attr('stroke', 'oklch(0.872 0.012 132 / 0.62)')
      .attr('stroke-dasharray', '3 5');

    svg
      .append('g')
      .selectAll('text')
      .data(lanes)
      .join('text')
      .attr('x', 8)
      .attr('y', (type) => (laneY.get(type) ?? MARGIN.top) + 4)
      .attr('fill', 'oklch(0.478 0.02 144)')
      .attr('font-size', 11)
      .attr('font-weight', 600)
      .text((type) => evidenceTypeStyles[type].label);

    svg
      .append('g')
      .selectAll<SVGCircleElement, EvidenceTimelinePoint>('circle')
      .data(timeline.points)
      .join('circle')
      .attr('cx', (point) => x(toDate(point.date)))
      .attr('cy', (point) => laneY.get(point.evidenceType) ?? MARGIN.top)
      .attr('r', (point) => pointRadius(point, selectedPointId))
      .attr('fill', (point) => evidenceTypeStyles[point.evidenceType].color)
      .attr('stroke', (point) => pointStroke(point, selectedPointId))
      .attr('stroke-width', (point) => (point.id === selectedPointId ? 2.5 : 1.5))
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr(
        'aria-label',
        (point) =>
          `${evidenceTypeStyles[point.evidenceType].label} ${point.sourceFilename} on ${point.date}`
      )
      .style('cursor', 'pointer')
      .on('mouseenter', (_event, point) => setHoveredPointId(point.id))
      .on('mouseleave', () => setHoveredPointId(null))
      .on('focus', (_event, point) => setHoveredPointId(point.id))
      .on('blur', () => setHoveredPointId(null))
      .on('click', (_event, point) => setSelectedPointId(point.id));
  }, [isTimelineLoading, selectedPointId, timeline]);

  return (
    <section className="mt-4 rounded-lg border border-line bg-surface shadow-panel">
      <div className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Evidence Timeline</h3>
            <p className="mt-1 text-sm text-muted">
              {record
                ? `${record.trademarkCase.markName}: evidence ordered by date of use`
                : 'Select a trademark case to view evidence over time.'}
            </p>
          </div>
          <button
            className="rounded-md border border-line px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-panel hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-65"
            disabled={!caseId || isTimelineLoading}
            onClick={() => {
              setIsLoading(true);
              setManualRefreshKey((current) => current + 1);
            }}
            type="button"
          >
            {isTimelineLoading ? 'Loading' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(19rem,0.55fr)]">
        <div className="min-w-0">
          {message && (
            <div
              className={`mb-4 rounded-md border px-3 py-2 text-sm ${
                message.tone === 'error'
                  ? 'border-danger/35 bg-[oklch(0.96_0.026_29)] text-ink'
                  : 'border-line bg-panel text-muted'
              }`}
            >
              {message.text}
            </div>
          )}

          {!record || !timeline ? (
            <div className="rounded-md border border-line bg-panel px-4 py-10 text-sm text-muted">
              No case selected.
            </div>
          ) : isTimelineLoading ? (
            <div className="space-y-3" role="status" aria-busy="true">
              <div className="h-16 rounded-md border border-line bg-panel" />
              <div className="h-64 rounded-md border border-line bg-panel" />
            </div>
          ) : timeline.points.length === 0 ? (
            <div className="rounded-md border border-line bg-panel px-4 py-10 text-sm text-muted">
              Add reviewed dates of use to evidence items to populate the timeline.
            </div>
          ) : (
            <div className="rounded-md border border-line bg-panel">
              <div className="grid gap-3 border-b border-line px-4 py-3 md:grid-cols-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                    Dated evidence
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {timeline.totals.datedEvidenceItems} of {timeline.totals.evidenceItems}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                    Review recommended
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {timeline.totals.reviewRecommendedEvidenceItems}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                    Outside period
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {timeline.totals.outsidePeriodEvidenceItems}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                    Period
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {timeline.periodStart} to {timeline.periodEnd}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto px-3 py-4">
                <svg
                  aria-label="Evidence timeline"
                  className="h-auto min-w-[52rem]"
                  ref={svgRef}
                  role="img"
                  viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                />
              </div>

              <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
                {(Object.keys(evidenceTypeStyles) as EvidenceType[]).map((type) => (
                  <span
                    className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-muted"
                    key={type}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: evidenceTypeStyles[type].color }}
                    />
                    {evidenceTypeStyles[type].label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="rounded-md border border-line bg-panel">
          <div className="border-b border-line px-4 py-3">
            <h4 className="text-sm font-semibold">Timeline Metadata</h4>
          </div>

          {focusedPoint ? (
            <div className="space-y-4 p-4 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                  Selected evidence
                </p>
                <p className="mt-1 font-semibold">{focusedPoint.sourceFilename}</p>
              </div>

              <dl className="space-y-3">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Date of use</dt>
                  <dd className="font-medium">{focusedPoint.date}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Type</dt>
                  <dd className="font-medium">
                    {evidenceTypeStyles[focusedPoint.evidenceType].label}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Territory</dt>
                  <dd className="font-medium">{focusedPoint.territory || 'No territory'}</dd>
                </div>
                <div>
                  <dt className="text-muted">SHA-256</dt>
                  <dd className="mt-1 truncate font-mono text-xs">
                    {shortHash(focusedPoint.fileHash)}
                  </dd>
                </div>
              </dl>

              {focusedPoint.dateStatus === 'outside_period' && (
                <div className="rounded-md border border-warning/45 bg-[oklch(0.965_0.035_82)] px-3 py-2 text-sm text-ink">
                  Review recommended: date outside the relevant use period.
                </div>
              )}

              <section>
                <h5 className="text-sm font-semibold">Covered goods/services</h5>
                <div className="mt-2 space-y-2">
                  {focusedPoint.goodsServiceLabels.length === 0 ? (
                    <p className="text-sm text-muted">No goods/services mapped.</p>
                  ) : (
                    focusedPoint.goodsServiceLabels.slice(0, 4).map((label) => (
                      <div
                        className="rounded-md border border-line bg-surface px-3 py-2 text-xs leading-5 text-muted"
                        key={label}
                      >
                        {label}
                      </div>
                    ))
                  )}
                </div>
              </section>

              {focusedPoint.notes && (
                <section>
                  <h5 className="text-sm font-semibold">Notes</h5>
                  <p className="mt-2 rounded-md border border-line bg-surface px-3 py-2 text-sm leading-6 text-muted">
                    {focusedPoint.notes}
                  </p>
                </section>
              )}
            </div>
          ) : (
            <div className="px-4 py-10 text-sm leading-6 text-muted">
              Hover or click a timeline point to inspect evidence metadata.
            </div>
          )}

          {timeline && timeline.reviewItems.length > 0 && (
            <section className="border-t border-line">
              <div className="px-4 py-3">
                <h5 className="text-sm font-semibold">Review recommended</h5>
              </div>
              <div className="divide-y divide-line">
                {timeline.reviewItems.slice(0, 5).map((item) => (
                  <div className="px-4 py-3 text-sm" key={`${item.reason}-${item.evidenceId}`}>
                    <p className="truncate font-medium">{item.sourceFilename}</p>
                    <p className="mt-1 text-xs text-muted">
                      {reviewReasonLabels[item.reason]}, {item.dateOfUse ?? 'No date'}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </section>
  );
}
