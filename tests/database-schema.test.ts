import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';

import type { SqliteDatabase } from '../src/main/db/database';
import { configureDatabase, createInMemoryDatabase } from '../src/main/db/database';
import { applyMigrations } from '../src/main/db/migrations';

type TableRow = {
  name: string;
};

type ForeignKeysRow = {
  foreign_keys: number;
};

type ForeignKeyListRow = {
  table: string;
};

type TableInfoRow = {
  name: string;
  dflt_value: string | null;
};

type TrademarkCaseJurisdictionRow = {
  jurisdiction: string;
};

type MigrationVersionRow = {
  version: number;
};

describe('database schema', () => {
  let db: SqliteDatabase | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  it('applies the initial migration with core tables', () => {
    db = createInMemoryDatabase();

    const tables = db
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
          ORDER BY name ASC
        `
      )
      .all()
      .map((row) => (row as TableRow).name);

    expect(tables).toEqual(
      expect.arrayContaining([
        'audit_log',
        'evidence_date_candidates',
        'evidence_goods_services',
        'evidence_items',
        'goods_services',
        'schema_migrations',
        'trademark_cases'
      ])
    );
  });

  it('enables foreign keys and stores the hash algorithm explicitly', () => {
    db = createInMemoryDatabase();

    const pragma = db.prepare('PRAGMA foreign_keys').get() as ForeignKeysRow;
    const evidenceColumns = db.prepare('PRAGMA table_info(evidence_items)').all() as TableInfoRow[];
    const hashAlgoColumn = evidenceColumns.find((column) => column.name === 'hash_algo');

    expect(pragma.foreign_keys).toBe(1);
    expect(hashAlgoColumn?.dflt_value).toBe("'sha256'");
  });

  it('cascades goods_services deletion when a trademark_case is deleted', () => {
    db = createInMemoryDatabase();

    db.prepare(
      `
        INSERT INTO trademark_cases (
          id, mark_name, owner_name, registration_number, jurisdiction,
          use_period_from, use_period_to, created_at, updated_at
        )
        VALUES (
          'case-1', 'MarkProof', 'Example GmbH', 'REG-1', 'DPMA',
          '2021-01-01', '2026-01-01',
          '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
        )
      `
    ).run();

    db.prepare(
      `
        INSERT INTO goods_services (
          id, case_id, nice_class, description, sort_order, created_at, updated_at
        )
        VALUES (
          'gs-1', 'case-1', 9, 'Software', 0,
          '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
        )
      `
    ).run();

    db.prepare('DELETE FROM trademark_cases WHERE id = ?').run('case-1');

    const remaining = db
      .prepare('SELECT COUNT(*) as count FROM goods_services WHERE case_id = ?')
      .get('case-1') as { count: number };

    expect(remaining.count).toBe(0);
  });

  it('migrates existing jurisdiction data without rewriting child foreign keys', () => {
    db = new Database(':memory:');
    configureDatabase(db);

    db.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE trademark_cases (
        id TEXT PRIMARY KEY,
        mark_name TEXT NOT NULL CHECK (length(trim(mark_name)) > 0),
        owner_name TEXT NOT NULL CHECK (length(trim(owner_name)) > 0),
        registration_number TEXT NOT NULL CHECK (length(trim(registration_number)) > 0),
        jurisdiction TEXT NOT NULL CHECK (jurisdiction IN ('DPMA', 'EUIPO', 'USPTO', 'OTHER')),
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

      -- Minimal v1-era evidence table so migration v3 has something to ALTER.
      CREATE TABLE evidence_items (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        evidence_type TEXT NOT NULL,
        source_filename TEXT NOT NULL,
        stored_relative_path TEXT NOT NULL,
        file_hash TEXT NOT NULL,
        hash_algo TEXT NOT NULL DEFAULT 'sha256',
        file_size_bytes INTEGER NOT NULL,
        mime_type TEXT,
        date_of_use TEXT,
        territory TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        extracted_text TEXT,
        extracted_text_status TEXT NOT NULL DEFAULT 'pending',
        exif_json TEXT NOT NULL DEFAULT '{}',
        file_created_at TEXT,
        file_modified_at TEXT,
        imported_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (case_id) REFERENCES trademark_cases(id) ON DELETE CASCADE
      );

      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (1, 'initial_schema', '2026-01-01T00:00:00.000Z');

      INSERT INTO trademark_cases (
        id, mark_name, owner_name, registration_number, jurisdiction,
        use_period_from, use_period_to, created_at, updated_at
      )
      VALUES (
        'case-1', 'MarkProof', 'Example GmbH', 'REG-1', 'USPTO',
        '2021-01-01', '2026-01-01',
        '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
      );

      INSERT INTO goods_services (
        id, case_id, nice_class, description, sort_order, created_at, updated_at
      )
      VALUES (
        'gs-1', 'case-1', 9, 'Software', 0,
        '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
      );
    `);

    applyMigrations(db);

    const migratedCase = db
      .prepare('SELECT jurisdiction FROM trademark_cases WHERE id = ?')
      .get('case-1') as TrademarkCaseJurisdictionRow;
    const goodsServiceForeignKeys = db.prepare('PRAGMA foreign_key_list(goods_services)').all() as
      | ForeignKeyListRow[]
      | [];
    const migrationVersions = db
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all() as MigrationVersionRow[];

    expect(migratedCase.jurisdiction).toBe('OTHER');
    expect(goodsServiceForeignKeys.map((row) => row.table)).toEqual(['trademark_cases']);
    expect(migrationVersions.map((row) => row.version)).toEqual([1, 2, 3]);

    const evidenceColumns = (
      db.prepare('PRAGMA table_info(evidence_items)').all() as { name: string }[]
    ).map((row) => row.name);
    expect(evidenceColumns).toEqual(
      expect.arrayContaining([
        'territories_json',
        'mark_form_as_used',
        'use_amount_value',
        'use_amount_currency',
        'use_units_count'
      ])
    );

    db.prepare('DELETE FROM trademark_cases WHERE id = ?').run('case-1');

    const remainingGoodsServices = db
      .prepare('SELECT COUNT(*) as count FROM goods_services WHERE case_id = ?')
      .get('case-1') as { count: number };

    expect(remainingGoodsServices.count).toBe(0);
  });
});
