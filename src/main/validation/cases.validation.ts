import type {
  CreateTrademarkCaseRecordInput,
  GoodsServiceDraft,
  TrademarkJurisdiction,
  UpdateTrademarkCaseRecordInput
} from '@shared/types/case';
import { TRADEMARK_JURISDICTIONS } from '@shared/types/case';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NICE_CLASS_MIN = 1;
const NICE_CLASS_MAX = 45;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireUuid(value: string, fieldName: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${fieldName} must be a UUID.`);
  }

  return value.toLowerCase();
}

function readString(input: Record<string, unknown>, key: string): string {
  const value = input[key];

  if (typeof value !== 'string') {
    throw new Error(`${key} must be a string.`);
  }

  return value;
}

function readNonEmptyString(input: Record<string, unknown>, key: string): string {
  const value = readString(input, key);

  if (value.trim().length === 0) {
    throw new Error(`${key} must not be empty.`);
  }

  return value;
}

function readJurisdiction(input: Record<string, unknown>): TrademarkJurisdiction {
  const value = readString(input, 'jurisdiction');

  if (!TRADEMARK_JURISDICTIONS.includes(value as TrademarkJurisdiction)) {
    throw new Error(`jurisdiction must be one of ${TRADEMARK_JURISDICTIONS.join(', ')}.`);
  }

  return value as TrademarkJurisdiction;
}

function readIsoDate(input: Record<string, unknown>, key: string): string {
  const value = readString(input, key);

  if (!ISO_DATE_PATTERN.test(value)) {
    throw new Error(`${key} must be an ISO date (YYYY-MM-DD).`);
  }

  return value;
}

function readOptionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`${key} must be a string.`);
  }

  return value;
}

function readOptionalNiceClass(
  input: Record<string, unknown>,
  key: string
): number | null | undefined {
  const value = input[key];

  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'number') {
    throw new Error(`${key} must be a number or null.`);
  }

  return value;
}

function readOptionalSortOrder(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number') {
    throw new Error(`${key} must be a number.`);
  }

  return value;
}

function parseGoodsServices(value: unknown): GoodsServiceDraft[] {
  if (!Array.isArray(value)) {
    throw new Error('goodsServices must be an array.');
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`goodsServices[${index}] must be an object.`);
    }

    const id = readOptionalString(item, 'id');
    const niceClass = readOptionalNiceClass(item, 'niceClass');
    const sortOrder = readOptionalSortOrder(item, 'sortOrder');
    const description = readString(item, 'description');

    if (description.trim().length === 0) {
      throw new Error(`goodsServices[${index}].description must not be empty.`);
    }

    if (
      niceClass !== undefined &&
      niceClass !== null &&
      (!Number.isInteger(niceClass) || niceClass < NICE_CLASS_MIN || niceClass > NICE_CLASS_MAX)
    ) {
      throw new Error(
        `goodsServices[${index}].niceClass must be an integer between ${NICE_CLASS_MIN} and ${NICE_CLASS_MAX}.`
      );
    }

    return {
      ...(id === undefined ? {} : { id: requireUuid(id, `goodsServices[${index}].id`) }),
      ...(niceClass === undefined ? {} : { niceClass }),
      description,
      ...(sortOrder === undefined ? {} : { sortOrder })
    };
  });
}

function parseBaseCaseInput(input: Record<string, unknown>) {
  const markName = readNonEmptyString(input, 'markName');
  const ownerName = readNonEmptyString(input, 'ownerName');
  const registrationNumber = readNonEmptyString(input, 'registrationNumber');
  const jurisdiction = readJurisdiction(input);
  const usePeriodFrom = readIsoDate(input, 'usePeriodFrom');
  const usePeriodTo = readIsoDate(input, 'usePeriodTo');

  if (usePeriodFrom > usePeriodTo) {
    throw new Error('usePeriodFrom must be on or before usePeriodTo.');
  }

  const goodsServices = parseGoodsServices(input.goodsServices);

  if (goodsServices.length === 0) {
    throw new Error('goodsServices must contain at least one entry.');
  }

  return {
    markName,
    ownerName,
    registrationNumber,
    jurisdiction,
    usePeriodFrom,
    usePeriodTo,
    goodsServices
  };
}

export function parseCaseId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Case id must be a non-empty string.');
  }

  return requireUuid(value, 'Case id');
}

export function parseCreateTrademarkCaseRecordInput(
  value: unknown
): CreateTrademarkCaseRecordInput {
  if (!isRecord(value)) {
    throw new Error('Case input must be an object.');
  }

  const id = readOptionalString(value, 'id');

  return {
    ...(id === undefined ? {} : { id: requireUuid(id, 'id') }),
    ...parseBaseCaseInput(value)
  };
}

export function parseUpdateTrademarkCaseRecordInput(
  value: unknown
): UpdateTrademarkCaseRecordInput {
  if (!isRecord(value)) {
    throw new Error('Case input must be an object.');
  }

  return parseBaseCaseInput(value);
}
