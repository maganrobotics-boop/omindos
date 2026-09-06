import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { EXPECTED_DRIZZLE_LEDGER, migrationSourceLedgerStatement } from "../lib/migration-source-ledger.mjs";
import { migrationNamesFromLedger, MIGRATION_EXPORT_EXPECTED_MIGRATIONS } from "../lib/migration-export.mjs";

test("source Drizzle ledger requires exact file hashes, timestamps, and migration order", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE __drizzle_migrations (id INTEGER, hash TEXT NOT NULL, created_at NUMERIC)");
    const insert = db.prepare("INSERT INTO __drizzle_migrations VALUES (NULL, ?, ?)");
    for (const entry of EXPECTED_DRIZZLE_LEDGER) {
      assert.equal(entry.hash, createHash("sha256").update(readFileSync(new URL(`../drizzle/${entry.name}`, import.meta.url))).digest("hex"));
      insert.run(entry.hash, entry.createdAt);
    }
    const adapter = { prepare(sql) { return { async all() { return { success: true, results: db.prepare(sql).all().map((row) => ({ ...row })) }; } }; } };
    const query = await migrationSourceLedgerStatement(adapter);
    assert.deepEqual(migrationNamesFromLedger(await query.all()), MIGRATION_EXPORT_EXPECTED_MIGRATIONS);
    db.exec("UPDATE __drizzle_migrations SET hash = 'tampered' WHERE created_at = (SELECT MAX(created_at) FROM __drizzle_migrations)");
    assert.throws(() => migrationNamesFromLedger({ success: true, results: db.prepare(`SELECT 1 AS id, 'UNRECOGNIZED' AS name`).all().map((row) => ({ ...row })) }), /required application schema/);
    const changed = await query.all();
    assert.throws(() => migrationNamesFromLedger(changed), /required application schema/);
  } finally { db.close(); }
});
