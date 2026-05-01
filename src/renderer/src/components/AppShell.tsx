import type { ReactNode } from 'react';

export const APP_TAB_IDS = ['cases', 'evidence', 'coverage', 'timeline', 'export'] as const;
export type AppTabId = (typeof APP_TAB_IDS)[number];

type TabConfig = {
  id: AppTabId;
  label: string;
  title: string;
};

const TABS: readonly TabConfig[] = [
  { id: 'cases', label: 'Cases', title: 'Trademark Cases' },
  { id: 'evidence', label: 'Evidence', title: 'Evidence Review' },
  { id: 'coverage', label: 'Coverage', title: 'Coverage Matrix' },
  { id: 'timeline', label: 'Timeline', title: 'Evidence Timeline' },
  { id: 'export', label: 'Export', title: 'PDF Bundle Export' }
] as const;

type AppShellProps = {
  activeTab: AppTabId;
  onTabChange: (tab: AppTabId) => void;
  version: string | null;
  recordsCount: number;
  selectedMarkName: string | null;
  isLoading: boolean;
  children: ReactNode;
};

function eyebrowFor(
  activeTab: AppTabId,
  recordsCount: number,
  selectedMarkName: string | null,
  isLoading: boolean
): string {
  if (activeTab === 'cases') {
    if (isLoading) {
      return 'Local workspace';
    }
    return recordsCount === 0
      ? 'Local workspace'
      : `${recordsCount} case${recordsCount === 1 ? '' : 's'} stored`;
  }

  return selectedMarkName ?? 'No case selected';
}

export function AppShell({
  activeTab,
  onTabChange,
  version,
  recordsCount,
  selectedMarkName,
  isLoading,
  children
}: AppShellProps) {
  const currentTab = TABS.find((tab) => tab.id === activeTab) ?? TABS[0]!;
  const eyebrow = eyebrowFor(activeTab, recordsCount, selectedMarkName, isLoading);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="grid min-h-screen grid-cols-[15rem_1fr] max-lg:grid-cols-1">
        <aside className="border-r border-line bg-panel px-4 py-5 max-lg:border-b max-lg:border-r-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold tracking-[0.16em] text-muted">MARKPROOF</p>
              <h1 className="mt-1 text-xl font-semibold">Evidence Manager</h1>
            </div>
            <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-muted">
              {version ?? '—'}
            </span>
          </div>

          <nav
            aria-label="Workspace sections"
            className="mt-8 flex flex-col gap-1 max-lg:grid max-lg:grid-cols-5 max-lg:gap-2"
          >
            {TABS.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <button
                  aria-current={isActive ? 'page' : undefined}
                  className={`rounded-md px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    isActive
                      ? 'bg-accent text-[oklch(0.985_0.006_120)]'
                      : 'text-muted hover:bg-surface hover:text-ink'
                  }`}
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  type="button"
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="flex min-w-0 flex-col">
          <header className="border-b border-line bg-surface px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted">{eyebrow}</p>
                <h2 className="mt-1 text-2xl font-semibold">{currentTab.title}</h2>
              </div>
              <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-medium text-muted">
                {isLoading ? 'Loading' : 'Local database'}
              </span>
            </div>
          </header>

          <section className="flex-1 px-6 py-5">{children}</section>
        </main>
      </div>
    </div>
  );
}
