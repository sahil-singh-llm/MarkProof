export const TRADEMARK_JURISDICTIONS = ['DPMA', 'EUIPO', 'USPTO', 'OTHER'] as const;

export type TrademarkJurisdiction = (typeof TRADEMARK_JURISDICTIONS)[number];

export type TrademarkCase = {
  id: string;
  markName: string;
  ownerName: string;
  registrationNumber: string;
  jurisdiction: TrademarkJurisdiction;
  usePeriodFrom: string;
  usePeriodTo: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateTrademarkCaseInput = {
  id?: string;
  markName: string;
  ownerName: string;
  registrationNumber: string;
  jurisdiction: TrademarkJurisdiction;
  usePeriodFrom: string;
  usePeriodTo: string;
};

export type UpdateTrademarkCaseInput = {
  markName: string;
  ownerName: string;
  registrationNumber: string;
  jurisdiction: TrademarkJurisdiction;
  usePeriodFrom: string;
  usePeriodTo: string;
};

export type GoodsService = {
  id: string;
  caseId: string;
  niceClass: number | null;
  description: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type GoodsServiceDraft = {
  id?: string;
  niceClass?: number | null;
  description: string;
  sortOrder?: number;
};

export type CreateGoodsServiceInput = GoodsServiceDraft & {
  caseId: string;
};

export type UpdateGoodsServiceInput = Omit<GoodsServiceDraft, 'id'>;

export type TrademarkCaseRecord = {
  trademarkCase: TrademarkCase;
  goodsServices: GoodsService[];
};

export type CreateTrademarkCaseRecordInput = CreateTrademarkCaseInput & {
  goodsServices: GoodsServiceDraft[];
};

export type UpdateTrademarkCaseRecordInput = UpdateTrademarkCaseInput & {
  goodsServices: GoodsServiceDraft[];
};

export type DeleteTrademarkCaseResult = {
  deleted: boolean;
};
