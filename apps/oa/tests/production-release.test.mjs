import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  PRODUCTION_MIGRATION_NAME,
  PRODUCTION_MIGRATION_SHA256,
  productionKnowledgeDefinitions,
  validateD1Bookmark,
  validateProductionCloudflareSnapshot,
  validateProductionMigrationManifest,
  validateProductionMigrationState,
} from "../lib/production-release.mjs";
import { buildStandaloneConfig } from "../lib/standalone-config.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const migrationNames = (await readdir(join(projectRoot, "drizzle")))
  .filter((name) => /^\d{4}_[A-Za-z0-9_]+\.sql$/u.test(name))
  .sort();
const migrationSql = await readFile(join(projectRoot, "drizzle", PRODUCTION_MIGRATION_NAME), "utf8");
const releaseScript = await readFile(join(projectRoot, "scripts", "release-production.sh"), "utf8");
const smokeScript = await readFile(join(projectRoot, "scripts", "verify-production-live.mjs"), "utf8");
const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));

async function workflowSource() {
  const candidates = [
    join(projectRoot, ".github", "workflows", "deploy-oa.yml"),
    resolve(projectRoot, "..", "..", ".github", "workflows", "deploy-oa.yml"),
  ];
  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  throw new Error("The repository-root OA deployment workflow is missing");
}

const workflow = await workflowSource();

function queryResult(rows) {
  return [{ success: true, results: rows, meta: { served_by: "test" } }];
}

function schemaObjectsFromMigration(sql) {
  const result = [];
  const expression = /CREATE\s+(?:UNIQUE\s+)?(TABLE|INDEX|TRIGGER)\s+`([^`]+)`/giu;
  for (const match of sql.matchAll(expression)) result.push(`${match[1].toLowerCase()}:${match[2]}`);
  return [
    ...result,
    "index:notification_outbox_due",
    "table:notification_control",
    "table:notification_outbox",
  ].sort();
}

const expectedKnowledgeDefinitions = productionKnowledgeDefinitions(migrationSql);
const expectedSchemaObjects = schemaObjectsFromMigration(migrationSql);
const notificationSchemaObjects = expectedSchemaObjects.filter((name) => name.includes(":notification_"));

function schemaPayload(names) {
  return queryResult(names.map((entry) => {
    const separator = entry.indexOf(":");
    return {
      type: entry.slice(0, separator),
      name: entry.slice(separator + 1),
      sql: expectedKnowledgeDefinitions[entry] || `CREATE ${entry.startsWith("index:") ? "INDEX" : "TABLE"} ${entry.slice(separator + 1)}`,
    };
  }));
}

function migrationSnapshot(appliedNames, schemaNames, activeFreezes = 0) {
  return {
    ledgerPayload: queryResult(appliedNames.map((name, index) => ({ id: index + 1, name }))),
    freezePayload: queryResult([{ active_freezes: activeFreezes }]),
    schemaPayload: schemaPayload(schemaNames),
    expectedMigrationNames: migrationNames,
    expectedSchemaObjects,
    expectedKnowledgeDefinitions,
  };
}

test("production migration gate accepts only exact 0025-to-0026 or safe-resume state", () => {
  assert.equal(migrationNames.length, 27);
  assert.equal(migrationNames.at(-1), PRODUCTION_MIGRATION_NAME);
  assert.deepEqual(validateProductionMigrationManifest({ migrationNames, migrationSql }), migrationNames);
  assert.equal(PRODUCTION_MIGRATION_SHA256, "51878069d3f62b3d291002bfe1fb8f0b129ee58493109bfb8c57befb99fb2194");
  assert.equal(validateProductionMigrationState({
    phase: "before",
    ...migrationSnapshot(migrationNames.slice(0, -1), notificationSchemaObjects),
  }), "pending");
  assert.equal(validateProductionMigrationState({
    phase: "before",
    ...migrationSnapshot(migrationNames, expectedSchemaObjects),
  }), "applied");
  assert.equal(validateProductionMigrationState({
    phase: "after",
    ...migrationSnapshot(migrationNames, expectedSchemaObjects),
  }), "applied");
});

test("production migration gate rejects drift, freezes, partial schema, and malformed query results", () => {
  const pending = migrationSnapshot(migrationNames.slice(0, -1), notificationSchemaObjects);
  assert.throws(() => validateProductionMigrationState({ phase: "before", ...pending, freezePayload: queryResult([{ active_freezes: 1 }]) }), /active migration freeze/u);
  assert.throws(() => validateProductionMigrationState({ phase: "after", ...pending }), /must end exactly/u);
  assert.throws(() => validateProductionMigrationState({
    phase: "before",
    ...migrationSnapshot(migrationNames.slice(0, -1), [...notificationSchemaObjects, "table:knowledge_items"]),
  }), /pre-migration schema contains unexpected/u);
  assert.throws(() => validateProductionMigrationState({
    phase: "after",
    ...migrationSnapshot(migrationNames, expectedSchemaObjects.slice(1)),
  }), /missing|does not match/u);
  assert.throws(() => validateProductionMigrationState({
    phase: "after",
    ...migrationSnapshot([...migrationNames.slice(0, -1), "0026_unreviewed.sql"], expectedSchemaObjects),
  }), /must end exactly/u);
  assert.throws(() => validateProductionMigrationState({
    phase: "before",
    ...pending,
    ledgerPayload: [{ success: true, results: [] }, { success: true, results: [] }],
  }), /exactly one query result/u);
  assert.throws(() => validateProductionMigrationState({
    phase: "before",
    ...pending,
    expectedMigrationNames: migrationNames.slice(1),
  }), /exactly migrations 0000 through/u);
  assert.throws(() => validateProductionMigrationManifest({ migrationNames: [...migrationNames, "evil.sql"], migrationSql }), /only the exact migrations/u);
  assert.throws(() => validateProductionMigrationManifest({
    migrationNames: [...migrationNames.slice(0, -1), "0027-bad.sql"],
    migrationSql,
  }), /only the exact migrations/u);
  assert.throws(() => validateProductionMigrationManifest({ migrationNames, migrationSql: `${migrationSql}\n-- drift` }), /reviewed SHA-256/u);

  const driftedSchema = schemaPayload(expectedSchemaObjects);
  driftedSchema[0].results.find((row) => row.name.startsWith("knowledge_")).sql += " drift";
  assert.throws(() => validateProductionMigrationState({
    phase: "after",
    ...migrationSnapshot(migrationNames, expectedSchemaObjects),
    schemaPayload: driftedSchema,
  }), /schema SQL does not match/u);
});

test("migration CLI validates the exact immutable directory instead of the source worktree", async () => {
  const directory = await mkdtemp(join(tmpdir(), "originmind-oa-production-migrations-"));
  try {
    const migrationsDirectory = join(directory, "drizzle");
    await cp(join(projectRoot, "drizzle"), migrationsDirectory, { recursive: true });
    const pending = migrationSnapshot(migrationNames.slice(0, -1), notificationSchemaObjects);
    const paths = {
      ledger: join(directory, "ledger.json"),
      freeze: join(directory, "freeze.json"),
      schema: join(directory, "schema.json"),
    };
    await Promise.all([
      writeFile(paths.ledger, JSON.stringify(pending.ledgerPayload)),
      writeFile(paths.freeze, JSON.stringify(pending.freezePayload)),
      writeFile(paths.schema, JSON.stringify(pending.schemaPayload)),
    ]);
    const run = () => spawnSync(process.execPath, [
      join(projectRoot, "scripts", "check-production-migration-state.mjs"),
      "before",
      "--ledger", paths.ledger,
      "--freeze", paths.freeze,
      "--schema", paths.schema,
      "--migrations-dir", migrationsDirectory,
    ], { encoding: "utf8" });
    const good = run();
    assert.equal(good.status, 0, good.stderr);
    assert.equal(good.stdout.trim(), "pending");

    await writeFile(join(migrationsDirectory, "evil.sql"), "SELECT 1;\n");
    const extra = run();
    assert.notEqual(extra.status, 0);
    assert.match(extra.stderr, /only the exact migrations/u);
    await rm(join(migrationsDirectory, "evil.sql"));

    await writeFile(join(migrationsDirectory, PRODUCTION_MIGRATION_NAME), `${migrationSql}\n-- drift\n`);
    const changed = run();
    assert.notEqual(changed.status, 0);
    assert.match(changed.stderr, /reviewed SHA-256/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("D1 recovery bookmark must be present, bounded, and safe to persist", () => {
  assert.equal(validateD1Bookmark({ bookmark: "00000000-00000000-00000000-00000000" }), "00000000-00000000-00000000-00000000");
  assert.throws(() => validateD1Bookmark({}), /safe recovery bookmark/u);
  assert.throws(() => validateD1Bookmark([]), /must be an object/u);
  assert.throws(() => validateD1Bookmark({ bookmark: "" }), /safe recovery bookmark/u);
  assert.throws(() => validateD1Bookmark({ bookmark: "unsafe\nbookmark" }), /safe recovery bookmark/u);
});

function cloudflareSnapshot() {
  const releaseMessage = "production aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa run 12345.1";
  return {
    identity: {
      loggedIn: true,
      email: "must-not-enter-receipt@example.com",
      accounts: [{ id: "41e8b3404be24e1dd288556d77ffc951", name: "private account name" }],
    },
    primaryDatabase: { name: "originmind-internal-oa-production", uuid: "34af7e92-7da5-47cd-b7c0-1270e157c0e6" },
    websiteDatabase: { name: "omindos-website-visits", uuid: "3651ff92-d9fb-45aa-9d1d-623d25bf3459" },
    secrets: [
      { name: "FEISHU_LOGIN_APP_SECRET", type: "secret_text" },
      { name: "GITHUB_OAUTH_CLIENT_SECRET", type: "secret_text" },
      { name: "OA_LAB_AI_API_KEY", type: "secret_text" },
    ],
    deployments: [{
      id: "deployment-before-or-after",
      created_on: "2026-09-11T00:00:00.000Z",
      author_email: "must-not-enter-receipt@example.com",
      versions: [{ version_id: "released-version", percentage: 100 }],
    }],
    versions: [{
      id: "released-version",
      metadata: { created_on: "2026-09-11T00:00:00.000Z", author_email: "must-not-enter-receipt@example.com" },
      annotations: { "workers/message": releaseMessage },
    }],
    expectedVersionMessage: releaseMessage,
  };
}

test("production target gate fixes both D1 bindings and produces a value-free rollback receipt", () => {
  const snapshot = cloudflareSnapshot();
  const result = validateProductionCloudflareSnapshot(snapshot);
  assert.equal(result.workerName, "originmind-internal-oa-staging");
  assert.equal(result.releasedVersionId, "released-version");
  assert.deepEqual(result.secretNames, ["FEISHU_LOGIN_APP_SECRET", "GITHUB_OAUTH_CLIENT_SECRET", "OA_LAB_AI_API_KEY"]);
  assert.match(JSON.stringify(result), /deployment-before-or-after/u);
  assert.doesNotMatch(JSON.stringify(result), /must-not-enter-receipt/u);
  assert.doesNotMatch(JSON.stringify(result), /secret-value/u);
});

test("production target gate rejects mismatches, unknown secrets, and missing rollback evidence", () => {
  const baseline = cloudflareSnapshot();
  assert.throws(() => validateProductionCloudflareSnapshot({
    ...baseline,
    identity: { loggedIn: true, accounts: [{ id: "ffffffffffffffffffffffffffffffff" }] },
  }), /not authorized/u);
  assert.throws(() => validateProductionCloudflareSnapshot({
    ...baseline,
    primaryDatabase: { ...baseline.primaryDatabase, uuid: "00000000-0000-4000-8000-000000000000" },
  }), /fixed production target/u);
  assert.throws(() => validateProductionCloudflareSnapshot({
    ...baseline,
    secrets: baseline.secrets.filter((entry) => entry.name !== "FEISHU_LOGIN_APP_SECRET"),
  }), /missing required secret/u);
  assert.throws(() => validateProductionCloudflareSnapshot({
    ...baseline,
    secrets: [...baseline.secrets, { name: "UNREVIEWED_SECRET" }],
  }), /unreviewed secret names/u);
  assert.throws(() => validateProductionCloudflareSnapshot({ ...baseline, versions: [] }), /no rollback point/u);
  assert.throws(() => validateProductionCloudflareSnapshot({ ...baseline, expectedVersionMessage: "production another-commit run 12345.1" }), /newest production version/u);
  assert.throws(() => validateProductionCloudflareSnapshot({
    ...baseline,
    deployments: [{ ...baseline.deployments[0], versions: [{ version_id: "older-version", percentage: 100 }] }],
  }), /newest 100% production deployment/u);
  assert.throws(() => validateProductionCloudflareSnapshot({
    ...baseline,
    deployments: [{ ...baseline.deployments[0], versions: [{ version_id: "released-version", percentage: 1 }] }],
  }), /newest 100% production deployment/u);
});

test("compiled production config checker refuses target and preservation drift", async () => {
  const directory = await mkdtemp(join(tmpdir(), "originmind-oa-production-config-"));
  try {
    const serverRoot = join(directory, "dist", "server");
    const clientRoot = join(directory, "dist", "client");
    const drizzleRoot = join(directory, "drizzle");
    await Promise.all([
      mkdir(serverRoot, { recursive: true }),
      mkdir(clientRoot, { recursive: true }),
      mkdir(drizzleRoot, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(serverRoot, "index.js"), "export default {};\n"),
      writeFile(join(clientRoot, "asset.js"), "export {};\n"),
      writeFile(join(drizzleRoot, PRODUCTION_MIGRATION_NAME), migrationSql),
    ]);
    const configPath = join(serverRoot, "wrangler.json");
    const base = buildStandaloneConfig("production", {});
    base.main = "index.js";
    base.no_bundle = true;
    base.assets.directory = "../client";

    const run = async (config) => {
      await writeFile(configPath, `${JSON.stringify(config)}\n`);
      return spawnSync(process.execPath, [join(projectRoot, "scripts", "check-standalone-output.mjs"), "production", configPath], {
        cwd: projectRoot,
        encoding: "utf8",
      });
    };
    const good = await run(base);
    assert.equal(good.status, 0, good.stderr);

    for (const mutate of [
      (config) => { config.account_id = "ffffffffffffffffffffffffffffffff"; },
      (config) => { config.d1_databases[0].database_id = "00000000-0000-4000-8000-000000000000"; },
      (config) => { config.d1_databases[1].binding = "OTHER_DB"; },
      (config) => { config.vars.EXTRA = "drift"; },
      (config) => { config.keep_vars = false; },
      (config) => { config.routes = [{ pattern: "oa.omindos.ai", custom_domain: true }]; },
      (config) => { config.triggers.crons = []; },
    ]) {
      const changed = structuredClone(base);
      mutate(changed);
      const result = await run(changed);
      assert.notEqual(result.status, 0, `checker accepted mutation: ${JSON.stringify(changed)}`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("GitHub workflow tests automatically but releases production only by confirmed manual dispatch", () => {
  const testJob = workflow.slice(workflow.indexOf("  test:"), workflow.indexOf("  reject-invalid-production-dispatch:"));
  const deployJob = workflow.slice(workflow.indexOf("  deploy:"));
  assert.match(workflow, /^  workflow_dispatch:/mu);
  assert.match(workflow, /^  push:/mu);
  assert.match(workflow, /^  pull_request:/mu);
  assert.doesNotMatch(workflow, /pull_request_target/u);
  assert.match(workflow, /permissions:\n  contents: read/u);
  assert.doesNotMatch(testJob, /CLOUDFLARE_API_TOKEN|release:standalone:production|wrangler deploy/u);
  assert.match(deployJob, /github\.event_name == 'workflow_dispatch'/u);
  assert.match(deployJob, /github\.ref == 'refs\/heads\/main'/u);
  assert.match(deployJob, /originmind-internal-oa-staging:34af7e92-7da5-47cd-b7c0-1270e157c0e6:oa\.omindos\.ai/u);
  assert.match(deployJob, /name: production-oa/u);
  assert.match(deployJob, /group: oa-production/u);
  assert.match(deployJob, /cancel-in-progress: false/u);
  assert.doesNotMatch(workflow, /^\s+queue:/mu);
  assert.equal([...workflow.matchAll(/^\s+CLOUDFLARE_API_TOKEN:/gmu)].length, 1);
  assert.match(workflow, /actions\/checkout@d23441a48e516b6c34aea4fa41551a30e30af803/u);
  assert.match(workflow, /actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38/u);
  assert.match(workflow, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/u);
  assert.match(deployJob, /if: always\(\)/u);
});

test("production shell gate fails before commands and orders one immutable migration/deploy sequence", () => {
  const scriptPath = join(projectRoot, "scripts", "release-production.sh");
  for (const invocation of [
    { arguments: [], env: { PATH: "/nonexistent" } },
    { arguments: ["production"], env: { PATH: "/nonexistent", OA_PRODUCTION_RELEASE_CONFIRM: "wrong" } },
    {
      arguments: ["production"],
      env: {
        PATH: "/nonexistent",
        OA_PRODUCTION_RELEASE_CONFIRM: "originmind-internal-oa-staging:34af7e92-7da5-47cd-b7c0-1270e157c0e6:oa.omindos.ai",
        GITHUB_ACTIONS: "false",
      },
    },
  ]) {
    const result = spawnSync("/bin/bash", [scriptPath, ...invocation.arguments], { encoding: "utf8", env: invocation.env });
    assert.equal(result.status, 64);
    assert.doesNotMatch(result.stderr, /command not found/u);
  }

  assert.equal(packageJson.scripts["release:standalone:production"], "bash scripts/release-production.sh production");
  assert.equal([...releaseScript.matchAll(/d1 migrations apply DB/g)].length, 1);
  assert.match(releaseScript, /run_wrangler deploy --dry-run --strict --keep-vars --config/u);
  assert.match(releaseScript, /run_wrangler deploy --strict --keep-vars --config/u);
  assert.doesNotMatch(releaseScript, /"\$\{wrangler\}"\s+(?:rollback|d1 time-travel restore)\b/u);
  assert.match(releaseScript, /cloudflare_api_token="\$\{CLOUDFLARE_API_TOKEN\}"\nunset CLOUDFLARE_API_TOKEN/u);
  assert.match(releaseScript, /CLOUDFLARE_API_TOKEN="\$\{cloudflare_api_token\}" "\$\{wrangler\}" "\$@"/u);
  assert.ok(releaseScript.indexOf("unset CLOUDFLARE_API_TOKEN") < releaseScript.indexOf("npm run typecheck"));
  assert.match(releaseScript, /SELECT type, name, sql FROM sqlite_master WHERE name GLOB 'knowledge_\*'/u);
  assert.equal([...releaseScript.matchAll(/--migrations-dir "\$\{release_root\}\/drizzle"/g)].length, 2);
  assert.match(releaseScript, /check-production-d1-bookmark\.mjs/u);
  assert.match(releaseScript, /release_message="production \$\{GITHUB_SHA\} run \$\{GITHUB_RUN_ID\}\.\$\{GITHUB_RUN_ATTEMPT\}"/u);

  const beforeGate = releaseScript.indexOf("check-production-migration-state.mjs\" before");
  const dryRun = releaseScript.indexOf("deploy --dry-run --strict");
  const bookmark = releaseScript.indexOf("d1 time-travel info DB");
  const migration = releaseScript.indexOf("d1 migrations apply DB");
  const afterGate = releaseScript.indexOf("check-production-migration-state.mjs\" after");
  const finalHash = releaseScript.lastIndexOf("sha256sum --check");
  const finalDeploy = releaseScript.indexOf("deploy --strict --keep-vars --config", dryRun + 1);
  const targetAfter = releaseScript.indexOf("--expected-version-message");
  const smoke = releaseScript.indexOf("verify-production-live.mjs");
  assert.ok(beforeGate >= 0 && beforeGate < dryRun);
  assert.ok(dryRun < bookmark && bookmark < migration);
  assert.ok(migration < afterGate && afterGate < finalHash);
  assert.ok(finalHash < finalDeploy && finalDeploy < targetAfter && targetAfter < smoke);
});

test("production smoke is fixed to the canonical origin and remains read-only", () => {
  assert.match(smokeScript, /const PRODUCTION_ORIGIN = "https:\/\/oa\.omindos\.ai"/u);
  assert.match(smokeScript, /request\("\/api\/session"/u);
  assert.match(smokeScript, /approvalsResponse\.status !== 401/u);
  assert.match(smokeScript, /knowledgeResponse\.status !== 401/u);
  assert.match(smokeScript, /ARTS Robotics AI Assistant/u);
  assert.match(smokeScript, /实验室 AI/u);
  assert.doesNotMatch(smokeScript, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/u);
});
