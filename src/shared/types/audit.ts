export const AUDIT_EVENT_TYPES = [
  'case_created',
  'case_updated',
  'case_deleted',
  'goods_service_created',
  'goods_service_updated',
  'goods_service_deleted',
  'evidence_imported',
  'evidence_updated',
  'evidence_deleted',
  'evidence_viewed',
  'bundle_exported',
  'audit_viewed'
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export const AUDIT_ENTITY_TYPES = [
  'case',
  'goods_service',
  'evidence',
  'bundle',
  'audit_log',
  'system'
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export type AuditActor = 'local-user' | 'system';

export type AuditLogEntry = {
  id: string;
  caseId: string | null;
  eventType: AuditEventType;
  entityType: AuditEntityType;
  entityId: string | null;
  actor: AuditActor;
  occurredAt: string;
  details: Record<string, unknown>;
};

export type CreateAuditLogEntryInput = {
  id?: string;
  caseId?: string | null;
  eventType: AuditEventType;
  entityType: AuditEntityType;
  entityId?: string | null;
  actor?: AuditActor;
  occurredAt?: string;
  details?: Record<string, unknown>;
};
