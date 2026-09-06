import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test, { after } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

import {
  buildMigrationPayload,
  canonicalJson,
  MIGRATION_EXPORT_EXPECTED_MIGRATIONS,
  MIGRATION_EXPORT_TABLES,
  migrationExportSelectSql,
  migrationLedgerSelectSql,
  migrationSchemaFingerprint,
  migrationSchemaSelectSql,
} from "../lib/migration-export.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const migrationDirectory = new URL("../drizzle/", import.meta.url);
const migrationFiles = readdirSync(migrationDirectory)
  .filter((name) => /^\d{4}_.+\.sql$/u.test(name))
  .sort();
const authKey = Buffer.alloc(32, 0x5a).toString("base64url");
const freezeId = "11111111-2222-4333-8444-555555555555";

const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  server: { middlewareMode: true, hmr: false },
});
const migrationWorker = (await vite.ssrLoadModule("/scripts/migration-import-worker.ts")).default;

after(async () => vite.close());

function plainRows(rows) {
  return rows.map((row) => Object.fromEntries(Object.entries(row)));
}

function createApplicationDatabase() {
  const database = new DatabaseSync(":memory:");
  for (const name of migrationFiles) {
    const sql = readFileSync(new URL(name, migrationDirectory), "utf8");
    for (const statement of sql.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) database.exec(statement);
  }
  database.exec("CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL)");
  const insertMigration = database.prepare("INSERT INTO d1_migrations (id, name) VALUES (?, ?)");
  MIGRATION_EXPORT_EXPECTED_MIGRATIONS.forEach((name, index) => insertMigration.run(index + 1, name));
  return database;
}

function seedSource(database, displayName = "迁移管理员") {
  const timestamp = new Date().toISOString();
  database.prepare(`
    INSERT INTO members (
      id, full_name, identity_number, school_email, chatgpt_account,
      account_user_id, role, permissions_json, department_code, status,
      mutation_revision, created_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'member', '[]', '', 'active', ?, ?, ?)
  `).run(
    "member-admin",
    displayName,
    "OM-ADMIN",
    "admin@school.example",
    "admin@example.com",
    "email:admin@example.com",
    "0123456789abcdef0123456789abcdef",
    timestamp,
    timestamp,
  );
  database.prepare(`
    INSERT INTO auth_identities (
      id, member_id, provider, provider_subject, login_snapshot,
      verified_email_snapshot, linked_at, last_seen_at, unlinked_at
    ) VALUES (?, ?, 'github', ?, ?, ?, ?, ?, NULL)
  `).run(
    "identity-admin",
    "member-admin",
    "583231",
    "admin-login",
    "admin@example.com",
    timestamp,
    timestamp,
  );
}

async function makePayload({ displayName, duplicateProviderSubject = false } = {}) {
  const source = createApplicationDatabase();
  try {
    seedSource(source, displayName);
    const ledger = { success: true, results: plainRows(source.prepare(migrationLedgerSelectSql()).all()) };
    const schema = { success: true, results: plainRows(source.prepare(migrationSchemaSelectSql()).all()) };
    const tableResults = MIGRATION_EXPORT_TABLES.map((table) => ({
      success: true,
      results: plainRows(source.prepare(migrationExportSelectSql(table)).all()),
    }));
    if (duplicateProviderSubject) {
      const identityIndex = MIGRATION_EXPORT_TABLES.findIndex((table) => table.name === "auth_identities");
      tableResults[identityIndex].results.push({ ...tableResults[identityIndex].results[0], id: "identity-conflict" });
    }
    const now = Date.now();
    const expectedSchemaSha256 = await migrationSchemaFingerprint(schema);
    return buildMigrationPayload({
      sourceOrigin: "https://oa.example.test",
      authKey,
      freezeId,
      writeFrozenAt: new Date(now - 20 * 60 * 1000).toISOString(),
      notBefore: new Date(now - 5 * 60 * 1000).toISOString(),
      notAfter: new Date(now + 30 * 60 * 1000).toISOString(),
      expectedSchemaSha256,
      exportedAt: new Date(now).toISOString(),
      batchResults: [
        ledger,
        schema,
        { success: true, results: [{ write_frozen_at: new Date(now - 20 * 60 * 1000).toISOString(), ready: 1 }] },
        { success: true, results: [{ active_count: 0 }] },
        ...tableResults,
      ],
    });
  } finally {
    source.close();
  }
}

class PreparedStatement {
  constructor(database, sql, bindings = []) {
    this.database = database;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new PreparedStatement(this.database, this.sql, bindings);
  }
}

class TransactionalD1 {
  constructor(database, failBeforeCalls = []) {
    this.database = database;
    this.failBeforeCalls = new Set(failBeforeCalls);
    this.batchCalls = 0;
  }

  prepare(sql) {
    return new PreparedStatement(this.database, sql);
  }

  async batch(statements) {
    this.batchCalls += 1;
    if (this.failBeforeCalls.delete(this.batchCalls)) throw new Error("simulated D1 transport failure");
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((entry) => {
        const statement = this.database.prepare(entry.sql);
        if (/^\s*(?:SELECT|PRAGMA)\b/iu.test(entry.sql)) {
          return { success: true, results: plainRows(statement.all(...entry.bindings)), meta: { changes: 0 } };
        }
        const metadata = statement.run(...entry.bindings);
        return { success: true, results: [], meta: { changes: Number(metadata.changes) } };
      });
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function environment(d1, payload) {
  return {
    DB: d1,
    MIGRATION_IMPORT_TOKEN: Buffer.alloc(32, 0x33).toString("base64url"),
    MIGRATION_IMPORT_AUTH_KEY: authKey,
    MIGRATION_IMPORT_EXPECTED_ORIGIN: "https://oa.example.test",
    MIGRATION_IMPORT_EXPECTED_SCHEMA_SHA256: payload.schemaSha256,
    MIGRATION_IMPORT_EXPECTED_FREEZE_ID: freezeId,
    MIGRATION_IMPORT_READY_PROOF: Buffer.alloc(32, 0x44).toString("base64url"),
  };
}

async function importRequest(d1, payload) {
  const serialized = canonicalJson(payload);
  return migrationWorker.fetch(new Request("http://127.0.0.1/import", {
    method: "POST",
    headers: {
      authorization: `Bearer ${Buffer.alloc(32, 0x33).toString("base64url")}`,
      "content-length": String(Buffer.byteLength(serialized)),
      "content-type": "application/json",
    },
    body: serialized,
  }), environment(d1, payload));
}

function targetCounts(database) {
  return {
    identities: database.prepare("SELECT COUNT(*) AS count FROM auth_identities").get().count,
    members: database.prepare("SELECT COUNT(*) AS count FROM members").get().count,
    guards: database.prepare("SELECT COUNT(*) AS count FROM write_rate_buckets").get().count,
  };
}

test("local importer commits, verifies, cleans its guard, and makes same-package replay read-only", async () => {
  const payload = await makePayload();
  const target = createApplicationDatabase();
  try {
    const d1 = new TransactionalD1(target);
    let response = await importRequest(d1, payload);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).state, "imported_verified");
    assert.deepEqual(targetCounts(target), { identities: 1, members: 1, guards: 0 });

    response = await importRequest(d1, payload);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).state, "already_imported_verified");
    assert.deepEqual(targetCounts(target), { identities: 1, members: 1, guards: 0 });

    const differentPayload = await makePayload({ displayName: "另一个管理员" });
    response = await importRequest(d1, differentPayload);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).state, "target_conflict");
    assert.deepEqual(targetCounts(target), { identities: 1, members: 1, guards: 0 });
  } finally {
    target.close();
  }
});

test("a conflict in the final insert rolls back every business row and the import guard", async () => {
  const payload = await makePayload({ duplicateProviderSubject: true });
  const target = createApplicationDatabase();
  try {
    const d1 = new TransactionalD1(target);
    const response = await importRequest(d1, payload);
    assert.equal(response.status, 500);
    assert.equal((await response.json()).state, "commit_status_unknown");
    assert.deepEqual(targetCounts(target), { identities: 0, members: 0, guards: 0 });
  } finally {
    target.close();
  }
});

test("a lost post-commit verification response recovers by exact read-only comparison", async () => {
  const payload = await makePayload();
  const target = createApplicationDatabase();
  try {
    const d1 = new TransactionalD1(target, [3]);
    let response = await importRequest(d1, payload);
    assert.equal(response.status, 500);
    assert.equal((await response.json()).state, "committed_unverified");
    assert.deepEqual(targetCounts(target), { identities: 1, members: 1, guards: 1 });

    response = await importRequest(d1, payload);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).state, "recovered_import_verified");
    assert.deepEqual(targetCounts(target), { identities: 1, members: 1, guards: 0 });
  } finally {
    target.close();
  }
});

test("guard cleanup transport failure is classified as committed and recoverable", async () => {
  const payload = await makePayload();
  const target = createApplicationDatabase();
  try {
    const d1 = new TransactionalD1(target, [4]);
    let response = await importRequest(d1, payload);
    assert.equal(response.status, 500);
    assert.equal((await response.json()).state, "committed_verified_cleanup_pending");
    assert.deepEqual(targetCounts(target), { identities: 1, members: 1, guards: 1 });

    response = await importRequest(d1, payload);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).state, "recovered_import_verified");
    assert.deepEqual(targetCounts(target), { identities: 1, members: 1, guards: 0 });
  } finally {
    target.close();
  }
});
