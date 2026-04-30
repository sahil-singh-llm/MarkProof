import type { ReactElement } from 'react';

import { LEGAL_DISCLAIMER } from '../../../shared/constants/disclaimer';
import type { AppInfo } from '../../../shared/types/app';
import { DisclaimerBanner } from './DisclaimerBanner';

const navItems = ['Cases', 'Evidence', 'Coverage', 'Timeline', 'Export', 'Audit'];

type AppShellProps = {
  appInfo: AppInfo | null;
  isLoading: boolean;
};

export function AppShell({ appInfo, isLoading }: AppShellProps): ReactElement {
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
                <p className="text-sm font-medium text-muted">Local workspace</p>
                <h2 className="mt-1 text-2xl font-semibold">Trademark Cases</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-md border border-line px-3 py-2 text-sm font-medium text-muted"
                  type="button"
                  disabled
                >
                  Import Evidence
                </button>
                <button
                  className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-[oklch(0.985_0.006_120)]"
                  type="button"
                  disabled
                >
                  New Case
                </button>
              </div>
            </div>
          </header>

          <section className="flex-1 px-6 py-5">
            <DisclaimerBanner text={appInfo?.disclaimer ?? LEGAL_DISCLAIMER} />

            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(22rem,0.6fr)]">
              <section className="rounded-lg border border-line bg-surface shadow-panel">
                <div className="border-b border-line px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold">Case Register</h3>
                      <p className="mt-1 text-sm text-muted">No cases stored in this workspace.</p>
                    </div>
                    <span className="rounded-full bg-accentSoft px-3 py-1 text-xs font-medium text-accent">
                      Local only
                    </span>
                  </div>
                </div>

                <div className="grid min-h-[26rem] place-items-center px-6 py-12">
                  <div className="max-w-md text-center">
                    <p className="text-sm font-semibold text-accent">Step 1 foundation</p>
                    <p className="mt-3 text-2xl font-semibold">Secure desktop shell ready</p>
                    <p className="mt-3 text-sm leading-6 text-muted">
                      Case data, evidence import, coverage, timeline, audit log, and export modules
                      are separated for the next implementation steps.
                    </p>
                  </div>
                </div>
              </section>

              <aside className="rounded-lg border border-line bg-surface shadow-panel">
                <div className="border-b border-line px-5 py-4">
                  <h3 className="text-base font-semibold">Runtime</h3>
                </div>

                <dl className="divide-y divide-line px-5 text-sm">
                  <div className="flex justify-between gap-4 py-3">
                    <dt className="text-muted">IPC</dt>
                    <dd className="font-medium">Typed preload API</dd>
                  </div>
                  <div className="flex justify-between gap-4 py-3">
                    <dt className="text-muted">Storage</dt>
                    <dd className="font-medium">Content addressed</dd>
                  </div>
                  <div className="flex justify-between gap-4 py-3">
                    <dt className="text-muted">Hash</dt>
                    <dd className="font-medium">{appInfo?.hashAlgorithm ?? 'sha256'}</dd>
                  </div>
                  <div className="flex justify-between gap-4 py-3">
                    <dt className="text-muted">Status</dt>
                    <dd className="font-medium">{isLoading ? 'Loading' : 'Ready'}</dd>
                  </div>
                </dl>
              </aside>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
