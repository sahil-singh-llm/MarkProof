import { afterEach, describe, expect, it } from 'vitest';

import type { SqliteDatabase } from '../src/main/db/database';
import { createInMemoryDatabase } from '../src/main/db/database';

type TableRow = {
  name: string;
};

type ForeignKeysRow = {
  foreign_keys: number;
};

type TableInfoRow = {
  name: string;
  dflt_value: string | null;
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
});
