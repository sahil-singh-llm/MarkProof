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
