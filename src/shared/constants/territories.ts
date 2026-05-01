// Curated ISO 3166-1 alpha-2 codes most relevant for DE/EU trademark practice.
// EU members are listed first because territoriality questions for EUTMs turn
// on use across Union members (C-149/11 *Leno Merken*).

export type TerritoryRegion = 'EU' | 'EFTA' | 'Other';

export type TerritoryEntry = {
  code: string;
  name: string;
  region: TerritoryRegion;
};

export const TERRITORY_ENTRIES: readonly TerritoryEntry[] = [
  // EU members
  { code: 'AT', name: 'Austria', region: 'EU' },
  { code: 'BE', name: 'Belgium', region: 'EU' },
  { code: 'BG', name: 'Bulgaria', region: 'EU' },
  { code: 'HR', name: 'Croatia', region: 'EU' },
  { code: 'CY', name: 'Cyprus', region: 'EU' },
  { code: 'CZ', name: 'Czechia', region: 'EU' },
  { code: 'DK', name: 'Denmark', region: 'EU' },
  { code: 'EE', name: 'Estonia', region: 'EU' },
  { code: 'FI', name: 'Finland', region: 'EU' },
  { code: 'FR', name: 'France', region: 'EU' },
  { code: 'DE', name: 'Germany', region: 'EU' },
  { code: 'GR', name: 'Greece', region: 'EU' },
  { code: 'HU', name: 'Hungary', region: 'EU' },
  { code: 'IE', name: 'Ireland', region: 'EU' },
  { code: 'IT', name: 'Italy', region: 'EU' },
  { code: 'LV', name: 'Latvia', region: 'EU' },
  { code: 'LT', name: 'Lithuania', region: 'EU' },
  { code: 'LU', name: 'Luxembourg', region: 'EU' },
  { code: 'MT', name: 'Malta', region: 'EU' },
  { code: 'NL', name: 'Netherlands', region: 'EU' },
  { code: 'PL', name: 'Poland', region: 'EU' },
  { code: 'PT', name: 'Portugal', region: 'EU' },
  { code: 'RO', name: 'Romania', region: 'EU' },
  { code: 'SK', name: 'Slovakia', region: 'EU' },
  { code: 'SI', name: 'Slovenia', region: 'EU' },
  { code: 'ES', name: 'Spain', region: 'EU' },
  { code: 'SE', name: 'Sweden', region: 'EU' },
  // EFTA / EEA
  { code: 'CH', name: 'Switzerland', region: 'EFTA' },
  { code: 'IS', name: 'Iceland', region: 'EFTA' },
  { code: 'LI', name: 'Liechtenstein', region: 'EFTA' },
  { code: 'NO', name: 'Norway', region: 'EFTA' },
  // Other commonly designated jurisdictions
  { code: 'GB', name: 'United Kingdom', region: 'Other' },
  { code: 'US', name: 'United States', region: 'Other' },
  { code: 'CA', name: 'Canada', region: 'Other' },
  { code: 'JP', name: 'Japan', region: 'Other' },
  { code: 'CN', name: 'China', region: 'Other' },
  { code: 'KR', name: 'South Korea', region: 'Other' },
  { code: 'AU', name: 'Australia', region: 'Other' },
  { code: 'TR', name: 'Türkiye', region: 'Other' },
  { code: 'BR', name: 'Brazil', region: 'Other' },
  { code: 'IN', name: 'India', region: 'Other' },
  { code: 'AE', name: 'United Arab Emirates', region: 'Other' }
] as const;

export const TERRITORY_REGIONS: readonly TerritoryRegion[] = ['EU', 'EFTA', 'Other'];

const TERRITORY_BY_CODE = new Map(TERRITORY_ENTRIES.map((entry) => [entry.code, entry]));

export function lookupTerritory(code: string): TerritoryEntry | null {
  return TERRITORY_BY_CODE.get(code) ?? null;
}

export const TERRITORY_CODE_PATTERN = /^[A-Z]{2}$/;

export function isWellFormedTerritoryCode(code: string): boolean {
  return TERRITORY_CODE_PATTERN.test(code);
}
