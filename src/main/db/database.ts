import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { applyMigrations } from './migrations';

export type SqliteDatabase = Database.Database;

export function configureDatabase(db: SqliteDatabase): void {
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
}

export function openDatabase(databasePath: string): SqliteDatabase {
  mkdirSync(dirname(databasePath), { recursive: true });

  const db = new Database(databasePath);
  configureDatabase(db);
  applyMigrations(db);

  return db;
}

export function createInMemoryDatabase(): SqliteDatabase {
  const db = new Database(':memory:');
  configureDatabase(db);
  applyMigrations(db);

  return db;
}
