import type Database from 'better-sqlite3';

import { INITIAL_SCHEMA_SQL, MIGRATIONS_TABLE_SQL } from './schema';

type MigrationBase = {
  version: number;
  name: string;
};

type SqlMigration = MigrationBase & {
  sql: string;
};

type CodeMigration = MigrationBase & {
  apply: (db: Database.Database) => void;
};

export type Migration = SqlMigration | CodeMigration;

type MigrationRow = {
  version: number;
};

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: INITIAL_SCHEMA_SQL
  },
  {
    version: 2,
    name: 'jurisdiction_drop_uspto_add_wipo_madrid',
    apply: applyJurisdictionMigration
  }
] as const;

export function applyMigrations(db: Database.Database): void {
  db.exec(MIGRATIONS_TABLE_SQL);

  const appliedVersions = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((row) => (row as MigrationRow).version)
  );

  const recordMigration = db.prepare(
    `
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (@version, @name, @appliedAt)
    `
  );

  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    if ('apply' in migration) {
      migration.apply(db);
      recordMigration.run({
        version: migration.version,
        name: migration.name,
        appliedAt: new Date().toISOString()
      });
    } else {
      db.transaction(() => {
        db.exec(migration.sql);
        recordMigration.run({
          version: migration.version,
          name: migration.name,
          appliedAt: new Date().toISOString()
        });
      })();
    }
  }
}

// SQLite cannot ALTER a CHECK constraint, so we rebuild trademark_cases with
// the new jurisdiction set. Keep the original table name until DROP so SQLite
// does not rewrite child-table foreign keys to a temporary legacy table name.
function applyJurisdictionMigration(db: Database.Database): void {
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE trademark_cases_new (
          id TEXT PRIMARY KEY,
          mark_name TEXT NOT NULL CHECK (length(trim(mark_name)) > 0),
          owner_name TEXT NOT NULL CHECK (length(trim(owner_name)) > 0),
          registration_number TEXT NOT NULL CHECK (length(trim(registration_number)) > 0),
          jurisdiction TEXT NOT NULL CHECK (
            jurisdiction IN ('DPMA', 'EUIPO', 'WIPO_MADRID', 'OTHER')
          ),
          use_period_from TEXT NOT NULL CHECK (length(use_period_from) = 10),
          use_period_to TEXT NOT NULL CHECK (length(use_period_to) = 10),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK (use_period_from <= use_period_to)
        );

        INSERT INTO trademark_cases_new (
          id, mark_name, owner_name, registration_number,
          jurisdiction, use_period_from, use_period_to, created_at, updated_at
        )
        SELECT
          id, mark_name, owner_name, registration_number,
          CASE WHEN jurisdiction = 'USPTO' THEN 'OTHER' ELSE jurisdiction END,
          use_period_from, use_period_to, created_at, updated_at
        FROM trademark_cases;

        DROP TABLE trademark_cases;
        ALTER TABLE trademark_cases_new RENAME TO trademark_cases;
      `);
    })();
    const foreignKeyViolations = db.prepare('PRAGMA foreign_key_check').all();
    if (foreignKeyViolations.length > 0) {
      throw new Error('Jurisdiction migration left foreign key violations.');
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}
