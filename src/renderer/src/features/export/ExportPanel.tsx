import { useState } from 'react';
import type { ReactElement } from 'react';

import type { TrademarkCaseRecord } from '../../../../shared/types/case';
import type { PdfBundleExportResult } from '../../../../shared/types/export';

type ExportPanelProps = {
  record: TrademarkCaseRecord | null;
};

type PanelMessage = {
  tone: 'success' | 'error' | 'neutral';
  text: string;
};

function shortHash(hash: string): string {
  return `${hash.slice(0, 12)}...${hash.slice(-8)}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function resultMessage(result: PdfBundleExportResult): PanelMessage {
  switch (result.status) {
    case 'exported':
      return { tone: 'success', text: 'PDF bundle exported.' };
    case 'cancelled':
      return { tone: 'neutral', text: 'Export cancelled.' };
    case 'case_not_found':
      return { tone: 'error', text: 'The selected case no longer exists.' };
  }
}

export function ExportPanel({ record }: ExportPanelProps): ReactElement {
  const caseId = record?.trademarkCase.id ?? null;
  const [isExporting, setIsExporting] = useState(false);
  const [message, setMessage] = useState<PanelMessage | null>(null);
  const [lastExport, setLastExport] = useState<Extract<
    PdfBundleExportResult,
    { status: 'exported' }
  > | null>(null);

  async function exportBundle(): Promise<void> {
    if (!caseId) {
      return;
    }

    setIsExporting(true);
    setMessage(null);

    try {
      const result = await window.markProof.bundle.chooseAndExport(caseId);
      setMessage(resultMessage(result));

      if (result.status === 'exported') {
        setLastExport(result);
      }
    } catch {
      setMessage({ tone: 'error', text: 'Could not export the PDF bundle.' });
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="mt-4 rounded-lg border border-line bg-surface shadow-panel">
      <div className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">PDF Bundle Export</h3>
            <p className="mt-1 text-sm text-muted">
              {record
                ? `${record.trademarkCase.markName}: numbered exhibits with metadata sheets`
                : 'Select a trademark case before exporting a bundle.'}
            </p>
          </div>
          <button
            className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-[oklch(0.985_0.006_120)] transition-colors hover:bg-[oklch(0.42_0.11_173)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-65"
            disabled={!caseId || isExporting}
            onClick={() => void exportBundle()}
            type="button"
          >
            {isExporting ? 'Exporting' : 'Export PDF Bundle'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.45fr)]">
        <div className="rounded-md border border-line bg-panel px-4 py-4">
          <h4 className="text-sm font-semibold">Bundle contents</h4>
          <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
            <div className="rounded-md border border-line bg-surface px-3 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                Cover page
              </p>
              <p className="mt-1 text-muted">Mark, owner, registration, jurisdiction, period.</p>
            </div>
            <div className="rounded-md border border-line bg-surface px-3 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                Evidence index
              </p>
              <p className="mt-1 text-muted">Dates, types, territories, source files, hashes.</p>
            </div>
            <div className="rounded-md border border-line bg-surface px-3 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                Numbered exhibits
              </p>
              <p className="mt-1 text-muted">
                Per-exhibit metadata sheets and mapped goods/services.
              </p>
            </div>
            <div className="rounded-md border border-line bg-surface px-3 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                Original files
              </p>
              <p className="mt-1 text-muted">PDF pages and images appended where practical.</p>
            </div>
          </div>
        </div>

        <aside className="rounded-md border border-line bg-panel">
          <div className="border-b border-line px-4 py-3">
            <h4 className="text-sm font-semibold">Last export</h4>
          </div>
          <div className="p-4">
            {message && (
              <div
                className={`mb-4 rounded-md border px-3 py-2 text-sm ${
                  message.tone === 'error'
                    ? 'border-danger/35 bg-[oklch(0.96_0.026_29)] text-ink'
                    : message.tone === 'success'
                      ? 'border-accent/30 bg-accentSoft text-ink'
                      : 'border-line bg-surface text-muted'
                }`}
              >
                {message.text}
              </div>
            )}

            {lastExport ? (
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-muted">Bundle hash</dt>
                  <dd className="mt-1 font-mono text-xs">{shortHash(lastExport.bundleHash)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Exhibits</dt>
                  <dd className="font-medium">{lastExport.exhibitsCount}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Pages</dt>
                  <dd className="font-medium">{lastExport.pageCount}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Size</dt>
                  <dd className="font-medium">{formatBytes(lastExport.fileSizeBytes)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Saved to</dt>
                  <dd className="mt-1 break-all text-xs text-muted">{lastExport.filePath}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm leading-6 text-muted">
                No bundle exported in this session. Exports are written locally and recorded in the
                audit log.
              </p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
