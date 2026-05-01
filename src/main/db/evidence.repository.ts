import { randomUUID } from 'node:crypto';

import { EVIDENCE_HASH_ALGORITHM } from '@shared/constants/hash';
import type {
  CreateEvidenceDateCandidateInput,
  CreateEvidenceItemInput,
  EvidenceDateCandidate,
  EvidenceGoodsServiceLink,
  EvidenceItem,
  UpdateEvidenceItemInput
} from '@shared/types/evidence';

import type { SqliteDatabase } from './database';
import { parseJsonRecord, stringifyJsonRecord } from './json';
import {
  normalizeNullableCurrencyCode,
  normalizeNullableIsoDate,
  normalizeNullableIsoTimestamp,
  normalizeNullableNonNegativeInteger,
  normalizeNullableNonNegativeNumber,
  normalizeNullableText,
  normalizeOptionalText,
  normalizeSha256Hash,
  normalizeTerritoryCodes,
  requireEvidenceDateCandidateSource,
  requireEvidenceTextExtractionStatus,
  requireEvidenceType,
  requireFileSizeBytes,
  requireIsoDate,
  requireNonEmpty
} from './validation';

type EvidenceItemRow = {
  id: string;
  case_id: string;
  evidence_type: EvidenceItem['evidenceType'];
  source_filename: string;
  stored_relative_path: string;
  file_hash: string;
  hash_algo: EvidenceItem['hashAlgo'];
  file_size_bytes: number;
  mime_type: string | null;
  date_of_use: string | null;
  territory: string;
  territories_json: string;
  mark_form_as_used: string;
  use_amount_value: number | null;
  use_amount_currency: string | null;
  use_units_count: number | null;
  notes: string;
  extracted_text: string | null;
  extracted_text_status: EvidenceItem['extractedTextStatus'];
  exif_json: string;
  file_created_at: string | null;
  file_modified_at: string | null;
  imported_at: string;
  created_at: string;
  updated_at: string;
};

function parseTerritoriesJson(value: string): string[] {
  if (!value || value.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim().toUpperCase())
      .filter((item) => /^[A-Z]{2}$/.test(item));
  } catch {
    return [];
  }
}

type EvidenceDateCandidateRow = {
  id: string;
  evidence_id: string;
  candidate_date: string;
  source: EvidenceDateCandidate['source'];
  raw_value: string;
  created_at: string;
};

type EvidenceGoodsServiceLinkRow = {
  evidence_id: string;
  goods_service_id: string;
  created_at: string;
};

function mapEvidenceItem(row: EvidenceItemRow): EvidenceItem {
  return {
    id: row.id,
    caseId: row.case_id,
    evidenceType: row.evidence_type,
    sourceFilename: row.source_filename,
    storedRelativePath: row.stored_relative_path,
    fileHash: row.file_hash,
    hashAlgo: row.hash_algo,
    fileSizeBytes: row.file_size_bytes,
    mimeType: row.mime_type,
    dateOfUse: row.date_of_use,
    territory: row.territory,
    territories: parseTerritoriesJson(row.territories_json),
    markFormAsUsed: row.mark_form_as_used,
    useAmountValue: row.use_amount_value,
    useAmountCurrency: row.use_amount_currency,
    useUnitsCount: row.use_units_count,
    notes: row.notes,
    extractedText: row.extracted_text,
    extractedTextStatus: row.extracted_text_status,
    exifJson: parseJsonRecord(row.exif_json),
    fileCreatedAt: row.file_created_at,
    fileModifiedAt: row.file_modified_at,
    importedAt: row.imported_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapEvidenceDateCandidate(row: EvidenceDateCandidateRow): EvidenceDateCandidate {
  return {
    id: row.id,
    evidenceId: row.evidence_id,
    candidateDate: row.candidate_date,
    source: row.source,
    rawValue: row.raw_value,
    createdAt: row.created_at
  };
}

function mapEvidenceGoodsServiceLink(row: EvidenceGoodsServiceLinkRow): EvidenceGoodsServiceLink {
  return {
    evidenceId: row.evidence_id,
    goodsServiceId: row.goods_service_id,
    createdAt: row.created_at
  };
}

export class EvidenceRepository {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly clock: () => Date = () => new Date()
  ) {}

  create(input: CreateEvidenceItemInput): EvidenceItem {
    const now = this.now();
    const importedAt = input.importedAt ? input.importedAt : now;
    const record = {
      id: input.id ?? randomUUID(),
      caseId: input.caseId,
      evidenceType: requireEvidenceType(input.evidenceType),
      sourceFilename: requireNonEmpty(input.sourceFilename, 'sourceFilename'),
      storedRelativePath: requireNonEmpty(input.storedRelativePath, 'storedRelativePath'),
      fileHash: normalizeSha256Hash(input.fileHash),
      hashAlgo: input.hashAlgo ?? EVIDENCE_HASH_ALGORITHM,
      fileSizeBytes: requireFileSizeBytes(input.fileSizeBytes),
      mimeType: normalizeNullableText(input.mimeType),
      dateOfUse: normalizeNullableIsoDate(input.dateOfUse, 'dateOfUse'),
      territory: normalizeOptionalText(input.territory),
      territoriesJson: JSON.stringify(normalizeTerritoryCodes(input.territories)),
      markFormAsUsed: normalizeOptionalText(input.markFormAsUsed),
      useAmountValue: normalizeNullableNonNegativeNumber(input.useAmountValue, 'useAmountValue'),
      useAmountCurrency: normalizeNullableCurrencyCode(input.useAmountCurrency),
      useUnitsCount: normalizeNullableNonNegativeInteger(input.useUnitsCount, 'useUnitsCount'),
      notes: normalizeOptionalText(input.notes),
      extractedText: input.extractedText ?? null,
      extractedTextStatus: requireEvidenceTextExtractionStatus(
        input.extractedTextStatus ?? 'pending'
      ),
      exifJson: stringifyJsonRecord(input.exifJson),
      fileCreatedAt: normalizeNullableIsoTimestamp(input.fileCreatedAt, 'fileCreatedAt'),
      fileModifiedAt: normalizeNullableIsoTimestamp(input.fileModifiedAt, 'fileModifiedAt'),
      importedAt,
      createdAt: now,
      updatedAt: now
    };

    if (record.hashAlgo !== EVIDENCE_HASH_ALGORITHM) {
      throw new Error('hashAlgo must be sha256.');
    }

    this.db
      .prepare(
        `
          INSERT INTO evidence_items (
            id,
            case_id,
            evidence_type,
            source_filename,
            stored_relative_path,
            file_hash,
            hash_algo,
            file_size_bytes,
            mime_type,
            date_of_use,
            territory,
            territories_json,
            mark_form_as_used,
            use_amount_value,
            use_amount_currency,
            use_units_count,
            notes,
            extracted_text,
            extracted_text_status,
            exif_json,
            file_created_at,
            file_modified_at,
            imported_at,
            created_at,
            updated_at
          )
          VALUES (
            @id,
            @caseId,
            @evidenceType,
            @sourceFilename,
            @storedRelativePath,
            @fileHash,
            @hashAlgo,
            @fileSizeBytes,
            @mimeType,
            @dateOfUse,
            @territory,
            @territoriesJson,
            @markFormAsUsed,
            @useAmountValue,
            @useAmountCurrency,
            @useUnitsCount,
            @notes,
            @extractedText,
            @extractedTextStatus,
            @exifJson,
            @fileCreatedAt,
            @fileModifiedAt,
            @importedAt,
            @createdAt,
            @updatedAt
          )
        `
      )
      .run(record);

    const saved = this.getById(record.id);

    if (!saved) {
      throw new Error('Evidence item was not saved.');
    }

    return saved;
  }

  update(id: string, input: UpdateEvidenceItemInput): EvidenceItem | null {
    const existing = this.getById(id);

    if (!existing) {
      return null;
    }

    const record = {
      id,
      evidenceType: requireEvidenceType(input.evidenceType),
      dateOfUse: normalizeNullableIsoDate(input.dateOfUse, 'dateOfUse'),
      territory: normalizeOptionalText(input.territory),
      territoriesJson: JSON.stringify(
        input.territories === undefined
          ? existing.territories
          : normalizeTerritoryCodes(input.territories)
      ),
      markFormAsUsed:
        input.markFormAsUsed === undefined
          ? existing.markFormAsUsed
          : normalizeOptionalText(input.markFormAsUsed),
      useAmountValue:
        input.useAmountValue === undefined
          ? existing.useAmountValue
          : normalizeNullableNonNegativeNumber(input.useAmountValue, 'useAmountValue'),
      useAmountCurrency:
        input.useAmountCurrency === undefined
          ? existing.useAmountCurrency
          : normalizeNullableCurrencyCode(input.useAmountCurrency),
      useUnitsCount:
        input.useUnitsCount === undefined
          ? existing.useUnitsCount
          : normalizeNullableNonNegativeInteger(input.useUnitsCount, 'useUnitsCount'),
      notes: normalizeOptionalText(input.notes),
      extractedText:
        input.extractedText === undefined ? existing.extractedText : input.extractedText,
      extractedTextStatus: requireEvidenceTextExtractionStatus(
        input.extractedTextStatus ?? existing.extractedTextStatus
      ),
      exifJson: stringifyJsonRecord(input.exifJson ?? existing.exifJson),
      fileCreatedAt:
        input.fileCreatedAt === undefined
          ? existing.fileCreatedAt
          : normalizeNullableIsoTimestamp(input.fileCreatedAt, 'fileCreatedAt'),
      fileModifiedAt:
        input.fileModifiedAt === undefined
          ? existing.fileModifiedAt
          : normalizeNullableIsoTimestamp(input.fileModifiedAt, 'fileModifiedAt'),
      updatedAt: this.now()
    };

    this.db
      .prepare(
        `
          UPDATE evidence_items
          SET
            evidence_type = @evidenceType,
            date_of_use = @dateOfUse,
            territory = @territory,
            territories_json = @territoriesJson,
            mark_form_as_used = @markFormAsUsed,
            use_amount_value = @useAmountValue,
            use_amount_currency = @useAmountCurrency,
            use_units_count = @useUnitsCount,
            notes = @notes,
            extracted_text = @extractedText,
            extracted_text_status = @extractedTextStatus,
            exif_json = @exifJson,
            file_created_at = @fileCreatedAt,
            file_modified_at = @fileModifiedAt,
            updated_at = @updatedAt
          WHERE id = @id
        `
      )
      .run(record);

    return this.getById(id);
  }

  getById(id: string): EvidenceItem | null {
    const row = this.db.prepare('SELECT * FROM evidence_items WHERE id = ?').get(id) as
      | EvidenceItemRow
      | undefined;

    return row ? mapEvidenceItem(row) : null;
  }

  getByHash(caseId: string, fileHash: string): EvidenceItem | null {
    const row = this.db
      .prepare(
        `
          SELECT *
          FROM evidence_items
          WHERE case_id = ? AND hash_algo = ? AND file_hash = ?
        `
      )
      .get(caseId, EVIDENCE_HASH_ALGORITHM, normalizeSha256Hash(fileHash)) as
      | EvidenceItemRow
      | undefined;

    return row ? mapEvidenceItem(row) : null;
  }

  listByCase(caseId: string): EvidenceItem[] {
    return this.db
      .prepare(
        `
          SELECT *
          FROM evidence_items
          WHERE case_id = ?
          ORDER BY date_of_use ASC NULLS LAST, imported_at ASC, source_filename ASC
        `
      )
      .all(caseId)
      .map((row) => mapEvidenceItem(row as EvidenceItemRow));
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM evidence_items WHERE id = ?').run(id);

    return result.changes > 0;
  }

  addDateCandidate(input: CreateEvidenceDateCandidateInput): EvidenceDateCandidate {
    const record: EvidenceDateCandidate = {
      id: input.id ?? randomUUID(),
      evidenceId: input.evidenceId,
      candidateDate: requireIsoDate(input.candidateDate, 'candidateDate'),
      source: requireEvidenceDateCandidateSource(input.source),
      rawValue: normalizeOptionalText(input.rawValue),
      createdAt: this.now()
    };

    this.db
      .prepare(
        `
          INSERT INTO evidence_date_candidates (
            id,
            evidence_id,
            candidate_date,
            source,
            raw_value,
            created_at
          )
          VALUES (
            @id,
            @evidenceId,
            @candidateDate,
            @source,
            @rawValue,
            @createdAt
          )
        `
      )
      .run(record);

    return record;
  }

  listDateCandidates(evidenceId: string): EvidenceDateCandidate[] {
    return this.db
      .prepare(
        `
          SELECT *
          FROM evidence_date_candidates
          WHERE evidence_id = ?
          ORDER BY candidate_date ASC, source ASC, raw_value ASC
        `
      )
      .all(evidenceId)
      .map((row) => mapEvidenceDateCandidate(row as EvidenceDateCandidateRow));
  }

  replaceGoodsServiceLinks(
    evidenceId: string,
    goodsServiceIds: readonly string[]
  ): EvidenceGoodsServiceLink[] {
    const replace = this.db.transaction(() => {
      this.db.prepare('DELETE FROM evidence_goods_services WHERE evidence_id = ?').run(evidenceId);

      const createdAt = this.now();
      const insert = this.db.prepare(
        `
          INSERT INTO evidence_goods_services (evidence_id, goods_service_id, created_at)
          VALUES (@evidenceId, @goodsServiceId, @createdAt)
        `
      );

      for (const goodsServiceId of goodsServiceIds) {
        insert.run({ evidenceId, goodsServiceId, createdAt });
      }

      return this.listGoodsServiceLinks(evidenceId);
    });

    return replace();
  }

  listGoodsServiceLinks(evidenceId: string): EvidenceGoodsServiceLink[] {
    return this.db
      .prepare(
        `
          SELECT *
          FROM evidence_goods_services
          WHERE evidence_id = ?
          ORDER BY goods_service_id ASC
        `
      )
      .all(evidenceId)
      .map((row) => mapEvidenceGoodsServiceLink(row as EvidenceGoodsServiceLinkRow));
  }

  private now(): string {
    return this.clock().toISOString();
  }
}
