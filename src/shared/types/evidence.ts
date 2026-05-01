import type { EvidenceHashAlgorithm } from '../constants/hash';

export const EVIDENCE_TYPES = [
  'invoice',
  'screenshot',
  'photo',
  'catalogue',
  'ad',
  'other'
] as const;

export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const EVIDENCE_TEXT_EXTRACTION_STATUSES = [
  'pending',
  'completed',
  'failed',
  'not_applicable'
] as const;

export type EvidenceTextExtractionStatus = (typeof EVIDENCE_TEXT_EXTRACTION_STATUSES)[number];

export const EVIDENCE_DATE_CANDIDATE_SOURCES = [
  'pdf_text',
  'exif',
  'file_created',
  'file_modified',
  'manual'
] as const;

export type EvidenceDateCandidateSource = (typeof EVIDENCE_DATE_CANDIDATE_SOURCES)[number];

export type EvidenceItem = {
  id: string;
  caseId: string;
  evidenceType: EvidenceType;
  sourceFilename: string;
  storedRelativePath: string;
  fileHash: string;
  hashAlgo: EvidenceHashAlgorithm;
  fileSizeBytes: number;
  mimeType: string | null;
  dateOfUse: string | null;
  territory: string;
  territories: string[];
  markFormAsUsed: string;
  useAmountValue: number | null;
  useAmountCurrency: string | null;
  useUnitsCount: number | null;
  notes: string;
  extractedText: string | null;
  extractedTextStatus: EvidenceTextExtractionStatus;
  exifJson: Record<string, unknown>;
  fileCreatedAt: string | null;
  fileModifiedAt: string | null;
  importedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateEvidenceItemInput = {
  id?: string;
  caseId: string;
  evidenceType: EvidenceType;
  sourceFilename: string;
  storedRelativePath: string;
  fileHash: string;
  hashAlgo?: EvidenceHashAlgorithm;
  fileSizeBytes: number;
  mimeType?: string | null;
  dateOfUse?: string | null;
  territory?: string;
  territories?: readonly string[];
  markFormAsUsed?: string;
  useAmountValue?: number | null;
  useAmountCurrency?: string | null;
  useUnitsCount?: number | null;
  notes?: string;
  extractedText?: string | null;
  extractedTextStatus?: EvidenceTextExtractionStatus;
  exifJson?: Record<string, unknown>;
  fileCreatedAt?: string | null;
  fileModifiedAt?: string | null;
  importedAt?: string;
};

export type UpdateEvidenceItemInput = {
  evidenceType: EvidenceType;
  dateOfUse?: string | null;
  territory?: string;
  territories?: readonly string[];
  markFormAsUsed?: string;
  useAmountValue?: number | null;
  useAmountCurrency?: string | null;
  useUnitsCount?: number | null;
  notes?: string;
  extractedText?: string | null;
  extractedTextStatus?: EvidenceTextExtractionStatus;
  exifJson?: Record<string, unknown>;
  fileCreatedAt?: string | null;
  fileModifiedAt?: string | null;
};

export type EvidenceDateCandidate = {
  id: string;
  evidenceId: string;
  candidateDate: string;
  source: EvidenceDateCandidateSource;
  rawValue: string;
  createdAt: string;
};

export type CreateEvidenceDateCandidateInput = {
  id?: string;
  evidenceId: string;
  candidateDate: string;
  source: EvidenceDateCandidateSource;
  rawValue?: string;
};

export type EvidenceGoodsServiceLink = {
  evidenceId: string;
  goodsServiceId: string;
  createdAt: string;
};

export type EvidenceRecord = {
  evidence: EvidenceItem;
  dateCandidates: EvidenceDateCandidate[];
  goodsServiceLinks: EvidenceGoodsServiceLink[];
};

export const EVIDENCE_IMPORT_REJECTED_REASONS = [
  'unsupported_type',
  'too_large',
  'not_found',
  'read_failed',
  'copy_failed',
  'invalid_case'
] as const;

export type EvidenceImportRejectedReason = (typeof EVIDENCE_IMPORT_REJECTED_REASONS)[number];

export type EvidenceImportResult =
  | {
      status: 'imported';
      sourceFilename: string;
      evidence: EvidenceRecord;
    }
  | {
      status: 'duplicate';
      sourceFilename: string;
      evidence: EvidenceRecord;
    }
  | {
      status: 'rejected';
      sourceFilename: string;
      reason: EvidenceImportRejectedReason;
      message: string;
    };

export type UpdateEvidenceReviewInput = {
  evidenceType: EvidenceType;
  dateOfUse?: string | null;
  territory?: string;
  territories?: readonly string[];
  markFormAsUsed?: string;
  useAmountValue?: number | null;
  useAmountCurrency?: string | null;
  useUnitsCount?: number | null;
  coveredGoodsServiceIds?: string[];
  notes?: string;
};

export type DeleteEvidenceResult = {
  deleted: boolean;
};
