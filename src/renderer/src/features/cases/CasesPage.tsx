import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactElement } from 'react';

import { LEGAL_DISCLAIMER } from '../../../../shared/constants/disclaimer';
import type { AppInfo } from '../../../../shared/types/app';
import type {
  CreateTrademarkCaseRecordInput,
  GoodsServiceDraft,
  TrademarkCaseRecord,
  TrademarkJurisdiction,
  UpdateTrademarkCaseRecordInput
} from '../../../../shared/types/case';
import { TRADEMARK_JURISDICTIONS } from '../../../../shared/types/case';
import { DisclaimerBanner } from '../../components/DisclaimerBanner';
import { CoverageMatrixPanel } from '../coverage/CoverageMatrixPanel';
import { EvidencePanel } from '../evidence/EvidencePanel';
import { TimelinePanel } from '../timeline/TimelinePanel';

type GoodsServiceDraftForm = {
  clientId: string;
  id?: string;
  niceClass: string;
  description: string;
};

type CaseDraft = {
  id?: string;
  markName: string;
  ownerName: string;
  registrationNumber: string;
  jurisdiction: TrademarkJurisdiction;
  usePeriodFrom: string;
  usePeriodTo: string;
  goodsServices: GoodsServiceDraftForm[];
};

type SaveMode = 'create' | 'edit';

type CasesPageProps = {
  appInfo: AppInfo | null;
};

const today = new Date().toISOString().slice(0, 10);

function createGoodsServiceDraft(): GoodsServiceDraftForm {
  return {
    clientId: crypto.randomUUID(),
    niceClass: '',
    description: ''
  };
}

function createEmptyDraft(): CaseDraft {
  return {
    markName: '',
    ownerName: '',
    registrationNumber: '',
    jurisdiction: 'DPMA',
    usePeriodFrom: today,
    usePeriodTo: today,
    goodsServices: [createGoodsServiceDraft()]
  };
}

function draftFromRecord(record: TrademarkCaseRecord): CaseDraft {
  return {
    id: record.trademarkCase.id,
    markName: record.trademarkCase.markName,
    ownerName: record.trademarkCase.ownerName,
    registrationNumber: record.trademarkCase.registrationNumber,
    jurisdiction: record.trademarkCase.jurisdiction,
    usePeriodFrom: record.trademarkCase.usePeriodFrom,
    usePeriodTo: record.trademarkCase.usePeriodTo,
    goodsServices:
      record.goodsServices.length > 0
        ? record.goodsServices.map((item) => ({
            clientId: item.id,
            id: item.id,
            niceClass: item.niceClass?.toString() ?? '',
            description: item.description
          }))
        : [createGoodsServiceDraft()]
  };
}

function toGoodsServicesInput(
  goodsServices: readonly GoodsServiceDraftForm[]
): GoodsServiceDraft[] {
  return goodsServices
    .map((item, index) => ({
      ...(item.id === undefined ? {} : { id: item.id }),
      niceClass: item.niceClass.trim().length > 0 ? Number(item.niceClass) : null,
      description: item.description,
      sortOrder: index
    }))
    .filter((item) => item.description.trim().length > 0);
}

function toCreateInput(draft: CaseDraft): CreateTrademarkCaseRecordInput {
  return {
    markName: draft.markName,
    ownerName: draft.ownerName,
    registrationNumber: draft.registrationNumber,
    jurisdiction: draft.jurisdiction,
    usePeriodFrom: draft.usePeriodFrom,
    usePeriodTo: draft.usePeriodTo,
    goodsServices: toGoodsServicesInput(draft.goodsServices)
  };
}

function toUpdateInput(draft: CaseDraft): UpdateTrademarkCaseRecordInput {
  return toCreateInput(draft);
}

function validateDraft(draft: CaseDraft): string | null {
  if (draft.markName.trim().length === 0) {
    return 'Mark name is required.';
  }

  if (draft.ownerName.trim().length === 0) {
    return 'Owner name is required.';
  }

  if (draft.registrationNumber.trim().length === 0) {
    return 'Registration number is required.';
  }

  if (draft.usePeriodFrom > draft.usePeriodTo) {
    return 'Use period start must be before or equal to use period end.';
  }

  if (toGoodsServicesInput(draft.goodsServices).length === 0) {
    return 'Add at least one goods/services description.';
  }

  return null;
}

function formatJurisdiction(value: TrademarkJurisdiction): string {
  return value === 'OTHER' ? 'Other' : value;
}

export function CasesPage({ appInfo }: CasesPageProps): ReactElement {
  const [records, setRecords] = useState<TrademarkCaseRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CaseDraft>(() => createEmptyDraft());
  const [mode, setMode] = useState<SaveMode>('create');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evidenceRefreshKey, setEvidenceRefreshKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const selectedRecord = useMemo(
    () => records.find((record) => record.trademarkCase.id === selectedId) ?? null,
    [records, selectedId]
  );

  const goodsServicesCount = useMemo(
    () => records.reduce((count, record) => count + record.goodsServices.length, 0),
    [records]
  );

  const loadCases = useCallback(async (preferredSelectedId?: string | null) => {
    setIsLoading(true);
    setError(null);

    try {
      const nextRecords = await window.markProof.cases.list();
      setRecords(nextRecords);

      if (nextRecords.length > 0) {
        const nextSelected =
          nextRecords.find((record) => record.trademarkCase.id === preferredSelectedId) ??
          nextRecords[0]!;
        setSelectedId(nextSelected.trademarkCase.id);
        setDraft(draftFromRecord(nextSelected));
        setMode('edit');
      } else {
        setSelectedId(null);
        setDraft(createEmptyDraft());
        setMode('create');
      }
    } catch {
      setError('Could not load trademark cases.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadCases();
    }, 0);

    return () => {
      window.clearTimeout(loadTimer);
    };
  }, [loadCases]);

  function startCreate(): void {
    setSelectedId(null);
    setDraft(createEmptyDraft());
    setMode('create');
    setError(null);
    setNotice(null);
    setConfirmingDelete(false);
  }

  function selectRecord(record: TrademarkCaseRecord): void {
    setSelectedId(record.trademarkCase.id);
    setDraft(draftFromRecord(record));
    setMode('edit');
    setError(null);
    setNotice(null);
    setConfirmingDelete(false);
  }

  function refreshEvidenceViews(): void {
    setEvidenceRefreshKey((current) => current + 1);
  }

  function updateDraftField<K extends keyof Omit<CaseDraft, 'goodsServices'>>(
    key: K,
    value: CaseDraft[K]
  ): void {
    setDraft((current) => ({
      ...current,
      [key]: value
    }));
  }

  function updateGoodsService(
    clientId: string,
    key: keyof Omit<GoodsServiceDraftForm, 'clientId' | 'id'>,
    value: string
  ): void {
    setDraft((current) => ({
      ...current,
      goodsServices: current.goodsServices.map((item) =>
        item.clientId === clientId
          ? {
              ...item,
              [key]: value
            }
          : item
      )
    }));
  }

  function addGoodsService(): void {
    setDraft((current) => ({
      ...current,
      goodsServices: [...current.goodsServices, createGoodsServiceDraft()]
    }));
  }

  function removeGoodsService(clientId: string): void {
    setDraft((current) => ({
      ...current,
      goodsServices:
        current.goodsServices.length > 1
          ? current.goodsServices.filter((item) => item.clientId !== clientId)
          : current.goodsServices
    }));
  }

  async function saveCase(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const validationMessage = validateDraft(draft);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setIsSaving(true);

    try {
      const saved =
        mode === 'create' || !draft.id
          ? await window.markProof.cases.create(toCreateInput(draft))
          : await window.markProof.cases.update(draft.id, toUpdateInput(draft));

      if (!saved) {
        setError('The selected case no longer exists.');
        await loadCases();
        return;
      }

      setRecords((current) => {
        const withoutSaved = current.filter(
          (record) => record.trademarkCase.id !== saved.trademarkCase.id
        );
        return [saved, ...withoutSaved].sort((a, b) =>
          b.trademarkCase.updatedAt.localeCompare(a.trademarkCase.updatedAt)
        );
      });
      setSelectedId(saved.trademarkCase.id);
      setDraft(draftFromRecord(saved));
      setMode('edit');
      setNotice(mode === 'create' ? 'Case created.' : 'Case updated.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the case.');
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteSelectedCase(): Promise<void> {
    if (!draft.id) {
      return;
    }

    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const result = await window.markProof.cases.delete(draft.id);

      if (!result.deleted) {
        setError('The selected case no longer exists.');
      }

      setNotice(result.deleted ? 'Case deleted.' : null);
      setConfirmingDelete(false);
      await loadCases(null);
    } catch {
      setError('Could not delete the case.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleNumberInput(event: ChangeEvent<HTMLInputElement>, clientId: string): void {
    updateGoodsService(clientId, 'niceClass', event.target.value);
  }

  return (
    <>
      <DisclaimerBanner text={appInfo?.disclaimer ?? LEGAL_DISCLAIMER} />

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(20rem,0.85fr)_minmax(34rem,1.25fr)_minmax(18rem,0.55fr)]">
        <section className="rounded-lg border border-line bg-surface shadow-panel">
          <div className="border-b border-line px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">Case Register</h3>
                <p className="mt-1 text-sm text-muted">
                  {records.length === 0
                    ? 'No cases stored in this workspace.'
                    : `${records.length} case${records.length === 1 ? '' : 's'} stored locally.`}
                </p>
              </div>
              <button
                className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-[oklch(0.985_0.006_120)] transition-colors hover:bg-[oklch(0.42_0.11_173)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                onClick={startCreate}
                type="button"
              >
                New Case
              </button>
            </div>
          </div>

          <div className="max-h-[calc(100vh-15rem)] overflow-auto p-3">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    className="h-20 rounded-md border border-line bg-panel"
                    key={`case-skeleton-${index}`}
                  />
                ))}
              </div>
            ) : records.length === 0 ? (
              <div className="px-3 py-10 text-sm leading-6 text-muted">
                Create a case to start organizing evidence by mark, owner, use period, and concrete
                goods/services descriptions.
              </div>
            ) : (
              <div className="space-y-2">
                {records.map((record) => {
                  const isSelected = record.trademarkCase.id === selectedId;

                  return (
                    <button
                      className={`w-full rounded-md border px-3 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                        isSelected
                          ? 'border-accent bg-accentSoft'
                          : 'border-line bg-surface hover:bg-panel'
                      }`}
                      key={record.trademarkCase.id}
                      onClick={() => selectRecord(record)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {record.trademarkCase.markName}
                          </p>
                          <p className="mt-1 truncate text-xs text-muted">
                            {record.trademarkCase.ownerName}
                          </p>
                        </div>
                        <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-xs text-muted">
                          {formatJurisdiction(record.trademarkCase.jurisdiction)}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
                        <span>{record.trademarkCase.registrationNumber}</span>
                        <span className="text-right">
                          {record.goodsServices.length} goods/services
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <form className="rounded-lg border border-line bg-surface shadow-panel" onSubmit={saveCase}>
          <div className="border-b border-line px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">
                  {mode === 'create' ? 'New Trademark Case' : 'Edit Trademark Case'}
                </h3>
                <p className="mt-1 text-sm text-muted">
                  Store case data and map evidence later to exact goods/services.
                </p>
              </div>
              <span className="rounded-full bg-accentSoft px-3 py-1 text-xs font-medium text-accent">
                {mode === 'create' ? 'Draft' : 'Saved case'}
              </span>
            </div>
          </div>

          <div className="space-y-5 px-5 py-5">
            {(error || notice) && (
              <div
                className={`rounded-md border px-3 py-2 text-sm ${
                  error
                    ? 'border-danger/35 bg-[oklch(0.96_0.026_29)] text-ink'
                    : 'border-accent/30 bg-accentSoft text-ink'
                }`}
              >
                {error ?? notice}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium">Mark name</span>
                <input
                  className="mt-1 w-full rounded-md border border-line bg-[oklch(0.99_0.004_118)] px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accentSoft"
                  onChange={(event) => updateDraftField('markName', event.target.value)}
                  type="text"
                  value={draft.markName}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium">Owner name</span>
                <input
                  className="mt-1 w-full rounded-md border border-line bg-[oklch(0.99_0.004_118)] px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accentSoft"
                  onChange={(event) => updateDraftField('ownerName', event.target.value)}
                  type="text"
                  value={draft.ownerName}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium">Registration number</span>
                <input
                  className="mt-1 w-full rounded-md border border-line bg-[oklch(0.99_0.004_118)] px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accentSoft"
                  onChange={(event) => updateDraftField('registrationNumber', event.target.value)}
                  type="text"
                  value={draft.registrationNumber}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium">Jurisdiction</span>
                <select
                  className="mt-1 w-full rounded-md border border-line bg-[oklch(0.99_0.004_118)] px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accentSoft"
                  onChange={(event) =>
                    updateDraftField('jurisdiction', event.target.value as TrademarkJurisdiction)
                  }
                  value={draft.jurisdiction}
                >
                  {TRADEMARK_JURISDICTIONS.map((jurisdiction) => (
                    <option key={jurisdiction} value={jurisdiction}>
                      {formatJurisdiction(jurisdiction)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium">Use period from</span>
                <input
                  className="mt-1 w-full rounded-md border border-line bg-[oklch(0.99_0.004_118)] px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accentSoft"
                  onChange={(event) => updateDraftField('usePeriodFrom', event.target.value)}
                  type="date"
                  value={draft.usePeriodFrom}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium">Use period to</span>
                <input
                  className="mt-1 w-full rounded-md border border-line bg-[oklch(0.99_0.004_118)] px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accentSoft"
                  onChange={(event) => updateDraftField('usePeriodTo', event.target.value)}
                  type="date"
                  value={draft.usePeriodTo}
                />
              </label>
            </div>

            <section>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold">Goods and services</h4>
                  <p className="mt-1 text-sm text-muted">
                    Use concrete descriptions below Nice class level.
                  </p>
                </div>
                <button
                  className="rounded-md border border-line px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-panel hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  onClick={addGoodsService}
                  type="button"
                >
                  Add row
                </button>
              </div>

              <div className="mt-3 space-y-3">
                {draft.goodsServices.map((item, index) => (
                  <div
                    className="grid gap-3 rounded-md border border-line bg-panel p-3 md:grid-cols-[7rem_1fr_auto]"
                    key={item.clientId}
                  >
                    <label className="block">
                      <span className="text-xs font-medium text-muted">Nice class</span>
                      <input
                        className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accentSoft"
                        max={45}
                        min={1}
                        onChange={(event) => handleNumberInput(event, item.clientId)}
                        type="number"
                        value={item.niceClass}
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-medium text-muted">
                        Goods/services description {index + 1}
                      </span>
                      <textarea
                        className="mt-1 min-h-20 w-full resize-y rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accentSoft"
                        onChange={(event) =>
                          updateGoodsService(item.clientId, 'description', event.target.value)
                        }
                        value={item.description}
                      />
                    </label>

                    <button
                      className="self-end rounded-md border border-line px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-45"
                      disabled={draft.goodsServices.length === 1}
                      onClick={() => removeGoodsService(item.clientId)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
            <div className="flex items-center gap-2">
              {mode === 'edit' && (
                <button
                  className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    confirmingDelete
                      ? 'border-danger/45 bg-[oklch(0.96_0.026_29)] text-ink'
                      : 'border-line text-muted hover:bg-panel hover:text-ink'
                  }`}
                  disabled={isSaving}
                  onClick={() => void deleteSelectedCase()}
                  type="button"
                >
                  {confirmingDelete ? 'Confirm delete' : 'Delete'}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                className="rounded-md border border-line px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-panel hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                disabled={isSaving}
                onClick={() => (selectedRecord ? selectRecord(selectedRecord) : startCreate())}
                type="button"
              >
                Reset
              </button>
              <button
                className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-[oklch(0.985_0.006_120)] transition-colors hover:bg-[oklch(0.42_0.11_173)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-65"
                disabled={isSaving}
                type="submit"
              >
                {isSaving ? 'Saving' : mode === 'create' ? 'Create Case' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>

        <aside className="rounded-lg border border-line bg-surface shadow-panel">
          <div className="border-b border-line px-5 py-4">
            <h3 className="text-base font-semibold">Workspace</h3>
          </div>

          <dl className="divide-y divide-line px-5 text-sm">
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-muted">Cases</dt>
              <dd className="font-medium">{records.length}</dd>
            </div>
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-muted">Goods/services</dt>
              <dd className="font-medium">{goodsServicesCount}</dd>
            </div>
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-muted">Hash</dt>
              <dd className="font-medium">{appInfo?.hashAlgorithm ?? 'sha256'}</dd>
            </div>
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-muted">Storage</dt>
              <dd className="font-medium">Local only</dd>
            </div>
            <div className="py-3">
              <dt className="text-muted">Selected period</dt>
              <dd className="mt-1 font-medium">
                {selectedRecord
                  ? `${selectedRecord.trademarkCase.usePeriodFrom} to ${selectedRecord.trademarkCase.usePeriodTo}`
                  : 'Draft case'}
              </dd>
            </div>
          </dl>
        </aside>
      </div>

      <CoverageMatrixPanel record={selectedRecord} refreshKey={evidenceRefreshKey} />

      <TimelinePanel record={selectedRecord} refreshKey={evidenceRefreshKey} />

      <EvidencePanel
        key={selectedRecord?.trademarkCase.id ?? 'no-case'}
        onEvidenceChanged={refreshEvidenceViews}
        record={selectedRecord}
      />
    </>
  );
}
