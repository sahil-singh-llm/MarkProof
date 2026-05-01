import type { AppInfo } from '../types/app';
import type {
  CreateTrademarkCaseRecordInput,
  DeleteTrademarkCaseResult,
  TrademarkCaseRecord,
  UpdateTrademarkCaseRecordInput
} from '../types/case';

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
};
