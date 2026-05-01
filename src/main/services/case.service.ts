import type {
  CreateTrademarkCaseRecordInput,
  DeleteTrademarkCaseResult,
  TrademarkCase,
  TrademarkCaseRecord,
  UpdateTrademarkCaseRecordInput
} from '@shared/types/case';

import { AuditRepository } from '../db/audit.repository';
import { CasesRepository } from '../db/cases.repository';
import type { SqliteDatabase } from '../db/database';

export class CaseService {
  private readonly auditRepository: AuditRepository;
  private readonly casesRepository: CasesRepository;

  constructor(private readonly db: SqliteDatabase) {
    this.auditRepository = new AuditRepository(db);
    this.casesRepository = new CasesRepository(db);
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
          previousMarkName: existing.markName,
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

    return updateCase();
  }

  delete(id: string): DeleteTrademarkCaseResult {
    const deleteCase = this.db.transaction(() => {
      const existing = this.casesRepository.getById(id);

      if (!existing) {
        return { deleted: false };
      }

      const goodsServicesCount = this.casesRepository.listGoodsServices(id).length;
      const deleted = this.casesRepository.delete(id);

      if (deleted) {
        this.auditRepository.append({
          caseId: id,
          eventType: 'case_deleted',
          entityType: 'case',
          entityId: id,
          details: {
            markName: existing.markName,
            registrationNumber: existing.registrationNumber,
            goodsServicesCount
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
}
