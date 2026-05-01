import type { ReactElement } from 'react';

import type { AppInfo } from '../../../shared/types/app';

const navItems = ['Cases', 'Evidence', 'Coverage', 'Timeline', 'Export', 'Audit'];

type AppShellProps = {
  appInfo: AppInfo | null;
  children: ReactElement;
  eyebrow: string;
  isLoading: boolean;
  title: string;
};

export function AppShell({
  appInfo,
  children,
  eyebrow,
  isLoading,
  title
}: AppShellProps): ReactElement {
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
              {appInfo?.version ?? '0.1.0'}
            </span>
          </div>

          <nav className="mt-8 flex flex-col gap-1 max-lg:grid max-lg:grid-cols-3">
            {navItems.map((item, index) => (
              <button
                key={item}
                className={`rounded-md px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  index === 0
                    ? 'bg-accent text-[oklch(0.985_0.006_120)]'
                    : 'text-muted hover:bg-surface hover:text-ink'
                }`}
                type="button"
                disabled={index !== 0}
              >
                {item}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex min-w-0 flex-col">
          <header className="border-b border-line bg-surface px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted">{eyebrow}</p>
                <h2 className="mt-1 text-2xl font-semibold">{title}</h2>
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
