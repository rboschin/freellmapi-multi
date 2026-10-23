// Migration: add client_profile_id to requests and request_hourly analytics tables
// Created: 2026-10-24
//
// DOWN: reversible (recreate request_hourly table without client_profile_id PK)

import type { Db } from '../types.js';

function hasColumn(db: Db, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some(col => col.name === column);
}

export function up(db: Db): void {
  if (!hasColumn(db, 'requests', 'client_profile_id')) {
    db.prepare('ALTER TABLE requests ADD COLUMN client_profile_id INTEGER').run();
  }
  if (!hasColumn(db, 'request_hourly', 'client_profile_id')) {
    db.transaction(() => {
        db.prepare('CREATE TABLE request_hourly_new (hour TEXT, total_requests INTEGER, success_count INTEGER, error_count INTEGER, input_tokens INTEGER, output_tokens INTEGER, client_profile_id INTEGER, PRIMARY KEY(hour, client_profile_id))').run();
        db.prepare('INSERT INTO request_hourly_new SELECT hour, total_requests, success_count, error_count, input_tokens, output_tokens, NULL FROM request_hourly').run();
        db.prepare('DROP TABLE request_hourly').run();
        db.prepare('ALTER TABLE request_hourly_new RENAME TO request_hourly').run();
    })();
  }
}

export function down(db: Db): void {
    // Revert table without client_profile_id
    db.transaction(() => {
        db.prepare('CREATE TABLE request_hourly_old (hour TEXT PRIMARY KEY, total_requests INTEGER, success_count INTEGER, error_count INTEGER, input_tokens INTEGER, output_tokens INTEGER)').run();
        db.prepare('INSERT INTO request_hourly_old SELECT hour, total_requests, success_count, error_count, input_tokens, output_tokens FROM request_hourly').run();
        db.prepare('DROP TABLE request_hourly').run();
        db.prepare('ALTER TABLE request_hourly_old RENAME TO request_hourly').run();
    })();
    if (hasColumn(db, 'requests', 'client_profile_id')) {
        db.prepare('ALTER TABLE requests DROP COLUMN client_profile_id').run();
    }
}
