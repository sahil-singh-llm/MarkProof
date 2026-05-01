import {
  CURRENCY_CODE_PATTERN,
  isWellFormedCurrencyCode
} from '@shared/constants/currencies';
import {
  TERRITORY_CODE_PATTERN,
  isWellFormedTerritoryCode
} from '@shared/constants/territories';
import { AUDIT_ENTITY_TYPES, AUDIT_EVENT_TYPES } from '@shared/types/audit';
import { TRADEMARK_JURISDICTIONS } from '@shared/types/case';
import {
  EVIDENCE_DATE_CANDIDATE_SOURCES,
  EVIDENCE_TEXT_EXTRACTION_STATUSES,
  EVIDENCE_TYPES
} from '@shared/types/evidence';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T/;
const SHA_256_PATTERN = /^[a-f0-9]{64}$/;

export const TEXT_FIELD_MAX_LENGTH = 1000;
export const DESCRIPTION_MAX_LENGTH = 4000;
export const LONG_TEXT_MAX_LENGTH = 200_000;

export function requireNonEmpty(
  value: string,
  fieldName: string,
  maxLength: number = TEXT_FIELD_MAX_LENGTH
): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`${fieldName} must not be empty.`);
  }

  if (normalized.length > maxLength) {
    throw new Error(`${fieldName} must be at most ${maxLength} characters.`);
  }

  return normalized;
}

export function normalizeOptionalText(
  value: string | undefined,
  maxLength: number = TEXT_FIELD_MAX_LENGTH
): string {
  const normalized = value?.trim() ?? '';

  if (normalized.length > maxLength) {
    throw new Error(`Value must be at most ${maxLength} characters.`);
  }

  return normalized;
}

export function normalizeNullableText(
  value: string | null | undefined,
  maxLength: number = TEXT_FIELD_MAX_LENGTH
): string | null {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  if (normalized.length > maxLength) {
    throw new Error(`Value must be at most ${maxLength} characters.`);
  }

  return normalized;
}

export function requireIsoDate(value: string, fieldName: string): string {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD format.`);
  }

  return value;
}

export function normalizeNullableIsoDate(
  value: string | null | undefined,
  fieldName: string
): string | null {
  if (value === null || value === undefined || value.trim().length === 0) {
    return null;
  }

  return requireIsoDate(value.trim(), fieldName);
}

export function requireIsoTimestamp(value: string, fieldName: string): string {
  if (!ISO_TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${fieldName} must be an ISO timestamp.`);
  }

  return value;
}

export function normalizeNullableIsoTimestamp(
  value: string | null | undefined,
  fieldName: string
): string | null {
  if (value === null || value === undefined || value.trim().length === 0) {
    return null;
  }

  return requireIsoTimestamp(value.trim(), fieldName);
}

export function requireUsePeriodOrder(usePeriodFrom: string, usePeriodTo: string): void {
  if (usePeriodFrom > usePeriodTo) {
    throw new Error('usePeriodFrom must be before or equal to usePeriodTo.');
  }
}

export function normalizeNiceClass(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isInteger(value) || value < 1 || value > 45) {
    throw new Error('niceClass must be an integer between 1 and 45.');
  }

  return value;
}

export function normalizeSortOrder(value: number | undefined): number {
  if (value === undefined) {
    return 0;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new Error('sortOrder must be a non-negative integer.');
  }

  return value;
}

export function requireFileSizeBytes(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('fileSizeBytes must be a non-negative integer.');
  }

  return value;
}

export function normalizeSha256Hash(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (!SHA_256_PATTERN.test(normalized)) {
    throw new Error('fileHash must be a lowercase SHA-256 hex digest.');
  }

  return normalized;
}

export function requireKnownValue<T extends string>(
  value: string,
  allowedValues: readonly T[],
  fieldName: string
): T {
  if (!allowedValues.includes(value as T)) {
    throw new Error(`${fieldName} is not supported.`);
  }

  return value as T;
}

export function requireTrademarkJurisdiction(value: string) {
  return requireKnownValue(value, TRADEMARK_JURISDICTIONS, 'jurisdiction');
}

export function requireEvidenceType(value: string) {
  return requireKnownValue(value, EVIDENCE_TYPES, 'evidenceType');
}

export function requireEvidenceTextExtractionStatus(value: string) {
  return requireKnownValue(value, EVIDENCE_TEXT_EXTRACTION_STATUSES, 'extractedTextStatus');
}

export function requireEvidenceDateCandidateSource(value: string) {
  return requireKnownValue(value, EVIDENCE_DATE_CANDIDATE_SOURCES, 'source');
}

export function requireAuditEventType(value: string) {
  return requireKnownValue(value, AUDIT_EVENT_TYPES, 'eventType');
}

export function requireAuditEntityType(value: string) {
  return requireKnownValue(value, AUDIT_ENTITY_TYPES, 'entityType');
}

export function normalizeTerritoryCodes(value: readonly string[] | undefined): string[] {
  if (value === undefined) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of value) {
    if (typeof raw !== 'string') {
      throw new Error('territories must be an array of strings.');
    }

    const code = raw.trim().toUpperCase();
    if (!isWellFormedTerritoryCode(code)) {
      throw new Error(
        `territories must contain ISO 3166-1 alpha-2 codes; got "${raw}". Pattern: ${TERRITORY_CODE_PATTERN}.`
      );
    }
    if (seen.has(code)) {
      continue;
    }
    seen.add(code);
    result.push(code);
  }

  return result;
}

export function normalizeNullableCurrencyCode(
  value: string | null | undefined
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const code = trimmed.toUpperCase();
  if (!isWellFormedCurrencyCode(code)) {
    throw new Error(
      `useAmountCurrency must be an ISO 4217 code; got "${value}". Pattern: ${CURRENCY_CODE_PATTERN}.`
    );
  }
  return code;
}

export function normalizeNullableNonNegativeNumber(
  value: number | null | undefined,
  fieldName: string
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative finite number.`);
  }
  return value;
}

export function normalizeNullableNonNegativeInteger(
  value: number | null | undefined,
  fieldName: string
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }
  return value;
}
