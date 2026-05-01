import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { AppShell } from './components/AppShell';
import type { AppTabId } from './components/AppShell';
import { DisclaimerBanner } from './components/DisclaimerBanner';
import { CasesPage } from './features/cases/CasesPage';
import { CoverageMatrixPanel } from './features/coverage/CoverageMatrixPanel';
import { EvidencePanel } from './features/evidence/EvidencePanel';
import { ExportPanel } from './features/export/ExportPanel';
import { TimelinePanel } from './features/timeline/TimelinePanel';
import { LEGAL_DISCLAIMER } from '../../shared/constants/disclaimer';
import type { AppInfo } from '../../shared/types/app';
import type { TrademarkCaseRecord } from '../../shared/types/case';

function sortRecords(records: readonly TrademarkCaseRecord[]): TrademarkCaseRecord[] {
  return [...records].sort((a, b) => {
    const byUpdatedAt = b.trademarkCase.updatedAt.localeCompare(a.trademarkCase.updatedAt);
    return byUpdatedAt !== 0
      ? byUpdatedAt
      : a.trademarkCase.markName.localeCompare(b.trademarkCase.markName);
  });
}

export function App(): ReactElement {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [activeTab, setActiveTab] = useState<AppTabId>('cases');
  const [records, setRecords] = useState<TrademarkCaseRecord[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [isLoadingCases, setIsLoadingCases] = useState(true);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [evidenceRefreshKey, setEvidenceRefreshKey] = useState(0);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    window.markProof.app
      .getInfo()
      .then((info) => {
        if (isMountedRef.current) {
          setAppInfo(info);
        }
      })
      .catch(() => {
        if (isMountedRef.current) {
          setAppInfo(null);
        }
      });
  }, []);

  const loadCases = useCallback(async (preferredSelectedId?: string | null): Promise<void> => {
    setIsLoadingCases(true);
    setCasesError(null);

    try {
      const next = sortRecords(await window.markProof.cases.list());
      if (!isMountedRef.current) return;

      setRecords(next);
      setSelectedCaseId((current) => {
        const preferred = preferredSelectedId ?? current;
        const preferredMatch = next.find((record) => record.trademarkCase.id === preferred);
        return preferredMatch?.trademarkCase.id ?? next[0]?.trademarkCase.id ?? null;
      });
    } catch {
      if (isMountedRef.current) {
        setCasesError('Could not load trademark cases.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingCases(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  const selectedRecord = useMemo(
    () => records.find((record) => record.trademarkCase.id === selectedCaseId) ?? null,
    [records, selectedCaseId]
  );

  const handleCaseSaved = useCallback((saved: TrademarkCaseRecord): void => {
    setRecords((current) =>
      sortRecords([
        saved,
        ...current.filter((record) => record.trademarkCase.id !== saved.trademarkCase.id)
      ])
    );
    setSelectedCaseId(saved.trademarkCase.id);
  }, []);

  const handleCaseDeleted = useCallback((deletedId: string): void => {
    setRecords((current) => current.filter((record) => record.trademarkCase.id !== deletedId));
    setSelectedCaseId((current) => (current === deletedId ? null : current));
  }, []);

  const handleEvidenceChanged = useCallback((): void => {
    setEvidenceRefreshKey((current) => current + 1);
  }, []);

  const disclaimerText = appInfo?.disclaimer ?? LEGAL_DISCLAIMER;
  const selectedMarkName = selectedRecord?.trademarkCase.markName ?? null;

  return (
    <AppShell
      activeTab={activeTab}
      isLoading={isLoadingCases}
      onTabChange={setActiveTab}
      recordsCount={records.length}
      selectedMarkName={selectedMarkName}
      version={appInfo?.version ?? null}
    >
      <DisclaimerBanner text={disclaimerText} />

      <div className="mt-5">
        {activeTab === 'cases' && (
          <CasesPage
            casesError={casesError}
            isLoading={isLoadingCases}
            onCaseDeleted={handleCaseDeleted}
            onCaseSaved={handleCaseSaved}
            onSelectCase={setSelectedCaseId}
            records={records}
            selectedCaseId={selectedCaseId}
          />
        )}
        {activeTab === 'evidence' && (
          <EvidencePanel
            key={selectedRecord?.trademarkCase.id ?? 'no-case'}
            onEvidenceChanged={handleEvidenceChanged}
            record={selectedRecord}
          />
        )}
        {activeTab === 'coverage' && (
          <CoverageMatrixPanel record={selectedRecord} refreshKey={evidenceRefreshKey} />
        )}
        {activeTab === 'timeline' && (
          <TimelinePanel record={selectedRecord} refreshKey={evidenceRefreshKey} />
        )}
        {activeTab === 'export' && <ExportPanel record={selectedRecord} />}
      </div>
    </AppShell>
  );
}
