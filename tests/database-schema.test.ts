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
});
