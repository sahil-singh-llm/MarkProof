import { IPC_CHANNELS } from './channels';
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
import type { PdfBundleExportResult } from '../types/export';

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
  bundle: {
    chooseAndExport: (caseId: string) => Promise<PdfBundleExportResult>;
  };
};

export type IpcChannelContract = {
  [IPC_CHANNELS.app.getInfo]: MarkProofApi['app']['getInfo'];
  [IPC_CHANNELS.cases.list]: MarkProofApi['cases']['list'];
  [IPC_CHANNELS.cases.get]: MarkProofApi['cases']['get'];
  [IPC_CHANNELS.cases.create]: MarkProofApi['cases']['create'];
  [IPC_CHANNELS.cases.update]: MarkProofApi['cases']['update'];
  [IPC_CHANNELS.cases.delete]: MarkProofApi['cases']['delete'];
  [IPC_CHANNELS.evidence.chooseAndImport]: MarkProofApi['evidence']['chooseAndImport'];
  [IPC_CHANNELS.evidence.listByCase]: MarkProofApi['evidence']['listByCase'];
  [IPC_CHANNELS.evidence.update]: MarkProofApi['evidence']['update'];
  [IPC_CHANNELS.evidence.delete]: MarkProofApi['evidence']['delete'];
  [IPC_CHANNELS.bundle.chooseAndExport]: MarkProofApi['bundle']['chooseAndExport'];
};
