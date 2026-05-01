export const MIGRATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );
`;

export const INITIAL_SCHEMA_SQL = `
  CREATE TABLE trademark_cases (
    id TEXT PRIMARY KEY,
    mark_name TEXT NOT NULL CHECK (length(trim(mark_name)) > 0),
    owner_name TEXT NOT NULL CHECK (length(trim(owner_name)) > 0),
    registration_number TEXT NOT NULL CHECK (length(trim(registration_number)) > 0),
    jurisdiction TEXT NOT NULL CHECK (jurisdiction IN ('DPMA', 'EUIPO', 'WIPO_MADRID', 'OTHER')),
    use_period_from TEXT NOT NULL CHECK (length(use_period_from) = 10),
    use_period_to TEXT NOT NULL CHECK (length(use_period_to) = 10),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (use_period_from <= use_period_to)
  );

  CREATE TABLE goods_services (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    nice_class INTEGER CHECK (nice_class IS NULL OR (nice_class BETWEEN 1 AND 45)),
    description TEXT NOT NULL CHECK (length(trim(description)) > 0),
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (case_id) REFERENCES trademark_cases(id) ON DELETE CASCADE
  );

  CREATE INDEX idx_goods_services_case_id ON goods_services(case_id);
  CREATE INDEX idx_goods_services_case_order ON goods_services(case_id, sort_order, nice_class);

  CREATE TABLE evidence_items (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    evidence_type TEXT NOT NULL CHECK (
      evidence_type IN ('invoice', 'screenshot', 'photo', 'catalogue', 'ad', 'other')
    ),
    source_filename TEXT NOT NULL CHECK (length(trim(source_filename)) > 0),
    stored_relative_path TEXT NOT NULL CHECK (length(trim(stored_relative_path)) > 0),
    file_hash TEXT NOT NULL CHECK (length(file_hash) = 64),
    hash_algo TEXT NOT NULL DEFAULT 'sha256' CHECK (hash_algo = 'sha256'),
    file_size_bytes INTEGER NOT NULL CHECK (file_size_bytes >= 0),
    mime_type TEXT,
    date_of_use TEXT CHECK (date_of_use IS NULL OR length(date_of_use) = 10),
    territory TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    extracted_text TEXT,
    extracted_text_status TEXT NOT NULL DEFAULT 'pending' CHECK (
      extracted_text_status IN ('pending', 'completed', 'failed', 'not_applicable')
    ),
    exif_json TEXT NOT NULL DEFAULT '{}',
    file_created_at TEXT,
    file_modified_at TEXT,
    imported_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (case_id) REFERENCES trademark_cases(id) ON DELETE CASCADE,
    UNIQUE (case_id, hash_algo, file_hash)
  );

  CREATE INDEX idx_evidence_items_case_id ON evidence_items(case_id);
  CREATE INDEX idx_evidence_items_date_of_use ON evidence_items(case_id, date_of_use);
  CREATE INDEX idx_evidence_items_type ON evidence_items(case_id, evidence_type);

  CREATE TABLE evidence_goods_services (
    evidence_id TEXT NOT NULL,
    goods_service_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (evidence_id, goods_service_id),
    FOREIGN KEY (evidence_id) REFERENCES evidence_items(id) ON DELETE CASCADE,
    FOREIGN KEY (goods_service_id) REFERENCES goods_services(id) ON DELETE CASCADE
  );

  CREATE INDEX idx_evidence_goods_services_goods ON evidence_goods_services(goods_service_id);

  CREATE TABLE evidence_date_candidates (
    id TEXT PRIMARY KEY,
    evidence_id TEXT NOT NULL,
    candidate_date TEXT NOT NULL CHECK (length(candidate_date) = 10),
    source TEXT NOT NULL CHECK (
      source IN ('pdf_text', 'exif', 'file_created', 'file_modified', 'manual')
    ),
    raw_value TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (evidence_id) REFERENCES evidence_items(id) ON DELETE CASCADE
  );

  CREATE INDEX idx_evidence_date_candidates_evidence_id
    ON evidence_date_candidates(evidence_id);

  CREATE TABLE audit_log (
    id TEXT PRIMARY KEY,
    case_id TEXT,
    event_type TEXT NOT NULL CHECK (
      event_type IN (
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
      )
    ),
    entity_type TEXT NOT NULL CHECK (
      entity_type IN ('case', 'goods_service', 'evidence', 'bundle', 'audit_log', 'system')
    ),
    entity_id TEXT,
    actor TEXT NOT NULL DEFAULT 'local-user' CHECK (actor IN ('local-user', 'system')),
    occurred_at TEXT NOT NULL,
    details_json TEXT NOT NULL DEFAULT '{}'
  );

  CREATE INDEX idx_audit_log_case_id ON audit_log(case_id, occurred_at);
  CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
  CREATE INDEX idx_audit_log_event_type ON audit_log(event_type);
`;
