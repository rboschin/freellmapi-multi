// Migration: one request_hourly row per (hour, profile), NULLs included
// Created: 2026-10-25
//
// DOWN: reversible (drops the expression unique index; merged rows stay merged)

import type { Db } from '../types.js';

const INDEX_NAME = 'idx_request_hourly_hour_profile';

function hasColumn(db: Db, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some(col => col.name === column);
}

function hasIndex(db: Db, name: string): boolean {
  return !!db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name=?`).get(name);
}

export function up(db: Db): void {
  // Guarded both ways: catalog-sync re-runs the whole migration set over a
  // live schema, so this has to survive being applied twice and must stay a
  // no-op on a database that predates 20261024_000001_add_client_profile_id.
  if (!hasColumn(db, 'request_hourly', 'client_profile_id')) return;
  if (hasIndex(db, INDEX_NAME)) return;

  db.transaction(() => {
    // 20261024 put client_profile_id into the PRIMARY KEY, but SQLite counts
    // NULLs as distinct there — so every request logged WITHOUT a client
    // profile inserted a brand-new row for the same hour instead of folding
    // into the existing one. Merge the strays back first: each one only ever
    // accumulated the writes that produced it, so summing is lossless and the
    // SUM() readers (analytics summary, MCP usage_summary) see identical
    // totals either way.
    db.exec(`
      CREATE TABLE request_hourly_rebuilt (
        hour TEXT NOT NULL,
        client_profile_id INTEGER,
        total_requests INTEGER NOT NULL DEFAULT 0,
        success_count INTEGER NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0
      )
    `);
    db.exec(`
      INSERT INTO request_hourly_rebuilt
        (hour, client_profile_id, total_requests, success_count, error_count, input_tokens, output_tokens)
      SELECT hour, client_profile_id,
             SUM(total_requests), SUM(success_count), SUM(error_count),
             SUM(input_tokens), SUM(output_tokens)
      FROM request_hourly
      GROUP BY hour, client_profile_id
    `);
    db.exec('DROP TABLE request_hourly');
    db.exec('ALTER TABLE request_hourly_rebuilt RENAME TO request_hourly');
    // DROP TABLE takes the old index with it; the expression index below is
    // the new key, this one just keeps hour-range scans on the index.
    db.prepare('CREATE INDEX IF NOT EXISTS idx_request_hourly_hour ON request_hourly(hour)').run();

    // The replacement uniqueness key: ifnull() folds "no profile" onto a
    // single non-NULL value, so a UNIQUE index — unlike the primary key — can
    // collapse the NULLs. Upserts must name this same expression verbatim in
    // their ON CONFLICT clause; an index cannot be targeted by name.
    db.prepare(`CREATE UNIQUE INDEX ${INDEX_NAME} ON request_hourly(hour, ifnull(client_profile_id, -1))`).run();
  })();
}

export function down(db: Db): void {
  db.prepare(`DROP INDEX IF EXISTS ${INDEX_NAME}`).run();
}
