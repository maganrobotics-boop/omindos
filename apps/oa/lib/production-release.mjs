import { createHash } from "node:crypto";

import { requiredStandaloneSecrets, standaloneTargets } from "./standalone-config.mjs";

export const PRODUCTION_MIGRATION_NAME = "0026_rich_jocasta.sql";
export const PRODUCTION_MIGRATION_SHA256 = "51878069d3f62b3d291002bfe1fb8f0b129ee58493109bfb8c57befb99fb2194";
export const OPTIONAL_PRODUCTION_SECRETS = Object.freeze(["OA_LAB_AI_API_KEY"]);

function exactObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function exactArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

export function d1QueryRows(payload, label) {
  const results = exactArray(payload, label);
  if (results.length !== 1) throw new Error(`${label} must contain exactly one query result`);
  const result = exactObject(results[0], `${label} result`);
  if (result.success !== true || !Array.isArray(result.results)) throw new Error(`${label} query did not succeed`);
  return result.results.map((row) => exactObject(row, `${label} row`));
}

function normalizeCount(value, label) {
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error(`${label} must be a non-negative integer`);
  return count;
}

function migrationNames(ledgerPayload) {
  return d1QueryRows(ledgerPayload, "Production migration ledger").map((row, index) => {
    if (normalizeCount(row.id, "Migration id") !== index + 1 || typeof row.name !== "string" || !row.name) {
      throw new Error("Production migration ledger is malformed");
    }
    return row.name;
  });
}

function activeFreezeCount(freezePayload) {
  const rows = d1QueryRows(freezePayload, "Production migration freeze query");
  if (rows.length !== 1 || Object.keys(rows[0]).length !== 1 || !("active_freezes" in rows[0])) {
    throw new Error("Production migration freeze result is malformed");
  }
  return normalizeCount(rows[0].active_freezes, "Active migration freeze count");
}

function sameStrings(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function normalizeSchemaSql(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is missing SQL`);
  return value.trim().replace(/;\s*$/u, "").replace(/\s+/gu, " ");
}

export function validateProductionMigrationManifest({ migrationNames: names, migrationSql }) {
  const migrationFiles = exactArray(names, "Production migration files");
  if (
    migrationFiles.length !== 27
    || migrationFiles.at(-1) !== PRODUCTION_MIGRATION_NAME
    || new Set(migrationFiles).size !== migrationFiles.length
    || migrationFiles.some((name, index) => (
      typeof name !== "string"
      || !/^\d{4}_[A-Za-z0-9_]+\.sql$/u.test(name)
      || !name.startsWith(`${String(index).padStart(4, "0")}_`)
    ))
  ) throw new Error(`The release must contain only the exact migrations 0000 through ${PRODUCTION_MIGRATION_NAME}`);
  if (typeof migrationSql !== "string") throw new Error(`${PRODUCTION_MIGRATION_NAME} is missing`);
  const digest = createHash("sha256").update(migrationSql).digest("hex");
  if (digest !== PRODUCTION_MIGRATION_SHA256) throw new Error(`${PRODUCTION_MIGRATION_NAME} does not match the reviewed SHA-256`);
  return [...migrationFiles];
}

export function productionKnowledgeDefinitions(migrationSql) {
  const digest = createHash("sha256").update(migrationSql).digest("hex");
  if (digest !== PRODUCTION_MIGRATION_SHA256) throw new Error(`${PRODUCTION_MIGRATION_NAME} does not match the reviewed SHA-256`);
  const definitions = {};
  for (const statement of migrationSql.split(/--> statement-breakpoint\s*/u).map((value) => value.trim()).filter(Boolean)) {
    const match = statement.match(/^CREATE\s+(?:UNIQUE\s+)?(TABLE|INDEX|TRIGGER)\s+`(knowledge_[^`]+)`/iu);
    if (!match) continue;
    const key = `${match[1].toLowerCase()}:${match[2]}`;
    if (definitions[key]) throw new Error(`Duplicate knowledge schema definition ${key}`);
    definitions[key] = normalizeSchemaSql(statement, key);
  }
  if (Object.keys(definitions).length !== 27) throw new Error("Migration 0026 must contain the exact reviewed knowledge schema definitions");
  return definitions;
}

export function validateD1Bookmark(payload) {
  const bookmark = exactObject(payload, "D1 Time Travel response").bookmark;
  if (typeof bookmark !== "string" || !/^[A-Za-z0-9._~+/:=-]{1,1024}$/u.test(bookmark)) {
    throw new Error("D1 Time Travel response is missing a safe recovery bookmark");
  }
  return bookmark;
}

export function validateProductionMigrationState({
  phase,
  ledgerPayload,
  freezePayload,
  schemaPayload,
  expectedMigrationNames,
  expectedSchemaObjects,
  expectedKnowledgeDefinitions,
}) {
  if (phase !== "before" && phase !== "after") throw new Error("Migration validation phase must be before or after");
  const expectedNames = exactArray(expectedMigrationNames, "Expected migration names");
  if (
    expectedNames.length !== 27
    || expectedNames.at(-1) !== PRODUCTION_MIGRATION_NAME
    || new Set(expectedNames).size !== expectedNames.length
    || expectedNames.some((name, index) => (
      typeof name !== "string"
      || !/^\d{4}_[A-Za-z0-9_]+\.sql$/u.test(name)
      || !name.startsWith(`${String(index).padStart(4, "0")}_`)
    ))
  ) throw new Error(`The release must contain exactly migrations 0000 through ${PRODUCTION_MIGRATION_NAME}`);

  if (activeFreezeCount(freezePayload) !== 0) throw new Error("Production database has an active migration freeze");

  const appliedNames = migrationNames(ledgerPayload);
  if (new Set(appliedNames).size !== appliedNames.length) throw new Error("Production migration ledger contains duplicate names");
  const expectedObjects = [...new Set(exactArray(expectedSchemaObjects, "Expected schema objects"))].sort();
  const schemaRows = d1QueryRows(schemaPayload, "Production schema query");
  const actualObjects = schemaRows.map((row) => {
    if (!["index", "table", "trigger"].includes(row.type) || typeof row.name !== "string" || !row.name) {
      throw new Error("Production schema query contains an invalid object");
    }
    return `${row.type}:${row.name}`;
  }).sort();
  if (new Set(actualObjects).size !== actualObjects.length) throw new Error("Production schema query contains duplicate objects");
  const notificationObjects = [
    "index:notification_outbox_due",
    "table:notification_control",
    "table:notification_outbox",
  ];
  for (const objectName of notificationObjects) {
    if (!actualObjects.includes(objectName)) throw new Error(`Production notification schema is missing ${objectName}`);
  }
  const knowledgeObjects = actualObjects.filter((name) => name.includes(":knowledge_"));

  if (phase === "before" && sameStrings(appliedNames, expectedNames.slice(0, -1))) {
    if (!sameStrings(actualObjects, [...notificationObjects].sort())) {
      throw new Error("Production pre-migration schema contains unexpected or missing objects");
    }
    return "pending";
  }

  if (!sameStrings(appliedNames, expectedNames)) {
    throw new Error(`Production migration ledger must end exactly at ${phase === "before" ? "0025 or 0026" : "0026"}`);
  }
  if (!sameStrings(actualObjects, expectedObjects)) throw new Error("Production knowledge/notification schema does not match the release");
  const expectedDefinitions = exactObject(expectedKnowledgeDefinitions, "Expected knowledge schema definitions");
  if (!sameStrings(Object.keys(expectedDefinitions).sort(), knowledgeObjects)) {
    throw new Error("Expected knowledge schema definitions do not match migration 0026");
  }
  for (const row of schemaRows) {
    const key = `${row.type}:${row.name}`;
    if (!knowledgeObjects.includes(key)) continue;
    if (normalizeSchemaSql(row.sql, key) !== expectedDefinitions[key]) {
      throw new Error(`Production schema SQL does not match migration 0026 for ${key}`);
    }
  }
  return "applied";
}

function accountIds(identity) {
  return Array.isArray(identity.accounts)
    ? identity.accounts.flatMap((account) => typeof account?.id === "string" ? [account.id] : [])
    : [];
}

function assertDatabase(details, expectedName, expectedId, label) {
  const database = exactObject(details, label);
  if (database.name !== expectedName || database.uuid !== expectedId) {
    throw new Error(`${label} does not match the fixed production target`);
  }
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim() || value.length > 512) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function sanitizeDeployment(value) {
  const deployment = exactObject(value, "Cloudflare deployment");
  const versions = exactArray(deployment.versions, "Cloudflare deployment versions").map((entry) => {
    const version = exactObject(entry, "Cloudflare deployment version");
    const percentage = Number(version.percentage);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      throw new Error("Cloudflare deployment version percentage is invalid");
    }
    return { versionId: requiredString(version.version_id, "Cloudflare deployment version id"), percentage };
  });
  if (!versions.length) throw new Error("Cloudflare deployment has no versions");
  return {
    id: requiredString(deployment.id, "Cloudflare deployment id"),
    createdOn: requiredString(deployment.created_on, "Cloudflare deployment creation time"),
    versions,
  };
}

function sanitizeVersion(value) {
  const version = exactObject(value, "Cloudflare Worker version");
  const metadata = exactObject(version.metadata, "Cloudflare Worker version metadata");
  const annotations = version.annotations && typeof version.annotations === "object" && !Array.isArray(version.annotations)
    ? version.annotations
    : {};
  const message = annotations["workers/message"];
  if (message !== undefined && typeof message !== "string") throw new Error("Cloudflare Worker version message is invalid");
  return {
    id: requiredString(version.id, "Cloudflare Worker version id"),
    createdOn: requiredString(metadata.created_on, "Cloudflare Worker version creation time"),
    ...(message ? { message } : {}),
  };
}

export function validateProductionCloudflareSnapshot({
  identity,
  primaryDatabase,
  websiteDatabase,
  secrets,
  deployments,
  versions,
  expectedVersionMessage,
}) {
  const production = standaloneTargets.production;
  const identityObject = exactObject(identity, "Cloudflare identity");
  if (identityObject.loggedIn !== true || !accountIds(identityObject).includes(production.accountId)) {
    throw new Error("Cloudflare token is not authorized for the fixed production account");
  }
  assertDatabase(primaryDatabase, production.databaseName, production.databaseId, "Primary D1");
  assertDatabase(websiteDatabase, production.websiteDatabaseName, production.websiteDatabaseId, "Website D1");

  const secretNames = exactArray(secrets, "Cloudflare secret list").map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || typeof entry.name !== "string") {
      throw new Error("Cloudflare secret list contains an invalid entry");
    }
    return entry.name;
  }).sort();
  if (new Set(secretNames).size !== secretNames.length) throw new Error("Cloudflare secret list contains duplicate names");
  for (const required of requiredStandaloneSecrets) {
    if (!secretNames.includes(required)) throw new Error(`Cloudflare Worker is missing required secret ${required}`);
  }
  const allowedSecrets = new Set([...requiredStandaloneSecrets, ...OPTIONAL_PRODUCTION_SECRETS]);
  const unexpectedSecrets = secretNames.filter((name) => !allowedSecrets.has(name));
  if (unexpectedSecrets.length) throw new Error(`Cloudflare Worker has unreviewed secret names: ${unexpectedSecrets.join(", ")}`);

  const deploymentList = exactArray(deployments, "Cloudflare deployment list").map(sanitizeDeployment)
    .sort((left, right) => left.createdOn.localeCompare(right.createdOn));
  const versionList = exactArray(versions, "Cloudflare version list").map(sanitizeVersion)
    .sort((left, right) => left.createdOn.localeCompare(right.createdOn));
  if (!deploymentList.length || !versionList.length) throw new Error("The production Worker has no rollback point");
  let releasedVersionId;
  if (expectedVersionMessage !== undefined) {
    requiredString(expectedVersionMessage, "Expected production version message");
    const releasedVersions = versionList.filter((version) => version.message === expectedVersionMessage);
    const releasedVersion = releasedVersions[0];
    if (releasedVersions.length !== 1 || versionList.at(-1)?.id !== releasedVersion?.id) {
      throw new Error("The newest production version does not uniquely identify the released run");
    }
    const latestDeployment = deploymentList.at(-1);
    if (
      latestDeployment.versions.length !== 1
      || latestDeployment.versions[0].versionId !== releasedVersion.id
      || latestDeployment.versions[0].percentage !== 100
    ) {
      throw new Error("The released Worker version is not the newest 100% production deployment");
    }
    releasedVersionId = releasedVersion.id;
  }

  return {
    accountId: production.accountId,
    workerName: production.workerName,
    primaryDatabaseId: production.databaseId,
    websiteDatabaseId: production.websiteDatabaseId,
    publicOrigin: production.publicOrigin,
    secretNames,
    deploymentCount: deploymentList.length,
    versionCount: versionList.length,
    deployments: deploymentList,
    versions: versionList,
    ...(releasedVersionId ? { releasedVersionId } : {}),
  };
}
