// Curated ISO 4217 currency codes — covers EU/EFTA, GB, US, plus the most
// frequent jurisdictions where DE/EU rights holders also enforce.

export type CurrencyEntry = {
  code: string;
  name: string;
};

export const CURRENCY_ENTRIES: readonly CurrencyEntry[] = [
  { code: 'EUR', name: 'Euro' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'SEK', name: 'Swedish Krona' },
  { code: 'NOK', name: 'Norwegian Krone' },
  { code: 'DKK', name: 'Danish Krone' },
  { code: 'PLN', name: 'Polish Złoty' },
  { code: 'CZK', name: 'Czech Koruna' },
  { code: 'HUF', name: 'Hungarian Forint' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'KRW', name: 'South Korean Won' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'TRY', name: 'Turkish Lira' },
  { code: 'BRL', name: 'Brazilian Real' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'AED', name: 'UAE Dirham' }
] as const;

const CURRENCY_BY_CODE = new Map(CURRENCY_ENTRIES.map((entry) => [entry.code, entry]));

export function lookupCurrency(code: string): CurrencyEntry | null {
  return CURRENCY_BY_CODE.get(code) ?? null;
}

export const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

export function isWellFormedCurrencyCode(code: string): boolean {
  return CURRENCY_CODE_PATTERN.test(code);
}
