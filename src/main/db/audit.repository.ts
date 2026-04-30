import { randomUUID } from 'node:crypto';

import type { AuditLogEntry, CreateAuditLogEntryInput } from '@shared/types/audit';

import type { SqliteDatabase } from './database';
import { parseJsonRecord, stringifyJsonRecord } from './json';
import {
  normalizeNullableText,
  requireAuditEntityType,
  requireAuditEventType,
  requireIsoTimestamp
} from './validation';

type AuditLogRow = {
  id: string;
  case_id: string | null;
  event_type: AuditLogEntry['eventType'];
  entity_type: AuditLogEntry['entityType'];
  entity_id: string | null;
  actor: AuditLogEntry['actor'];
  occurred_at: string;
  details_json: string;
};

function mapAuditLogEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    caseId: row.case_id,
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    actor: row.actor,
    occurredAt: row.occurred_at,
    details: parseJsonRecord(row.details_json)
  };
}

export class AuditRepository {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly clock: () => Date = () => new Date()
  ) {}

  append(input: CreateAuditLogEntryInput): AuditLogEntry {
    const occurredAt = input.occurredAt ?? this.now();
    requireIsoTimestamp(occurredAt, 'occurredAt');

    const record = {
      id: input.id ?? randomUUID(),
      caseId: normalizeNullableText(input.caseId),
      eventType: requireAuditEventType(input.eventType),
      entityType: requireAuditEntityType(input.entityType),
      entityId: normalizeNullableText(input.entityId),
      actor: input.actor ?? 'local-user',
      occurredAt,
      detailsJson: stringifyJsonRecord(input.details)
    };

    this.db
      .prepare(
        `
          INSERT INTO audit_log (
            id,
            case_id,
            event_type,
            entity_type,
            entity_id,
            actor,
            occurred_at,
            details_json
          )
          VALUES (
            @id,
            @caseId,
            @eventType,
            @entityType,
            @entityId,
            @actor,
            @occurredAt,
            @detailsJson
          )
        `
      )
      .run(record);

    return this.getById(record.id) as AuditLogEntry;
  }

  getById(id: string): AuditLogEntry | null {
    const row = this.db.prepare('SELECT * FROM audit_log WHERE id = ?').get(id) as
      | AuditLogRow
      | undefined;

    return row ? mapAuditLogEntry(row) : null;
  }

  listRecent(limit = 100): AuditLogEntry[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new Error('limit must be an integer between 1 and 500.');
    }

    return this.db
      .prepare(
        `
          SELECT *
          FROM audit_log
          ORDER BY occurred_at DESC, id DESC
          LIMIT ?
        `
      )
      .all(limit)
      .map((row) => mapAuditLogEntry(row as AuditLogRow));
  }

  listByCase(caseId: string, limit = 100): AuditLogEntry[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new Error('limit must be an integer between 1 and 500.');
    }

    return this.db
      .prepare(
        `
          SELECT *
          FROM audit_log
          WHERE case_id = ?
          ORDER BY occurred_at DESC, id DESC
          LIMIT ?
        `
      )
      .all(caseId, limit)
      .map((row) => mapAuditLogEntry(row as AuditLogRow));
  }

  private now(): string {
    return this.clock().toISOString();
  }
}
