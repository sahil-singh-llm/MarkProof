import { EVIDENCE_TYPES } from '@shared/types/evidence';
import type { EvidenceType, UpdateEvidenceReviewInput } from '@shared/types/evidence';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function readNullableDate(input: Record<string, unknown>, key: string): string | null | undefined {
  const value = input[key];

  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error(`${key} must be a string or null.`);
  }

  return value;
}

function readEvidenceType(input: Record<string, unknown>): EvidenceType {
  const value = input.evidenceType;

  if (typeof value !== 'string' || !EVIDENCE_TYPES.includes(value as EvidenceType)) {
    throw new Error('evidenceType is not supported.');
  }

  return value as EvidenceType;
}

function readGoodsServiceIds(input: Record<string, unknown>): string[] | undefined {
  const value = input.coveredGoodsServiceIds;

  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error('coveredGoodsServiceIds must be an array of strings.');
  }

  return value;
}

export function parseEvidenceId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Evidence id must be a non-empty string.');
  }

  return value;
}

export function parseUpdateEvidenceReviewInput(value: unknown): UpdateEvidenceReviewInput {
  if (!isRecord(value)) {
    throw new Error('Evidence review input must be an object.');
  }

  const dateOfUse = readNullableDate(value, 'dateOfUse');
  const territory = readOptionalString(value, 'territory');
  const coveredGoodsServiceIds = readGoodsServiceIds(value);
  const notes = readOptionalString(value, 'notes');
  const input: UpdateEvidenceReviewInput = {
    evidenceType: readEvidenceType(value)
  };

  if (dateOfUse !== undefined) {
    input.dateOfUse = dateOfUse;
  }

  if (territory !== undefined) {
    input.territory = territory;
  }

  if (coveredGoodsServiceIds !== undefined) {
    input.coveredGoodsServiceIds = coveredGoodsServiceIds;
  }

  if (notes !== undefined) {
    input.notes = notes;
  }

  return input;
}
