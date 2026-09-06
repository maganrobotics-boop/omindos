import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

import { MIGRATION_EXPORT_TABLES } from "../lib/migration-export.mjs";
import { assertTargetAdministratorReentry, migrationImportD1QueryCount, migrationImportRowBatches } from "../lib/migration-import-plan.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, server: { middlewareMode: true, hmr: false } });
const migration = await vite.ssrLoadModule("/lib/migration-import.ts");
const revisions = await vite.ssrLoadModule("/lib/approval-revisions.ts");

after(async () => vite.close());

function defaultCell(table, column) {
  if (["current_revision_no", "revision_no", "id"].includes(column) && ["approval_events", "member_events"].includes(table)) return 1;
  if (column === "current_revision_no") return 0;
  if (["current_revision_hash", "previous_revision_hash", "source_revision_hash", "nda_accepted_at", "nda_approval_id", "nda_agreement_version", "unlinked_at"].includes(column)) return null;
  if (column === "status" && table === "members") return "active";
  if (column === "account_user_id" && table === "members") return "email:member@example.com";
  if (column === "chatgpt_account" && table === "members") return "member@example.com";
  if (column === "payload_json") return "{}";
  if (column === "signers_json" || column === "permissions_json") return "[]";
  return `${table}:${column}`;
}

function row(tableName, overrides = {}) {
  const spec = MIGRATION_EXPORT_TABLES.find((table) => table.name === tableName);
  return spec.columns.map((column) => column in overrides ? overrides[column] : defaultCell(tableName, column));
}

function payload(rowsByTable = {}) {
  return {
    manifestSha256: "a".repeat(64),
    schemaSha256: "b".repeat(64),
    tables: MIGRATION_EXPORT_TABLES.map((table) => ({
      name: table.name,
      columns: [...table.columns],
      rows: rowsByTable[table.name] || [],
      rowCount: (rowsByTable[table.name] || []).length,
      sha256: "c".repeat(64),
    })),
  };
}

function record(tableName, values) {
  const spec = MIGRATION_EXPORT_TABLES.find((table) => table.name === tableName);
  return Object.fromEntries(spec.columns.map((column, index) => [column, values[index]]));
}

function approvalProjection(approval) {
  return {
    id: approval.id,
    type: approval.type,
    title: approval.title,
    project: approval.project,
    requesterName: approval.requester_name,
    requesterEmail: approval.requester_email,
    clientCreationKey: approval.client_creation_key,
    businessKey: approval.business_key,
    createdAt: approval.created_at,
    updatedAt: approval.updated_at,
    status: approval.status,
    currentStep: approval.current_step,
    currentReviewerName: approval.current_reviewer_name,
    currentReviewerEmail: approval.current_reviewer_email,
    summary: approval.summary,
    owner: approval.owner,
    amount: approval.amount,
    periodKey: approval.period_key,
    signersJson: approval.signers_json,
    payloadJson: approval.payload_json,
    currentRevisionNo: approval.current_revision_no,
    currentRevisionHash: approval.current_revision_hash,
  };
}

test("migration import planner accepts the Free-plan boundary and rejects the next query", () => {
  const atLimit = payload({ approval_revisions: Array.from({ length: 32 }, (_, index) => row("approval_revisions", { approval_id: "a", revision_no: index + 1 })) });
  const overLimit = payload({ approval_revisions: Array.from({ length: 33 }, (_, index) => row("approval_revisions", { approval_id: "a", revision_no: index + 1 })) });
  assert.equal(migrationImportD1QueryCount(atLimit), 50);
  assert.equal(migrationImportD1QueryCount(overLimit), 51);
});

test("revision batches keep predecessors in earlier statements and respect D1 bindings", () => {
  const rows = Array.from({ length: 23 }, (_, index) => Array.from({ length: index % 4 + 1 }, (_, depth) => row("approval_revisions", { approval_id: `approval-${index}`, revision_no: depth + 1 }))).flat();
  const table = payload({ approval_revisions: rows }).tables.find((table) => table.name === "approval_revisions");
  const inserted = new Map();
  const batches = [...migrationImportRowBatches(table)];
  for (const batch of batches) {
    assert.ok(batch.length * table.columns.length + 2 <= 100);
    const entries = batch.map((values) => record("approval_revisions", values));
    assert.equal(new Set(entries.map((entry) => entry.approval_id)).size, entries.length);
    for (const entry of entries) assert.equal(entry.revision_no, (inserted.get(entry.approval_id) || 0) + 1);
    for (const entry of entries) inserted.set(entry.approval_id, entry.revision_no);
  }
  assert.equal(batches.flat().length, rows.length);
  assert.ok(batches.length < rows.length);
});

test("the production-sized inventory fits the Free-plan import limit", () => {
  const counts = { approvals: 14, approval_events: 26, members: 11, member_events: 67, auth_identities: 4, account_profiles: 11, direct_messages: 1, external_archives: 24 };
  const rows = Object.fromEntries(Object.entries(counts).map(([table, count]) => [table, Array.from({ length: count }, () => row(table))]));
  rows.approval_revisions = [2, 2, 2, 4, 2, 1, 2, 2, 1, 2, 1, 1].flatMap((count, approval) => Array.from({ length: count }, (_, depth) => row("approval_revisions", { approval_id: `approval-${approval}`, revision_no: depth + 1 })));
  assert.ok(migrationImportD1QueryCount(payload(rows)) <= 50);
});

test("migration relationships validate provider subjects and same-approval archive revisions", async () => {
  const member = row("members", { id: "member-1" });
  const invalidIdentity = row("auth_identities", { id: "identity-1", member_id: "member-1", provider: "github", provider_subject: "login-name" });
  await assert.rejects(migration.assertMigrationPayloadRelationships(payload({ members: [member], auth_identities: [invalidIdentity] })), /invalid provider subject/u);

  const approval = row("approvals", { id: "approval-1" });
  const archive = row("external_archives", { id: "archive-1", approval_id: "approval-1", source_revision_hash: "f".repeat(64) });
  await assert.rejects(migration.assertMigrationPayloadRelationships(payload({ approvals: [approval], external_archives: [archive] })), /source revision reference is broken/u);
});

test("migration accepts active Feishu login identities while preserving archive retirement", async () => {
  const member = row("members", { id: "member-1" });
  const historicalIdentity = row("auth_identities", {
    id: "identity-history",
    member_id: "member-1",
    provider: "feishu",
    provider_subject: "cli_old_app:tenant_old:ou_history_1234",
    unlinked_at: "2026-09-04T00:00:00.000Z",
  });
  assert.equal(await migration.assertMigrationPayloadRelationships(payload({ members: [member], auth_identities: [historicalIdentity] })), true);

  const activeIdentity = [...historicalIdentity];
  const unlinkedAtIndex = MIGRATION_EXPORT_TABLES.find((table) => table.name === "auth_identities").columns.indexOf("unlinked_at");
  activeIdentity[unlinkedAtIndex] = null;
  assert.equal(await migration.assertMigrationPayloadRelationships(payload({ members: [member], auth_identities: [activeIdentity] })), true);

  const approval = row("approvals", { id: "approval-1" });
  const uploadedArchive = row("external_archives", { id: "archive-uploaded", approval_id: "approval-1", destination: "feishu_drive", status: "uploaded", source_revision_hash: null });
  const failedArchive = row("external_archives", { id: "archive-failed", approval_id: "approval-1", destination: "feishu_drive", status: "failed", source_revision_hash: null });
  assert.equal(await migration.assertMigrationPayloadRelationships(payload({ approvals: [approval], external_archives: [uploadedArchive, failedArchive] })), true);

  const pendingArchive = row("external_archives", { id: "archive-pending", approval_id: "approval-1", destination: "feishu_drive", status: "pending", source_revision_hash: null });
  await assert.rejects(migration.assertMigrationPayloadRelationships(payload({ approvals: [approval], external_archives: [pendingArchive] })), /pending external archive/u);

  const pendingPdfArchive = row("external_archives", { id: "archive-pdf-pending", approval_id: "approval-1", destination: "feishu_drive_pdf", status: "pending", source_revision_hash: null });
  await assert.rejects(migration.assertMigrationPayloadRelationships(payload({ approvals: [approval], external_archives: [pendingPdfArchive] })), /pending external archive/u);
});

test("target staging configuration must retain at least one external-login administrator", () => {
  const member = row("members", { id: "member-1", chatgpt_account: "admin@example.com", account_user_id: "email:admin@example.com" });
  const identity = row("auth_identities", { id: "identity-1", member_id: "member-1", provider: "github", provider_subject: "583231", unlinked_at: null });
  const migrationPayload = payload({ members: [member], auth_identities: [identity] });
  assert.equal(assertTargetAdministratorReentry(migrationPayload, {
    OA_ADMIN_EMAILS: "admin@example.com",
    OA_ADMIN_NAMES: "管理员",
    GITHUB_LOGIN_ENABLED: "true",
    GITHUB_OAUTH_CLIENT_ID: "Ov23liExampleClientId",
  }), true);
  assert.throws(() => assertTargetAdministratorReentry(migrationPayload, {
    OA_ADMIN_EMAILS: "wrong@example.com",
    OA_ADMIN_NAMES: "错误管理员",
    GITHUB_LOGIN_ENABLED: "true",
    GITHUB_OAUTH_CLIENT_ID: "Ov23liExampleClientId",
  }), /No configured target administrator/u);

  const retiredIdentity = row("auth_identities", { id: "identity-retired", member_id: "member-1", provider: "feishu", provider_subject: "cli_old_app:tenant_old:ou_history_1234", unlinked_at: "2026-09-04T00:00:00.000Z" });
  assert.throws(() => assertTargetAdministratorReentry(payload({ members: [member], auth_identities: [retiredIdentity] }), {
    OA_ADMIN_EMAILS: "admin@example.com",
    OA_ADMIN_NAMES: "管理员",
    GITHUB_LOGIN_ENABLED: "true",
    GITHUB_OAUTH_CLIENT_ID: "Ov23liExampleClientId",
    FEISHU_LOGIN_ENABLED: "true",
    FEISHU_LOGIN_APP_ID: "cli_old_app",
    FEISHU_LOGIN_TENANT_KEY: "tenant_old",
  }), /migrated GitHub or Feishu identity/u);
});

test("legacy NDA evidence is preserved without treating a missing agreement version as current admission", async () => {
  const approval = row("approvals", {
    id: "nda-1",
    type: "保密协议",
    status: "已归档",
    requester_email: "member@example.com",
  });
  const member = row("members", {
    id: "member-1",
    chatgpt_account: "member@example.com",
    nda_accepted_at: "2025-01-01T00:00:00.000Z",
    nda_approval_id: "nda-1",
    nda_agreement_version: null,
  });
  assert.equal(await migration.assertMigrationPayloadRelationships(payload({ approvals: [approval], members: [member] })), true);
});

test("terminal approval projection must exactly match its immutable revision", async () => {
  const approvalValues = row("approvals", { id: "approval-1", current_revision_no: 1 });
  const approval = record("approvals", approvalValues);
  const revision = await revisions.buildApprovalRevision({
    nextApproval: approvalProjection(approval),
    revisionNo: 1,
    previousRevisionHash: null,
    mutation: { workflowMutationRevision: "mutation-1" },
    event: { action: "created" },
  });
  approval.current_revision_hash = revision.revisionHash;
  const approvalRow = row("approvals", approval);
  const revisionRow = row("approval_revisions", {
    revision_hash: revision.revisionHash,
    approval_id: "approval-1",
    revision_no: 1,
    previous_revision_hash: null,
    mutation_revision: "mutation-1",
    state_json: revision.stateJson,
    state_hash: revision.stateHash,
    event_json: revision.eventJson,
    created_at: "2026-09-02T00:00:00.000Z",
  });
  assert.equal(await migration.assertMigrationPayloadRelationships(payload({ approvals: [approvalRow], approval_revisions: [revisionRow] })), true);

  const tamperedApproval = [...approvalRow];
  const titleIndex = MIGRATION_EXPORT_TABLES.find((table) => table.name === "approvals").columns.indexOf("title");
  tamperedApproval[titleIndex] = "tampered";
  await assert.rejects(migration.assertMigrationPayloadRelationships(payload({ approvals: [tamperedApproval], approval_revisions: [revisionRow] })), /terminal revision state/u);
});

test("direct messages may retain configured privileged participants without member rows", async () => {
  const message = row("direct_messages", { id: "message-1", sender_email: "owner@example.com", recipient_email: "member@example.com" });
  assert.equal(await migration.assertMigrationPayloadRelationships(payload({ direct_messages: [message] })), true);
});
