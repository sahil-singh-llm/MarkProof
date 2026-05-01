import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import { CURRENCY_ENTRIES } from '../../../../shared/constants/currencies';
import { EVIDENCE_TYPES } from '../../../../shared/types/evidence';
import type {
  EvidenceDateCandidate,
  EvidenceImportResult,
  EvidenceRecord,
  EvidenceTextExtractionStatus,
  EvidenceType
} from '../../../../shared/types/evidence';
import type { TrademarkCaseRecord } from '../../../../shared/types/case';
import { TerritorySelector } from '../../components/TerritorySelector';

type EvidencePanelProps = {
  onEvidenceChanged?: () => void;
  record: TrademarkCaseRecord | null;
};

type ReviewDraft = {
  evidenceType: EvidenceType;
  dateOfUse: string;
  territory: string;
  territories: string[];
  markFormAsUsed: string;
  useAmountValue: string;
  useAmountCurrency: string;
  useUnitsCount: string;
  coveredGoodsServiceIds: string[];
  notes: string;
};

type PanelMessage = {
  tone: 'success' | 'error';
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

const dateSourceLabels: Record<EvidenceDateCandidate['source'], string> = {
  pdf_text: 'PDF text',
  exif: 'EXIF',
  file_created: 'Created',
  file_modified: 'Modified',
  manual: 'Manual'
};

function draftFromRecord(record: EvidenceRecord): ReviewDraft {
  return {
    evidenceType: record.evidence.evidenceType,
    dateOfUse: record.evidence.dateOfUse ?? '',
    territory: record.evidence.territory,
    territories: record.evidence.territories,
    markFormAsUsed: record.evidence.markFormAsUsed,
    useAmountValue:
      record.evidence.useAmountValue === null ? '' : String(record.evidence.useAmountValue),
    useAmountCurrency: record.evidence.useAmountCurrency ?? '',
    useUnitsCount:
      record.evidence.useUnitsCount === null ? '' : String(record.evidence.useUnitsCount),
    coveredGoodsServiceIds: record.goodsServiceLinks.map((link) => link.goodsServiceId),
    notes: record.evidence.notes
  };
}

function parseDecimalInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  // Accept comma as decimal separator (DE locale).
  const normalized = trimmed.replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('Use amount must be a non-negative number.');
  }
  return parsed;
}

function parseIntegerInput(value: string, fieldName: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }
  return parsed;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 12)}...${hash.slice(-8)}`;
}

function extractionStatusLabel(status: EvidenceTextExtractionStatus): string {
  switch (status) {
    case 'completed':
      return 'Text extracted';
    case 'failed':
      return 'Text review needed';
    case 'not_applicable':
      return 'No text extraction';
    case 'pending':
      return 'Text pending';
  }
}

function extractionStatusClass(status: EvidenceTextExtractionStatus): string {
  switch (status) {
    case 'completed':
      return 'border-accent/30 bg-accentSoft text-accent';
    case 'failed':
      return 'border-warning/45 bg-[oklch(0.96_0.04_82)] text-ink';
    case 'not_applicable':
      return 'border-line bg-panel text-muted';
    case 'pending':
      return 'border-line bg-surface text-muted';
  }
}

function importResultText(result: EvidenceImportResult): string {
  switch (result.status) {
    case 'imported':
      return `${result.sourceFilename}: imported`;
    case 'duplicate':
      return `${result.sourceFilename}: duplicate detected`;
    case 'rejected':
      return `${result.sourceFilename}: ${result.message}`;
  }
}

function importResultClass(result: EvidenceImportResult): string {
  if (result.status === 'rejected') {
    return 'border-danger/35 bg-[oklch(0.96_0.026_29)] text-ink';
  }

  if (result.status === 'duplicate') {
    return 'border-warning/40 bg-[oklch(0.965_0.035_82)] text-ink';
  }

  return 'border-accent/30 bg-accentSoft text-ink';
}

function recordFromImportResult(result: EvidenceImportResult): EvidenceRecord | null {
  return result.status === 'imported' || result.status === 'duplicate' ? result.evidence : null;
}

function niceClassLabel(niceClass: number | null): string {
  return niceClass === null ? 'No class' : `Class ${niceClass}`;
}

export function EvidencePanel({ onEvidenceChanged, record }: EvidencePanelProps): ReactElement {
  const caseId = record?.trademarkCase.id ?? null;
  const goodsServices = record?.goodsServices ?? [];
  const [evidenceRecords, setEvidenceRecords] = useState<EvidenceRecord[]>([]);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<PanelMessage | null>(null);
  const [importResults, setImportResults] = useState<EvidenceImportResult[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const selectedEvidence = useMemo(
    () =>
      evidenceRecords.find((evidenceRecord) => evidenceRecord.evidence.id === selectedEvidenceId) ??
      null,
    [evidenceRecords, selectedEvidenceId]
  );

  const selectedCandidateDates = selectedEvidence?.dateCandidates ?? [];

  const loadEvidence = useCallback(
    async (preferredEvidenceId?: string | null) => {
      if (!caseId) {
        setEvidenceRecords([]);
        setSelectedEvidenceId(null);
        setDraft(null);
        return;
      }

      setIsLoading(true);
      setMessage(null);

      try {
        const nextRecords = await window.markProof.evidence.listByCase(caseId);
        setEvidenceRecords(nextRecords);

        const nextSelected =
          nextRecords.find((item) => item.evidence.id === preferredEvidenceId) ??
          nextRecords[0] ??
          null;

        if (nextSelected) {
          setSelectedEvidenceId(nextSelected.evidence.id);
          setDraft(draftFromRecord(nextSelected));
        } else {
          setSelectedEvidenceId(null);
          setDraft(null);
        }
      } catch {
        setMessage({ tone: 'error', text: 'Could not load evidence.' });
      } finally {
        setIsLoading(false);
      }
    },
    [caseId]
  );

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadEvidence();
    }, 0);

    return () => {
      window.clearTimeout(loadTimer);
    };
  }, [loadEvidence]);

  function selectEvidence(evidenceRecord: EvidenceRecord): void {
    setSelectedEvidenceId(evidenceRecord.evidence.id);
    setDraft(draftFromRecord(evidenceRecord));
    setMessage(null);
    setImportResults([]);
    setConfirmingDelete(false);
  }

  function updateDraft<K extends keyof ReviewDraft>(key: K, value: ReviewDraft[K]): void {
    setDraft((current) =>
      current
        ? {
            ...current,
            [key]: value
          }
        : current
    );
  }

  function toggleGoodsService(goodsServiceId: string): void {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      const isLinked = current.coveredGoodsServiceIds.includes(goodsServiceId);

      return {
        ...current,
        coveredGoodsServiceIds: isLinked
          ? current.coveredGoodsServiceIds.filter((id) => id !== goodsServiceId)
          : [...current.coveredGoodsServiceIds, goodsServiceId]
      };
    });
  }

  async function importEvidence(): Promise<void> {
    if (!caseId) {
      return;
    }

    setIsImporting(true);
    setMessage(null);
    setImportResults([]);

    try {
      const results = await window.markProof.evidence.chooseAndImport(caseId);
      setImportResults(results);

      const preferredEvidenceId =
        results.map(recordFromImportResult).find((item) => item !== null)?.evidence.id ??
        selectedEvidenceId;

      await loadEvidence(preferredEvidenceId);

      if (results.some((result) => result.status === 'imported')) {
        onEvidenceChanged?.();
      }

      if (results.length === 0) {
        setMessage({ tone: 'success', text: 'Import cancelled.' });
      } else {
        const importedCount = results.filter((result) => result.status === 'imported').length;
        const duplicateCount = results.filter((result) => result.status === 'duplicate').length;
        const rejectedCount = results.filter((result) => result.status === 'rejected').length;
        setMessage({
          tone: rejectedCount > 0 ? 'error' : 'success',
          text: `${importedCount} imported, ${duplicateCount} duplicate, ${rejectedCount} rejected.`
        });
      }
    } catch {
      setMessage({ tone: 'error', text: 'Could not import evidence.' });
    } finally {
      setIsImporting(false);
    }
  }

  async function saveReview(): Promise<void> {
    if (!selectedEvidence || !draft) {
      return;
    }

    setIsSaving(true);
    setMessage(null);

    let parsedAmount: number | null;
    let parsedUnits: number | null;
    try {
      parsedAmount = parseDecimalInput(draft.useAmountValue);
      parsedUnits = parseIntegerInput(draft.useUnitsCount, 'Units sold');
    } catch (parseError) {
      setMessage({
        tone: 'error',
        text: parseError instanceof Error ? parseError.message : 'Invalid quantitative input.'
      });
      setIsSaving(false);
      return;
    }

    try {
      const updated = await window.markProof.evidence.update(selectedEvidence.evidence.id, {
        evidenceType: draft.evidenceType,
        dateOfUse: draft.dateOfUse.trim().length > 0 ? draft.dateOfUse : null,
        territory: draft.territory,
        territories: draft.territories,
        markFormAsUsed: draft.markFormAsUsed,
        useAmountValue: parsedAmount,
        useAmountCurrency:
          draft.useAmountCurrency.trim().length > 0 ? draft.useAmountCurrency : null,
        useUnitsCount: parsedUnits,
        coveredGoodsServiceIds: draft.coveredGoodsServiceIds,
        notes: draft.notes
      });

      if (!updated) {
        setMessage({ tone: 'error', text: 'The selected evidence no longer exists.' });
        await loadEvidence();
        return;
      }

      setEvidenceRecords((current) =>
        current.map((item) => (item.evidence.id === updated.evidence.id ? updated : item))
      );
      setSelectedEvidenceId(updated.evidence.id);
      setDraft(draftFromRecord(updated));
      setConfirmingDelete(false);
      onEvidenceChanged?.();
      setMessage({ tone: 'success', text: 'Evidence review saved.' });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Could not save evidence review.'
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteEvidence(): Promise<void> {
    if (!selectedEvidence) {
      return;
    }

    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const result = await window.markProof.evidence.delete(selectedEvidence.evidence.id);

      setConfirmingDelete(false);

      if (!result.deleted) {
        setMessage({ tone: 'error', text: 'The selected evidence no longer exists.' });
      } else {
        setMessage({ tone: 'success', text: 'Evidence deleted.' });
        onEvidenceChanged?.();
      }

      await loadEvidence(null);
    } catch {
      setMessage({ tone: 'error', text: 'Could not delete evidence.' });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="mt-4 rounded-lg border border-line bg-surface shadow-panel">
      <div className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Evidence Review</h3>
            <p className="mt-1 text-sm text-muted">
              {record
                ? `${record.trademarkCase.markName}: ${evidenceRecords.length} evidence item${evidenceRecords.length === 1 ? '' : 's'}`
                : 'Select a trademark case before importing evidence.'}
            </p>
          </div>
          <button
            className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-[oklch(0.985_0.006_120)] transition-colors hover:bg-[oklch(0.42_0.11_173)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-65"
            disabled={!caseId || isImporting}
            onClick={() => void importEvidence()}
            type="button"
          >
            {isImporting ? 'Importing' : 'Import Evidence'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 p-5 xl:grid-cols-[minmax(22rem,0.9fr)_minmax(36rem,1.1fr)]">
        <div className="min-w-0">
          {(message || importResults.length > 0) && (
            <div className="mb-4 space-y-2">
              {message && (
                <div
                  className={`rounded-md border px-3 py-2 text-sm ${
                    message.tone === 'error'
                      ? 'border-danger/35 bg-[oklch(0.96_0.026_29)] text-ink'
                      : 'border-accent/30 bg-accentSoft text-ink'
                  }`}
                >
                  {message.text}
                </div>
              )}

              {importResults.length > 0 && (
                <div className="space-y-1">
                  {importResults.map((result, index) => (
                    <div
                      className={`rounded-md border px-3 py-2 text-xs ${importResultClass(result)}`}
                      key={`${result.sourceFilename}-${result.status}-${index}`}
                    >
                      {importResultText(result)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="overflow-hidden rounded-md border border-line">
            <div className="border-b border-line bg-panel px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Evidence items
            </div>
            <div className="max-h-[36rem] overflow-auto">
              {isLoading ? (
                <div className="space-y-2 p-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      className="h-24 rounded-md border border-line bg-surface"
                      key={`evidence-skeleton-${index}`}
                    />
                  ))}
                </div>
              ) : evidenceRecords.length === 0 ? (
                <div className="px-3 py-10 text-sm leading-6 text-muted">
                  {caseId
                    ? 'No evidence imported for this case.'
                    : 'Choose a case to view evidence.'}
                </div>
              ) : (
                <div className="divide-y divide-line">
                  {evidenceRecords.map((evidenceRecord) => {
                    const evidence = evidenceRecord.evidence;
                    const isSelected = evidence.id === selectedEvidenceId;

                    return (
                      <button
                        className={`w-full px-3 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-accent ${
                          isSelected ? 'bg-accentSoft' : 'bg-surface hover:bg-panel'
                        }`}
                        key={evidence.id}
                        onClick={() => selectEvidence(evidenceRecord)}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {evidence.sourceFilename}
                            </p>
                            <p className="mt-1 text-xs text-muted">
                              {evidence.dateOfUse ?? 'Review recommended'} ·{' '}
                              {evidence.territory || 'No territory'}
                            </p>
                          </div>
                          <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-medium text-muted">
                            {evidenceTypeLabels[evidence.evidenceType]}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className={`rounded-full border px-2 py-0.5 ${extractionStatusClass(
                              evidence.extractedTextStatus
                            )}`}
                          >
                            {extractionStatusLabel(evidence.extractedTextStatus)}
                          </span>
                          <span className="text-muted">
                            {evidenceRecord.dateCandidates.length} candidate date
                            {evidenceRecord.dateCandidates.length === 1 ? '' : 's'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-md border border-line bg-panel">
          <div className="border-b border-line px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold">Metadata Review</h4>
                <p className="mt-1 text-sm text-muted">
                  {selectedEvidence
                    ? selectedEvidence.evidence.sourceFilename
                    : 'No evidence selected.'}
                </p>
              </div>
              {selectedEvidence && (
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${extractionStatusClass(
                    selectedEvidence.evidence.extractedTextStatus
                  )}`}
                >
                  {extractionStatusLabel(selectedEvidence.evidence.extractedTextStatus)}
                </span>
              )}
            </div>
          </div>

          {!selectedEvidence || !draft ? (
            <div className="px-4 py-12 text-sm leading-6 text-muted">
              Import evidence and select an item to review extracted dates, territory,
              goods/services coverage, notes, and file integrity metadata.
            </div>
          ) : (
            <div className="space-y-5 p-4">
              <dl className="grid gap-3 text-sm md:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                    SHA-256
                  </dt>
                  <dd className="mt-1 truncate font-mono text-xs text-ink">
                    {shortHash(selectedEvidence.evidence.fileHash)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                    Size
                  </dt>
                  <dd className="mt-1 text-sm font-medium">
                    {formatFileSize(selectedEvidence.evidence.fileSizeBytes)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                    Imported
                  </dt>
                  <dd className="mt-1 text-sm font-medium">
                    {selectedEvidence.evidence.importedAt.slice(0, 10)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                    Type
                  </dt>
                  <dd className="mt-1 text-sm font-medium">
                    {selectedEvidence.evidence.mimeType ?? 'Unknown'}
                  </dd>
                </div>
              </dl>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium">Evidence type</span>
                  <select
                    className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accentSoft"
                    onChange={(event) =>
                      updateDraft('evidenceType', event.target.value as EvidenceType)
                    }
                    value={draft.evidenceType}
                  >
                    {EVIDENCE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {evidenceTypeLabels[type]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-medium">Date of use</span>
                  <input
                    className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accentSoft"
                    onChange={(event) => updateDraft('dateOfUse', event.target.value)}
                    type="date"
                    value={draft.dateOfUse}
                  />
                </label>

                <label className="block md:col-span-2">
                  <span className="text-sm font-medium">Mark as actually used</span>
                  <input
                    className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accentSoft"
                    onChange={(event) => updateDraft('markFormAsUsed', event.target.value)}
                    placeholder="Leave empty if identical to the registered form"
                    type="text"
                    value={draft.markFormAsUsed}
                  />
                  <span className="mt-1 block text-xs text-muted">
                    If the mark on this evidence deviates from the registered form (§ 26 Abs. 3
                    MarkenG / Art. 18(1)(a) EUTMR), describe what is shown.
                  </span>
                </label>
              </div>

              <section>
                <h5 className="text-sm font-semibold">Territories</h5>
                <p className="mt-1 text-xs text-muted">
                  ISO 3166-1 alpha-2 codes covered by this piece of evidence. Aggregate one item
                  may cover multiple territories — relevant for EU-wide use under C-149/11{' '}
                  <em>Leno Merken</em>.
                </p>
                <div className="mt-2">
                  <TerritorySelector
                    onChange={(next) => updateDraft('territories', next)}
                    selected={draft.territories}
                  />
                </div>
                <label className="mt-3 block">
                  <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                    Territory notes
                  </span>
                  <input
                    className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accentSoft"
                    onChange={(event) => updateDraft('territory', event.target.value)}
                    placeholder="Free-text notes (e.g. distribution channel, region detail)"
                    type="text"
                    value={draft.territory}
                  />
                </label>
              </section>

              <section>
                <h5 className="text-sm font-semibold">Quantitative use</h5>
                <p className="mt-1 text-xs text-muted">
                  Optional. Genuine use under <em>Ansul</em> / <em>La Mer</em> turns on commercial
                  scale — turnover or units. Leave blank where the evidence does not quantify.
                </p>
                <div className="mt-2 grid gap-3 md:grid-cols-[1fr_8rem_8rem]">
                  <label className="block">
                    <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                      Use amount
                    </span>
                    <input
                      className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accentSoft"
                      inputMode="decimal"
                      onChange={(event) => updateDraft('useAmountValue', event.target.value)}
                      placeholder="0.00"
                      type="text"
                      value={draft.useAmountValue}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                      Currency
                    </span>
                    <select
                      className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accentSoft"
                      onChange={(event) => updateDraft('useAmountCurrency', event.target.value)}
                      value={draft.useAmountCurrency}
                    >
                      <option value="">—</option>
                      {CURRENCY_ENTRIES.map((entry) => (
                        <option key={entry.code} value={entry.code}>
                          {entry.code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                      Units sold
                    </span>
                    <input
                      className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accentSoft"
                      inputMode="numeric"
                      min={0}
                      onChange={(event) => updateDraft('useUnitsCount', event.target.value)}
                      placeholder="0"
                      type="number"
                      value={draft.useUnitsCount}
                    />
                  </label>
                </div>
              </section>

              <section>
                <h5 className="text-sm font-semibold">Candidate dates</h5>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedCandidateDates.length === 0 ? (
                    <span className="text-sm text-muted">No candidate dates detected.</span>
                  ) : (
                    selectedCandidateDates.slice(0, 10).map((candidate) => (
                      <button
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                          draft.dateOfUse === candidate.candidateDate
                            ? 'border-accent bg-accentSoft text-accent'
                            : 'border-line bg-surface text-muted hover:bg-accentSoft hover:text-accent'
                        }`}
                        aria-pressed={draft.dateOfUse === candidate.candidateDate}
                        key={candidate.id}
                        onClick={() => updateDraft('dateOfUse', candidate.candidateDate)}
                        type="button"
                      >
                        {candidate.candidateDate} · {dateSourceLabels[candidate.source]}
                      </button>
                    ))
                  )}
                </div>
              </section>

              <section>
                <h5 className="text-sm font-semibold">Covered goods/services</h5>
                <div className="mt-2 max-h-52 overflow-auto rounded-md border border-line bg-surface">
                  {goodsServices.length === 0 ? (
                    <div className="px-3 py-6 text-sm text-muted">
                      Add goods/services to the case before mapping evidence.
                    </div>
                  ) : (
                    <div className="divide-y divide-line">
                      {goodsServices.map((goodsService) => {
                        const checked = draft.coveredGoodsServiceIds.includes(goodsService.id);

                        return (
                          <label
                            className="grid cursor-pointer grid-cols-[auto_1fr] gap-3 px-3 py-3 text-sm hover:bg-panel"
                            key={goodsService.id}
                          >
                            <input
                              checked={checked}
                              className="mt-1 h-4 w-4 accent-[oklch(var(--color-accent))]"
                              onChange={() => toggleGoodsService(goodsService.id)}
                              type="checkbox"
                            />
                            <span className="min-w-0">
                              <span className="font-medium">
                                {niceClassLabel(goodsService.niceClass)}
                              </span>
                              <span className="mt-1 block text-muted">
                                {goodsService.description}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>

              <label className="block">
                <span className="text-sm font-medium">Notes</span>
                <textarea
                  className="mt-1 min-h-28 w-full resize-y rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accentSoft"
                  onChange={(event) => updateDraft('notes', event.target.value)}
                  value={draft.notes}
                />
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <button
                  className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    confirmingDelete
                      ? 'border-danger/45 bg-[oklch(0.96_0.026_29)] text-ink'
                      : 'border-line bg-surface text-muted hover:bg-panel hover:text-ink'
                  }`}
                  aria-pressed={confirmingDelete}
                  disabled={isSaving}
                  onClick={() => void deleteEvidence()}
                  type="button"
                >
                  {confirmingDelete ? 'Confirm delete' : 'Delete'}
                </button>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-panel hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    disabled={isSaving}
                    onClick={() => selectEvidence(selectedEvidence)}
                    type="button"
                  >
                    Reset
                  </button>
                  <button
                    className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-[oklch(0.985_0.006_120)] transition-colors hover:bg-[oklch(0.42_0.11_173)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-65"
                    disabled={isSaving}
                    onClick={() => void saveReview()}
                    type="button"
                  >
                    {isSaving ? 'Saving' : 'Save Review'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
