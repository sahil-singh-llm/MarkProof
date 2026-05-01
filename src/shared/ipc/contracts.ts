import type { AppInfo } from '../types/app';
import type {
  CreateTrademarkCaseRecordInput,
  DeleteTrademarkCaseResult,
  TrademarkCaseRecord,
  UpdateTrademarkCaseRecordInput
} from '../types/case';
import type {
  DeleteEvidenceResult,
  EvidenceImportResult,
  EvidenceRecord,
  UpdateEvidenceReviewInput
} from '../types/evidence';

export type MarkProofApi = {
  app: {
    getInfo: () => Promise<AppInfo>;
  };
  cases: {
    list: () => Promise<TrademarkCaseRecord[]>;
    get: (id: string) => Promise<TrademarkCaseRecord | null>;
    create: (input: CreateTrademarkCaseRecordInput) => Promise<TrademarkCaseRecord>;
    update: (
      id: string,
      input: UpdateTrademarkCaseRecordInput
    ) => Promise<TrademarkCaseRecord | null>;
    delete: (id: string) => Promise<DeleteTrademarkCaseResult>;
  };
  evidence: {
    chooseAndImport: (caseId: string) => Promise<EvidenceImportResult[]>;
    listByCase: (caseId: string) => Promise<EvidenceRecord[]>;
    update: (id: string, input: UpdateEvidenceReviewInput) => Promise<EvidenceRecord | null>;
    delete: (id: string) => Promise<DeleteEvidenceResult>;
  };
};
