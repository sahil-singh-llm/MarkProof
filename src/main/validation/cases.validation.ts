import type {
  CreateTrademarkCaseRecordInput,
  GoodsServiceDraft,
  TrademarkJurisdiction,
  UpdateTrademarkCaseRecordInput
} from '@shared/types/case';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    return {
      ...(id === undefined ? {} : { id: requireUuid(id, `goodsServices[${index}].id`) }),
      ...(niceClass === undefined ? {} : { niceClass }),
      description: readString(item, 'description'),
      ...(sortOrder === undefined ? {} : { sortOrder })
    };
  });
}

function parseBaseCaseInput(input: Record<string, unknown>) {
  return {
    markName: readString(input, 'markName'),
    ownerName: readString(input, 'ownerName'),
    registrationNumber: readString(input, 'registrationNumber'),
    jurisdiction: readString(input, 'jurisdiction') as TrademarkJurisdiction,
    usePeriodFrom: readString(input, 'usePeriodFrom'),
    usePeriodTo: readString(input, 'usePeriodTo'),
    goodsServices: parseGoodsServices(input.goodsServices)
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
