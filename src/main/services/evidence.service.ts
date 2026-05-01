import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import type {
  DeleteEvidenceResult,
  EvidenceImportResult,
  EvidenceItem,
  EvidenceRecord,
  EvidenceType,
  UpdateEvidenceReviewInput
} from '@shared/types/evidence';

import { AuditRepository } from '../db/audit.repository';
import { CasesRepository } from '../db/cases.repository';
import type { SqliteDatabase } from '../db/database';
import { EvidenceRepository } from '../db/evidence.repository';
import { LONG_TEXT_MAX_LENGTH } from '../db/validation';
import {
  buildFileDateCandidate,
  extractDateCandidatesFromExif,
  extractDateCandidatesFromText
} from '../parsing/dates';
import type { ExtractedDateCandidate } from '../parsing/dates';
import { EvidenceStorageError, EvidenceStorageService } from './storage.service';
import type { StoredEvidenceFile } from './storage.service';

type ExtractedEvidenceMetadata = {
  extractedText: string | null;
  extractedTextStatus: EvidenceItem['extractedTextStatus'];
  exifJson: Record<string, unknown>;
  dateCandidates: ExtractedDateCandidate[];
};

type PdfParseConstructor = new (options: { data: Uint8Array }) => {
  getText: () => Promise<{ text?: string }>;
  destroy?: () => Promise<void> | void;
};

type PdfParseClass = PdfParseConstructor & {
  setWorker?: (workerSrc?: string) => string;
};

type PdfParseWorkerModule = {
  getData?: () => string;
  getPath?: () => string;
};

let pdfWorkerConfigured = false;

async function configurePdfWorker(PDFParse: PdfParseClass): Promise<void> {
  if (pdfWorkerConfigured) {
    return;
  }

  pdfWorkerConfigured = true;

  try {
    const workerModule = (await import('pdf-parse/worker')) as PdfParseWorkerModule;
    const workerSource =
      typeof workerModule.getData === 'function'
        ? workerModule.getData()
        : workerModule.getPath?.();

    if (workerSource) {
      PDFParse.setWorker?.(workerSource);
    }
  } catch (error) {
    console.warn('[evidence] pdf worker setup failed:', error);
  }
}

function isSqliteUniqueConstraintError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

export class EvidenceService {
  private readonly auditRepository: AuditRepository;
  private readonly casesRepository: CasesRepository;
  private readonly evidenceRepository: EvidenceRepository;

  constructor(
    private readonly db: SqliteDatabase,
    private readonly storage = new EvidenceStorageService()
  ) {
    this.auditRepository = new AuditRepository(db);
    this.casesRepository = new CasesRepository(db);
    this.evidenceRepository = new EvidenceRepository(db);
  }

  listByCase(caseId: string): EvidenceRecord[] {
    return this.evidenceRepository.listByCase(caseId).map((evidence) => this.toRecord(evidence));
  }

  async importFiles(
    caseId: string,
    sourcePaths: readonly string[]
  ): Promise<EvidenceImportResult[]> {
    if (!this.casesRepository.getById(caseId)) {
      return sourcePaths.map((sourcePath) => ({
        status: 'rejected',
        sourceFilename: basename(sourcePath),
        reason: 'invalid_case',
        message: 'The selected case no longer exists.'
      }));
    }

    const results: EvidenceImportResult[] = [];

    for (const sourcePath of sourcePaths) {
      results.push(await this.importOne(caseId, sourcePath));
    }

    return results;
  }

  async update(id: string, input: UpdateEvidenceReviewInput): Promise<EvidenceRecord | null> {
    const existing = this.evidenceRepository.getById(id);

    if (!existing) {
      return null;
    }

    const goodsServiceIds = input.coveredGoodsServiceIds ?? undefined;

    if (goodsServiceIds) {
      this.assertGoodsServicesBelongToCase(existing.caseId, goodsServiceIds);
    }

    const updateEvidence = this.db.transaction(() => {
      const previousGoodsServiceIds = this.evidenceRepository
        .listGoodsServiceLinks(id)
        .map((link) => link.goodsServiceId);
      const updated = this.evidenceRepository.update(id, {
        evidenceType: input.evidenceType,
        dateOfUse: input.dateOfUse === undefined ? existing.dateOfUse : input.dateOfUse,
        territory: input.territory === undefined ? existing.territory : input.territory,
        notes: input.notes === undefined ? existing.notes : input.notes
      });

      if (!updated) {
        return null;
      }

      if (goodsServiceIds) {
        this.evidenceRepository.replaceGoodsServiceLinks(id, goodsServiceIds);
      }

      this.auditRepository.append({
        caseId: existing.caseId,
        eventType: 'evidence_updated',
        entityType: 'evidence',
        entityId: id,
        details: {
          sourceFilename: existing.sourceFilename,
          previousEvidenceType: existing.evidenceType,
          evidenceType: updated.evidenceType,
          previousDateOfUse: existing.dateOfUse,
          dateOfUse: updated.dateOfUse,
          previousTerritory: existing.territory,
          territory: updated.territory,
          notesChanged: existing.notes !== updated.notes,
          coveredGoodsServicesChanged: goodsServiceIds !== undefined,
          previousCoveredGoodsServicesCount: previousGoodsServiceIds.length,
          coveredGoodsServicesCount:
            goodsServiceIds === undefined ? previousGoodsServiceIds.length : goodsServiceIds.length
        }
      });

      return this.toRecord(updated);
    });

    return updateEvidence();
  }

  async delete(id: string): Promise<DeleteEvidenceResult> {
    const existing = this.evidenceRepository.getById(id);

    if (!existing) {
      return { deleted: false };
    }

    const deleteEvidence = this.db.transaction(() => {
      const deleted = this.evidenceRepository.delete(id);

      if (deleted) {
        this.auditRepository.append({
          caseId: existing.caseId,
          eventType: 'evidence_deleted',
          entityType: 'evidence',
          entityId: id,
          details: {
            sourceFilename: existing.sourceFilename,
            fileHash: existing.fileHash
          }
        });
      }

      return { deleted };
    });

    const result = deleteEvidence();

    if (result.deleted) {
      await this.storage.deleteStoredFile(existing.storedRelativePath).catch((error) => {
        console.error('[evidence] failed to delete stored file:', error);
      });
    }

    return result;
  }

  private async importOne(caseId: string, sourcePath: string): Promise<EvidenceImportResult> {
    let storedFile: StoredEvidenceFile;

    try {
      storedFile = await this.storage.storeFile(caseId, sourcePath);
    } catch (error) {
      if (error instanceof EvidenceStorageError) {
        return {
          status: 'rejected',
          sourceFilename: basename(sourcePath),
          reason: error.reason,
          message: error.message
        };
      }

      return {
        status: 'rejected',
        sourceFilename: basename(sourcePath),
        reason: 'copy_failed',
        message: 'The selected file could not be imported.'
      };
    }

    const duplicate = this.evidenceRepository.getByHash(caseId, storedFile.sha256);

    if (duplicate) {
      return {
        status: 'duplicate',
        sourceFilename: storedFile.sourceFilename,
        evidence: this.toRecord(duplicate)
      };
    }

    const metadata = await this.extractMetadata(storedFile);
    const createEvidence = this.db.transaction(() => {
      const evidence = this.evidenceRepository.create({
        id: randomUUID(),
        caseId,
        evidenceType: this.defaultEvidenceType(storedFile),
        sourceFilename: storedFile.sourceFilename,
        storedRelativePath: storedFile.storedRelativePath,
        fileHash: storedFile.sha256,
        fileSizeBytes: storedFile.fileSizeBytes,
        mimeType: storedFile.mimeType,
        extractedText: metadata.extractedText,
        extractedTextStatus: metadata.extractedTextStatus,
        exifJson: metadata.exifJson,
        fileCreatedAt: storedFile.fileCreatedAt,
        fileModifiedAt: storedFile.fileModifiedAt
      });

      for (const candidate of metadata.dateCandidates) {
        this.evidenceRepository.addDateCandidate({
          evidenceId: evidence.id,
          candidateDate: candidate.candidateDate,
          source: candidate.source,
          rawValue: candidate.rawValue
        });
      }

      this.auditRepository.append({
        caseId,
        eventType: 'evidence_imported',
        entityType: 'evidence',
        entityId: evidence.id,
        details: {
          sourceFilename: storedFile.sourceFilename,
          fileHash: storedFile.sha256,
          hashAlgo: 'sha256',
          fileSizeBytes: storedFile.fileSizeBytes,
          candidateDatesCount: metadata.dateCandidates.length
        }
      });

      return this.toRecord(evidence);
    });

    let evidenceRecord: EvidenceRecord;

    try {
      evidenceRecord = createEvidence();
    } catch (error) {
      if (isSqliteUniqueConstraintError(error)) {
        const duplicateAfterRace = this.evidenceRepository.getByHash(caseId, storedFile.sha256);

        if (duplicateAfterRace) {
          return {
            status: 'duplicate',
            sourceFilename: storedFile.sourceFilename,
            evidence: this.toRecord(duplicateAfterRace)
          };
        }
      }

      throw error;
    }

    return {
      status: 'imported',
      sourceFilename: storedFile.sourceFilename,
      evidence: evidenceRecord
    };
  }

  private async extractMetadata(
    storedFile: StoredEvidenceFile
  ): Promise<ExtractedEvidenceMetadata> {
    const fileCreatedCandidate = buildFileDateCandidate(storedFile.fileCreatedAt, 'file_created');
    const fileModifiedCandidate = buildFileDateCandidate(
      storedFile.fileModifiedAt,
      'file_modified'
    );
    const fileDateCandidates = [fileCreatedCandidate, fileModifiedCandidate].filter(
      (candidate): candidate is ExtractedDateCandidate => candidate !== null
    );

    if (storedFile.kind === 'pdf') {
      const pdfResult = await this.extractPdfText(storedFile.storedAbsolutePath);

      return {
        extractedText: pdfResult.text,
        extractedTextStatus: pdfResult.status,
        exifJson: {},
        dateCandidates: [
          ...extractDateCandidatesFromText(pdfResult.text ?? '', 'pdf_text'),
          ...fileDateCandidates
        ]
      };
    }

    const exifJson = await this.extractImageExif(storedFile.storedAbsolutePath);

    return {
      extractedText: null,
      extractedTextStatus: 'not_applicable',
      exifJson,
      dateCandidates: [...extractDateCandidatesFromExif(exifJson), ...fileDateCandidates]
    };
  }

  private async extractPdfText(
    storedAbsolutePath: string
  ): Promise<{ text: string | null; status: 'completed' | 'failed' }> {
    try {
      const [{ PDFParse }, fileBuffer] = await Promise.all([
        import('pdf-parse') as Promise<{ PDFParse: PdfParseClass }>,
        readFile(storedAbsolutePath)
      ]);
      await configurePdfWorker(PDFParse);
      const parser = new PDFParse({ data: new Uint8Array(fileBuffer) });

      try {
        const result = await parser.getText();
        const text = (result.text ?? '').slice(0, LONG_TEXT_MAX_LENGTH);

        return {
          text,
          status: 'completed'
        };
      } finally {
        await parser.destroy?.();
      }
    } catch (error) {
      console.warn('[evidence] pdf text extraction failed:', error);
      return {
        text: null,
        status: 'failed'
      };
    }
  }

  private async extractImageExif(storedAbsolutePath: string): Promise<Record<string, unknown>> {
    try {
      const exifr = await import('exifr');
      const metadata = (await exifr.parse(storedAbsolutePath)) as unknown;

      if (metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata)) {
        return metadata as Record<string, unknown>;
      }
    } catch (error) {
      console.warn('[evidence] image EXIF extraction failed:', error);
    }

    return {};
  }

  private assertGoodsServicesBelongToCase(
    caseId: string,
    goodsServiceIds: readonly string[]
  ): void {
    for (const goodsServiceId of goodsServiceIds) {
      const goodsService = this.casesRepository.getGoodsServiceById(goodsServiceId);

      if (!goodsService || goodsService.caseId !== caseId) {
        throw new Error('Covered goods/services must belong to the evidence case.');
      }
    }
  }

  private defaultEvidenceType(storedFile: StoredEvidenceFile): EvidenceType {
    return storedFile.kind === 'pdf' ? 'other' : 'photo';
  }

  private toRecord(evidence: EvidenceItem): EvidenceRecord {
    return {
      evidence,
      dateCandidates: this.evidenceRepository.listDateCandidates(evidence.id),
      goodsServiceLinks: this.evidenceRepository.listGoodsServiceLinks(evidence.id)
    };
  }
}
