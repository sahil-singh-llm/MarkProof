import type {
  CreateTrademarkCaseRecordInput,
  DeleteTrademarkCaseResult,
  GoodsService,
  TrademarkCase,
  TrademarkCaseRecord,
  UpdateTrademarkCaseRecordInput
} from '@shared/types/case';

import { AuditRepository } from '../db/audit.repository';
import { CasesRepository } from '../db/cases.repository';
import type { SqliteDatabase } from '../db/database';
import { EvidenceRepository } from '../db/evidence.repository';

const MAX_AUDITED_DELETED_EVIDENCE_ITEMS = 100;

type CaseAuditSnapshot = {
  id: string;
  markName: string;
  ownerName: string;
  registrationNumber: string;
  jurisdiction: TrademarkCase['jurisdiction'];
  usePeriodFrom: string;
  usePeriodTo: string;
  createdAt: string;
  updatedAt: string;
};

type GoodsServiceAuditSnapshot = {
  id: string;
  caseId: string;
  niceClass: number | null;
  description: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type GoodsServicesAuditDiff = {
  added: GoodsServiceAuditSnapshot[];
  removed: GoodsServiceAuditSnapshot[];
  updated: Array<{
    previous: GoodsServiceAuditSnapshot;
    current: GoodsServiceAuditSnapshot;
  }>;
};

export class CaseService {
  private readonly auditRepository: AuditRepository;
  private readonly casesRepository: CasesRepository;
  private readonly evidenceRepository: EvidenceRepository;

  constructor(private readonly db: SqliteDatabase) {
    this.auditRepository = new AuditRepository(db);
    this.casesRepository = new CasesRepository(db);
    this.evidenceRepository = new EvidenceRepository(db);
  }

  list(): TrademarkCaseRecord[] {
    return this.casesRepository.list().map((trademarkCase) => this.toRecord(trademarkCase));
  }

  get(id: string): TrademarkCaseRecord | null {
    const trademarkCase = this.casesRepository.getById(id);

    return trademarkCase ? this.toRecord(trademarkCase) : null;
  }

  create(input: CreateTrademarkCaseRecordInput): TrademarkCaseRecord {
    const createCase = this.db.transaction(() => {
      const trademarkCase = this.casesRepository.create(input);
      const goodsServices = this.casesRepository.replaceGoodsServices(
        trademarkCase.id,
        input.goodsServices
      );

      this.auditRepository.append({
        caseId: trademarkCase.id,
        eventType: 'case_created',
        entityType: 'case',
        entityId: trademarkCase.id,
        details: {
          caseSnapshot: this.toCaseAuditSnapshot(trademarkCase),
          goodsServices: goodsServices.map((item) => this.toGoodsServiceAuditSnapshot(item)),
          markName: trademarkCase.markName,
          registrationNumber: trademarkCase.registrationNumber,
          goodsServicesCount: goodsServices.length
        }
      });

      return {
        trademarkCase,
        goodsServices
      };
    });

    return createCase();
  }

  update(id: string, input: UpdateTrademarkCaseRecordInput): TrademarkCaseRecord | null {
    const updateCase = this.db.transaction(() => {
      const existing = this.casesRepository.getById(id);

      if (!existing) {
        return null;
      }

      const previousGoodsServices = this.casesRepository.listGoodsServices(id);
      const trademarkCase = this.casesRepository.update(id, input);

      if (!trademarkCase) {
        return null;
      }

      const goodsServices = this.casesRepository.replaceGoodsServices(id, input.goodsServices);

      this.auditRepository.append({
        caseId: id,
        eventType: 'case_updated',
        entityType: 'case',
        entityId: id,
        details: {
          previousCaseSnapshot: this.toCaseAuditSnapshot(existing),
          caseSnapshot: this.toCaseAuditSnapshot(trademarkCase),
          previousGoodsServices: previousGoodsServices.map((item) =>
            this.toGoodsServiceAuditSnapshot(item)
          ),
          goodsServices: goodsServices.map((item) => this.toGoodsServiceAuditSnapshot(item)),
          goodsServicesDiff: this.diffGoodsServices(previousGoodsServices, goodsServices),
          previousMarkName: existing.markName,
          markName: trademarkCase.markName,
          previousOwnerName: existing.ownerName,
          ownerName: trademarkCase.ownerName,
          previousRegistrationNumber: existing.registrationNumber,
          registrationNumber: trademarkCase.registrationNumber,
          previousJurisdiction: existing.jurisdiction,
          jurisdiction: trademarkCase.jurisdiction,
          previousUsePeriodFrom: existing.usePeriodFrom,
          usePeriodFrom: trademarkCase.usePeriodFrom,
          previousUsePeriodTo: existing.usePeriodTo,
          usePeriodTo: trademarkCase.usePeriodTo,
          goodsServicesCount: goodsServices.length
        }
      });

      return {
        trademarkCase,
        goodsServices
      };
    });

    return updateCase();
  }

  delete(id: string): DeleteTrademarkCaseResult {
    const deleteCase = this.db.transaction(() => {
      const existing = this.casesRepository.getById(id);

      if (!existing) {
        return { deleted: false };
      }

      const goodsServices = this.casesRepository.listGoodsServices(id);
      const goodsServicesCount = goodsServices.length;
      const evidenceItems = this.evidenceRepository.listByCase(id);
      const deleted = this.casesRepository.delete(id);

      if (deleted) {
        this.auditRepository.append({
          caseId: id,
          eventType: 'case_deleted',
          entityType: 'case',
          entityId: id,
          details: {
            caseSnapshot: this.toCaseAuditSnapshot(existing),
            goodsServices: goodsServices.map((item) => this.toGoodsServiceAuditSnapshot(item)),
            markName: existing.markName,
            registrationNumber: existing.registrationNumber,
            goodsServicesCount,
            evidenceItemsCount: evidenceItems.length,
            deletedEvidenceItems: evidenceItems
              .slice(0, MAX_AUDITED_DELETED_EVIDENCE_ITEMS)
              .map((evidence) => ({
                id: evidence.id,
                fileHash: evidence.fileHash
              })),
            deletedEvidenceItemsTruncated: evidenceItems.length > MAX_AUDITED_DELETED_EVIDENCE_ITEMS
          }
        });
      }

      return { deleted };
    });

    return deleteCase();
  }

  private toRecord(trademarkCase: TrademarkCase): TrademarkCaseRecord {
    return {
      trademarkCase,
      goodsServices: this.casesRepository.listGoodsServices(trademarkCase.id)
    };
  }

  private toCaseAuditSnapshot(trademarkCase: TrademarkCase): CaseAuditSnapshot {
    return {
      id: trademarkCase.id,
      markName: trademarkCase.markName,
      ownerName: trademarkCase.ownerName,
      registrationNumber: trademarkCase.registrationNumber,
      jurisdiction: trademarkCase.jurisdiction,
      usePeriodFrom: trademarkCase.usePeriodFrom,
      usePeriodTo: trademarkCase.usePeriodTo,
      createdAt: trademarkCase.createdAt,
      updatedAt: trademarkCase.updatedAt
    };
  }

  private toGoodsServiceAuditSnapshot(goodsService: GoodsService): GoodsServiceAuditSnapshot {
    return {
      id: goodsService.id,
      caseId: goodsService.caseId,
      niceClass: goodsService.niceClass,
      description: goodsService.description,
      sortOrder: goodsService.sortOrder,
      createdAt: goodsService.createdAt,
      updatedAt: goodsService.updatedAt
    };
  }

  private diffGoodsServices(
    previous: readonly GoodsService[],
    current: readonly GoodsService[]
  ): GoodsServicesAuditDiff {
    const previousById = new Map(previous.map((item) => [item.id, item]));
    const currentById = new Map(current.map((item) => [item.id, item]));

    return {
      added: current
        .filter((item) => !previousById.has(item.id))
        .map((item) => this.toGoodsServiceAuditSnapshot(item)),
      removed: previous
        .filter((item) => !currentById.has(item.id))
        .map((item) => this.toGoodsServiceAuditSnapshot(item)),
      updated: previous.flatMap((previousItem) => {
        const currentItem = currentById.get(previousItem.id);

        if (!currentItem || !this.hasGoodsServiceChanged(previousItem, currentItem)) {
          return [];
        }

        return [
          {
            previous: this.toGoodsServiceAuditSnapshot(previousItem),
            current: this.toGoodsServiceAuditSnapshot(currentItem)
          }
        ];
      })
    };
  }

  private hasGoodsServiceChanged(previous: GoodsService, current: GoodsService): boolean {
    return (
      previous.niceClass !== current.niceClass ||
      previous.description !== current.description ||
      previous.sortOrder !== current.sortOrder
    );
  }
}
