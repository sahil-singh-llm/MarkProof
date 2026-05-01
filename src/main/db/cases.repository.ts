import { randomUUID } from 'node:crypto';

import type {
  CreateGoodsServiceInput,
  CreateTrademarkCaseInput,
  GoodsService,
  GoodsServiceDraft,
  TrademarkCase,
  UpdateGoodsServiceInput,
  UpdateTrademarkCaseInput
} from '@shared/types/case';

import type { SqliteDatabase } from './database';
import {
  DESCRIPTION_MAX_LENGTH,
  normalizeNiceClass,
  normalizeSortOrder,
  requireIsoDate,
  requireNonEmpty,
  requireTrademarkJurisdiction,
  requireUsePeriodOrder
} from './validation';

type TrademarkCaseRow = {
  id: string;
  mark_name: string;
  owner_name: string;
  registration_number: string;
  jurisdiction: TrademarkCase['jurisdiction'];
  use_period_from: string;
  use_period_to: string;
  created_at: string;
  updated_at: string;
};

type GoodsServiceRow = {
  id: string;
  case_id: string;
  nice_class: number | null;
  description: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

function mapTrademarkCase(row: TrademarkCaseRow): TrademarkCase {
  return {
    id: row.id,
    markName: row.mark_name,
    ownerName: row.owner_name,
    registrationNumber: row.registration_number,
    jurisdiction: row.jurisdiction,
    usePeriodFrom: row.use_period_from,
    usePeriodTo: row.use_period_to,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapGoodsService(row: GoodsServiceRow): GoodsService {
  return {
    id: row.id,
    caseId: row.case_id,
    niceClass: row.nice_class,
    description: row.description,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class CasesRepository {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly clock: () => Date = () => new Date()
  ) {}

  create(input: CreateTrademarkCaseInput): TrademarkCase {
    const now = this.now();
    const normalized = this.normalizeCaseInput(input);
    const record: TrademarkCase = {
      ...normalized,
      id: input.id ?? randomUUID(),
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `
          INSERT INTO trademark_cases (
            id,
            mark_name,
            owner_name,
            registration_number,
            jurisdiction,
            use_period_from,
            use_period_to,
            created_at,
            updated_at
          )
          VALUES (
            @id,
            @markName,
            @ownerName,
            @registrationNumber,
            @jurisdiction,
            @usePeriodFrom,
            @usePeriodTo,
            @createdAt,
            @updatedAt
          )
        `
      )
      .run(record);

    return record;
  }

  update(id: string, input: UpdateTrademarkCaseInput): TrademarkCase | null {
    const existing = this.getById(id);

    if (!existing) {
      return null;
    }

    const normalized = this.normalizeCaseInput(input);
    const record: TrademarkCase = {
      ...existing,
      ...normalized,
      updatedAt: this.now()
    };

    this.db
      .prepare(
        `
          UPDATE trademark_cases
          SET
            mark_name = @markName,
            owner_name = @ownerName,
            registration_number = @registrationNumber,
            jurisdiction = @jurisdiction,
            use_period_from = @usePeriodFrom,
            use_period_to = @usePeriodTo,
            updated_at = @updatedAt
          WHERE id = @id
        `
      )
      .run(record);

    return record;
  }

  getById(id: string): TrademarkCase | null {
    const row = this.db.prepare('SELECT * FROM trademark_cases WHERE id = ?').get(id) as
      | TrademarkCaseRow
      | undefined;

    return row ? mapTrademarkCase(row) : null;
  }

  list(): TrademarkCase[] {
    return this.db
      .prepare('SELECT * FROM trademark_cases ORDER BY updated_at DESC, mark_name ASC')
      .all()
      .map((row) => mapTrademarkCase(row as TrademarkCaseRow));
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM trademark_cases WHERE id = ?').run(id);

    return result.changes > 0;
  }

  createGoodsService(input: CreateGoodsServiceInput): GoodsService {
    const now = this.now();
    const record: GoodsService = {
      id: input.id ?? randomUUID(),
      caseId: input.caseId,
      niceClass: normalizeNiceClass(input.niceClass),
      description: requireNonEmpty(input.description, 'description', DESCRIPTION_MAX_LENGTH),
      sortOrder: normalizeSortOrder(input.sortOrder),
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `
          INSERT INTO goods_services (
            id,
            case_id,
            nice_class,
            description,
            sort_order,
            created_at,
            updated_at
          )
          VALUES (
            @id,
            @caseId,
            @niceClass,
            @description,
            @sortOrder,
            @createdAt,
            @updatedAt
          )
        `
      )
      .run(record);

    return record;
  }

  updateGoodsService(id: string, input: UpdateGoodsServiceInput): GoodsService | null {
    const existing = this.getGoodsServiceById(id);

    if (!existing) {
      return null;
    }

    const record: GoodsService = {
      ...existing,
      niceClass: normalizeNiceClass(input.niceClass),
      description: requireNonEmpty(input.description, 'description', DESCRIPTION_MAX_LENGTH),
      sortOrder: normalizeSortOrder(input.sortOrder),
      updatedAt: this.now()
    };

    this.db
      .prepare(
        `
          UPDATE goods_services
          SET
            nice_class = @niceClass,
            description = @description,
            sort_order = @sortOrder,
            updated_at = @updatedAt
          WHERE id = @id
        `
      )
      .run(record);

    return record;
  }

  getGoodsServiceById(id: string): GoodsService | null {
    const row = this.db.prepare('SELECT * FROM goods_services WHERE id = ?').get(id) as
      | GoodsServiceRow
      | undefined;

    return row ? mapGoodsService(row) : null;
  }

  listGoodsServices(caseId: string): GoodsService[] {
    return this.db
      .prepare(
        `
          SELECT *
          FROM goods_services
          WHERE case_id = ?
          ORDER BY sort_order ASC, nice_class ASC, description ASC
        `
      )
      .all(caseId)
      .map((row) => mapGoodsService(row as GoodsServiceRow));
  }

  replaceGoodsServices(
    caseId: string,
    inputs: readonly GoodsServiceDraft[]
  ): GoodsService[] {
    const replace = this.db.transaction(() => {
      const existing = this.listGoodsServices(caseId);
      const existingIds = new Set(existing.map((item) => item.id));
      const retainedIds = new Set<string>();

      for (const input of inputs) {
        if (input.id !== undefined && existingIds.has(input.id)) {
          retainedIds.add(input.id);
        }
      }

      for (const item of existing) {
        if (!retainedIds.has(item.id)) {
          this.deleteGoodsService(item.id);
        }
      }

      return inputs.map((input, index) => {
        const sortOrder = input.sortOrder ?? index;

        if (input.id !== undefined && existingIds.has(input.id)) {
          const updated = this.updateGoodsService(input.id, {
            niceClass: input.niceClass ?? null,
            description: input.description,
            sortOrder
          });

          if (!updated) {
            throw new Error(`Failed to update goods service ${input.id}.`);
          }

          return updated;
        }

        return this.createGoodsService({
          ...input,
          caseId,
          sortOrder
        });
      });
    });

    return replace();
  }

  deleteGoodsService(id: string): boolean {
    const result = this.db.prepare('DELETE FROM goods_services WHERE id = ?').run(id);

    return result.changes > 0;
  }

  private normalizeCaseInput(input: CreateTrademarkCaseInput | UpdateTrademarkCaseInput) {
    const usePeriodFrom = requireIsoDate(input.usePeriodFrom, 'usePeriodFrom');
    const usePeriodTo = requireIsoDate(input.usePeriodTo, 'usePeriodTo');
    requireUsePeriodOrder(usePeriodFrom, usePeriodTo);

    return {
      markName: requireNonEmpty(input.markName, 'markName'),
      ownerName: requireNonEmpty(input.ownerName, 'ownerName'),
      registrationNumber: requireNonEmpty(input.registrationNumber, 'registrationNumber'),
      jurisdiction: requireTrademarkJurisdiction(input.jurisdiction),
      usePeriodFrom,
      usePeriodTo
    };
  }

  private now(): string {
    return this.clock().toISOString();
  }
}
