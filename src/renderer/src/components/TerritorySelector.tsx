import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import {
  TERRITORY_ENTRIES,
  TERRITORY_REGIONS,
  isWellFormedTerritoryCode
} from '../../../shared/constants/territories';
import type { TerritoryEntry, TerritoryRegion } from '../../../shared/constants/territories';

type TerritorySelectorProps = {
  selected: readonly string[];
  onChange: (next: string[]) => void;
};

function groupByRegion(entries: readonly TerritoryEntry[]): Map<TerritoryRegion, TerritoryEntry[]> {
  const groups = new Map<TerritoryRegion, TerritoryEntry[]>();
  for (const region of TERRITORY_REGIONS) {
    groups.set(region, []);
  }
  for (const entry of entries) {
    groups.get(entry.region)?.push(entry);
  }
  return groups;
}

const REGION_LABELS: Record<TerritoryRegion, string> = {
  EU: 'European Union',
  EFTA: 'EFTA / EEA',
  Other: 'Other jurisdictions'
};

export function TerritorySelector({ selected, onChange }: TerritorySelectorProps): ReactElement {
  const [filter, setFilter] = useState('');

  const selectedSet = useMemo(
    () => new Set(selected.map((code) => code.toUpperCase())),
    [selected]
  );

  const filteredEntries = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (term.length === 0) return TERRITORY_ENTRIES;
    return TERRITORY_ENTRIES.filter(
      (entry) =>
        entry.code.toLowerCase().includes(term) || entry.name.toLowerCase().includes(term)
    );
  }, [filter]);

  const groups = useMemo(() => groupByRegion(filteredEntries), [filteredEntries]);

  // Codes that are selected but not in our curated list — render them as
  // chips at the top so they're visible and removable, even if we don't
  // know what country they refer to.
  const knownCodes = useMemo(
    () => new Set(TERRITORY_ENTRIES.map((entry) => entry.code)),
    []
  );
  const unknownSelected = selected
    .map((code) => code.toUpperCase())
    .filter((code) => isWellFormedTerritoryCode(code) && !knownCodes.has(code));

  function toggle(code: string): void {
    const upper = code.toUpperCase();
    if (selectedSet.has(upper)) {
      onChange(selected.filter((existing) => existing.toUpperCase() !== upper));
    } else {
      onChange([...selected, upper]);
    }
  }

  function clearAll(): void {
    onChange([]);
  }

  return (
    <div className="rounded-md border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-3 py-2">
        <input
          aria-label="Filter territories"
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-1.5 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accentSoft"
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter by code or country..."
          type="text"
          value={filter}
        />
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>{selected.length} selected</span>
          {selected.length > 0 && (
            <button
              className="rounded-md border border-line px-2 py-1 text-xs font-medium text-muted hover:bg-panel hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              onClick={clearAll}
              type="button"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {unknownSelected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2 text-xs">
          <span className="text-muted">Legacy codes:</span>
          {unknownSelected.map((code) => (
            <button
              aria-label={`Remove ${code}`}
              className="rounded-full border border-warning/45 bg-[oklch(0.965_0.035_82)] px-2 py-0.5 font-medium text-ink hover:border-danger/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              key={code}
              onClick={() => toggle(code)}
              type="button"
            >
              {code} ×
            </button>
          ))}
        </div>
      )}

      <div className="max-h-64 overflow-auto p-3">
        {TERRITORY_REGIONS.map((region) => {
          const entries = groups.get(region) ?? [];
          if (entries.length === 0) return null;

          return (
            <section className="mb-4 last:mb-0" key={region}>
              <h6 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                {REGION_LABELS[region]}
              </h6>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {entries.map((entry) => {
                  const isSelected = selectedSet.has(entry.code);
                  return (
                    <label
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors hover:bg-panel ${
                        isSelected
                          ? 'border-accent bg-accentSoft text-ink'
                          : 'border-line bg-surface text-muted'
                      }`}
                      key={entry.code}
                    >
                      <input
                        checked={isSelected}
                        className="h-3.5 w-3.5 accent-[oklch(var(--color-accent))]"
                        onChange={() => toggle(entry.code)}
                        type="checkbox"
                      />
                      <span className="font-mono font-semibold">{entry.code}</span>
                      <span className="truncate">{entry.name}</span>
                    </label>
                  );
                })}
              </div>
            </section>
          );
        })}
        {filteredEntries.length === 0 && (
          <p className="py-3 text-center text-xs text-muted">No territories match your filter.</p>
        )}
      </div>
    </div>
  );
}
