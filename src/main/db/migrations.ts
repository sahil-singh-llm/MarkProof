import type Database from 'better-sqlite3';

import { INITIAL_SCHEMA_SQL, MIGRATIONS_TABLE_SQL } from './schema';

export type Migration = {
  version: number;
  name: string;
  sql: string;
};

type MigrationRow = {
  version: number;
};

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: INITIAL_SCHEMA_SQL
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

  const runMigration = db.transaction((migration: Migration) => {
    db.exec(migration.sql);
    db.prepare(
      `
        INSERT INTO schema_migrations (version, name, applied_at)
        VALUES (@version, @name, @appliedAt)
      `
    ).run({
      version: migration.version,
      name: migration.name,
      appliedAt: new Date().toISOString()
    });
  });

  for (const migration of MIGRATIONS) {
    if (!appliedVersions.has(migration.version)) {
      runMigration(migration);
    }
  }
}
