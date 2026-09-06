import { inspectRevisionChain, type ApprovalRevision } from "./approval-revisions";
import { canonicalJson } from "./canonical-json";

type MigrationTable = {
  name: string;
  columns: string[];
  rows: Array<Array<string | number | null>>;
  rowCount: number;
  sha256: string;
};

export type MigrationPayload = {
  tables: MigrationTable[];
  manifestSha256: string;
  schemaSha256: string;
  freezeId: string;
};

export {
  migrationImportD1QueryCount,
  migrationImportInsertStatementCount,
  MIGRATION_IMPORT_MAX_D1_QUERIES,
  MIGRATION_IMPORT_TABLE_ORDER,
} from "./migration-import-plan.mjs";

function tableRecord(payload: MigrationPayload, name: string) {
  const table = payload.tables.find((candidate) => candidate.name === name);
  if (!table) throw new Error(`Migration table ${name} is missing`);
  return {
    table,
    rows: table.rows.map((row) => Object.fromEntries(table.columns.map((column, index) => [column, row[index]])) as Record<string, string | number | null>),
  };
}

function requiredText(row: Record<string, string | number | null>, key: string) {
  const value = row[key];
  if (typeof value !== "string" || !value) throw new Error(`Migration row is missing ${key}`);
  return value;
}

function optionalText(row: Record<string, string | number | null>, key: string) {
  const value = row[key];
  if (value !== null && typeof value !== "string") throw new Error(`Migration row has an invalid ${key}`);
  return value;
}

function requiredInteger(row: Record<string, string | number | null>, key: string) {
  const value = row[key];
  if (!Number.isSafeInteger(value)) throw new Error(`Migration row has an invalid ${key}`);
  return value as number;
}

function uniqueIds(rows: Array<Record<string, string | number | null>>, key: string, table: string) {
  const ids = new Set<string | number>();
  for (const row of rows) {
    const id = row[key];
    if ((typeof id !== "string" || !id) && !Number.isSafeInteger(id)) throw new Error(`Migration table ${table} has an invalid ${key}`);
    if (ids.has(id as string | number)) throw new Error(`Migration table ${table} has a duplicate ${key}`);
    ids.add(id as string | number);
  }
  return ids;
}

function assertReferences(rows: Array<Record<string, string | number | null>>, key: string, referenced: Set<string | number>, label: string) {
  for (const row of rows) {
    if (!referenced.has(row[key] as string | number)) throw new Error(`Migration ${label} reference is broken`);
  }
}

function parseJsonObject(value: string, label: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`Migration ${label} JSON is invalid`);
  }
}

const APPROVAL_PROJECTION_COLUMNS = Object.freeze([
  ["id", "id"],
  ["type", "type"],
  ["title", "title"],
  ["project", "project"],
  ["requester_name", "requesterName"],
  ["requester_email", "requesterEmail"],
  ["client_creation_key", "clientCreationKey"],
  ["business_key", "businessKey"],
  ["created_at", "createdAt"],
  ["updated_at", "updatedAt"],
  ["status", "status"],
  ["current_step", "currentStep"],
  ["current_reviewer_name", "currentReviewerName"],
  ["current_reviewer_email", "currentReviewerEmail"],
  ["summary", "summary"],
  ["owner", "owner"],
  ["amount", "amount"],
  ["period_key", "periodKey"],
  ["signers_json", "signersJson"],
  ["payload_json", "payloadJson"],
] as const);

function approvalProjection(row: Record<string, string | number | null>) {
  return Object.fromEntries(APPROVAL_PROJECTION_COLUMNS.map(([column, property]) => [property, row[column]]));
}

export async function assertMigrationPayloadRelationships(payload: MigrationPayload) {
  const approvals = tableRecord(payload, "approvals").rows;
  const approvalEvents = tableRecord(payload, "approval_events").rows;
  const approvalRevisions = tableRecord(payload, "approval_revisions").rows;
  const laborClaims = tableRecord(payload, "labor_source_claims").rows;
  const archives = tableRecord(payload, "external_archives").rows;
  const members = tableRecord(payload, "members").rows;
  const memberEvents = tableRecord(payload, "member_events").rows;
  const identities = tableRecord(payload, "auth_identities").rows;
  const messages = tableRecord(payload, "direct_messages").rows;

  const approvalIds = uniqueIds(approvals, "id", "approvals");
  const memberIds = uniqueIds(members, "id", "members");
  uniqueIds(approvalEvents, "id", "approval_events");
  uniqueIds(approvalRevisions, "revision_hash", "approval_revisions");
  uniqueIds(laborClaims, "id", "labor_source_claims");
  uniqueIds(archives, "id", "external_archives");
  uniqueIds(memberEvents, "id", "member_events");
  uniqueIds(identities, "id", "auth_identities");
  uniqueIds(messages, "id", "direct_messages");

  assertReferences(approvalEvents, "approval_id", approvalIds, "approval event");
  assertReferences(approvalRevisions, "approval_id", approvalIds, "approval revision");
  assertReferences(archives, "approval_id", approvalIds, "external archive");
  const deletedMemberTrails = new Map<string, Array<Record<string, string | number | null>>>();
  for (const event of memberEvents) {
    const memberId = requiredText(event, "member_id");
    if (memberIds.has(memberId)) continue;
    const trail = deletedMemberTrails.get(memberId) ?? [];
    trail.push(event);
    deletedMemberTrails.set(memberId, trail);
  }
  // Earlier OA versions deliberately kept audit events after deleting a member.
  // Preserve that evidence without recreating the deleted identity or its access.
  for (const trail of deletedMemberTrails.values()) {
    trail.sort((left, right) => requiredInteger(left, "id") - requiredInteger(right, "id"));
    if (trail.at(-1)?.action !== "delete") throw new Error("Migration member event reference is broken without a terminal deletion event");
  }
  assertReferences(identities, "member_id", memberIds, "authentication identity");
  assertReferences(laborClaims, "claimant_member_id", memberIds, "labor claimant");
  assertReferences(laborClaims, "technical_approval_id", approvalIds, "technical approval");
  assertReferences(laborClaims, "labor_approval_id", approvalIds, "labor approval");

  for (const message of messages) {
    requiredText(message, "sender_email");
    requiredText(message, "recipient_email");
  }

  for (const identity of identities) {
    const provider = requiredText(identity, "provider");
    if (provider !== "github" && provider !== "feishu") throw new Error("Migration authentication identity has an unsupported provider");
    const subject = requiredText(identity, "provider_subject");
    if (provider === "github" && !/^[1-9]\d{0,31}$/u.test(subject)) throw new Error("Migration GitHub identity has an invalid provider subject");
    if (provider === "feishu" && !/^[A-Za-z0-9_-]{4,128}:[A-Za-z0-9_-]{4,128}:ou[-_][A-Za-z0-9_-]{4,125}$/u.test(subject)) throw new Error("Migration Feishu identity has an invalid provider subject");
  }

  const revisionsByApproval = new Map<string, ApprovalRevision[]>();
  const revisionOwnerByHash = new Map<string, string>();
  for (const row of approvalRevisions) {
    const approvalId = requiredText(row, "approval_id");
    const revision: ApprovalRevision = {
      revisionHash: requiredText(row, "revision_hash"),
      revisionNo: requiredInteger(row, "revision_no"),
      previousRevisionHash: optionalText(row, "previous_revision_hash"),
      stateJson: requiredText(row, "state_json"),
      stateHash: requiredText(row, "state_hash"),
      eventJson: requiredText(row, "event_json"),
    };
    revisionOwnerByHash.set(revision.revisionHash, approvalId);
    const existing = revisionsByApproval.get(approvalId) ?? [];
    existing.push(revision);
    revisionsByApproval.set(approvalId, existing);
  }
  const sortedRevisionRows = [...approvalRevisions].sort((left, right) => {
    const leftApproval = requiredText(left, "approval_id");
    const rightApproval = requiredText(right, "approval_id");
    if (leftApproval < rightApproval) return -1;
    if (leftApproval > rightApproval) return 1;
    return requiredInteger(left, "revision_no") - requiredInteger(right, "revision_no");
  });
  if (sortedRevisionRows.some((row, index) => row !== approvalRevisions[index])) throw new Error("Migration approval revisions are not in deterministic chain order");
  for (const approval of approvals) {
    const id = requiredText(approval, "id");
    const revisionNo = requiredInteger(approval, "current_revision_no");
    const revisionHash = optionalText(approval, "current_revision_hash");
    const revisions = revisionsByApproval.get(id) ?? [];
    if (revisionNo === 0) {
      if (revisionHash !== null || revisions.length) throw new Error(`Migration approval ${id} has an inconsistent empty revision pointer`);
      continue;
    }
    const inspection = await inspectRevisionChain(revisions);
    if (!inspection.valid) throw new Error(`Migration approval ${id} has an invalid revision chain: ${inspection.reason}`);
    const terminal = revisions.at(-1);
    if (!terminal || terminal.revisionNo !== revisionNo || terminal.revisionHash !== revisionHash) throw new Error(`Migration approval ${id} has an inconsistent terminal revision pointer`);
    if (canonicalJson(approvalProjection(approval)) !== terminal.stateJson) throw new Error(`Migration approval ${id} does not match its terminal revision state`);
  }

  for (const archive of archives) {
    const destination = requiredText(archive, "destination");
    const status = requiredText(archive, "status");
    if (status === "pending") throw new Error(`Migration contains a pending external archive (${destination})`);
    const sourceRevisionHash = optionalText(archive, "source_revision_hash");
    if (sourceRevisionHash !== null && revisionOwnerByHash.get(sourceRevisionHash) !== requiredText(archive, "approval_id")) {
      throw new Error("Migration external archive source revision reference is broken");
    }
  }

  const approvalsById = new Map(approvals.map((row) => [requiredText(row, "id"), row]));
  for (const member of members) {
    const ndaAcceptedAt = optionalText(member, "nda_accepted_at");
    const ndaApprovalId = optionalText(member, "nda_approval_id");
    const ndaAgreementVersion = optionalText(member, "nda_agreement_version");
    if (ndaAcceptedAt === null && ndaApprovalId === null && ndaAgreementVersion === null) continue;
    if ((ndaAcceptedAt === null) !== (ndaApprovalId === null)) throw new Error("Migration member has incomplete historical NDA evidence");
    if (ndaAcceptedAt === null || ndaApprovalId === null) throw new Error("Migration member has an agreement version without NDA evidence");
    const ndaApproval = approvalsById.get(ndaApprovalId as string);
    if (!ndaApproval || ndaApproval.type !== "保密协议" || ndaApproval.status !== "已归档") throw new Error("Migration member NDA approval reference is invalid");
    if (requiredText(ndaApproval, "requester_email").toLowerCase() !== requiredText(member, "chatgpt_account").toLowerCase()) throw new Error("Migration member NDA email does not match");
    if (ndaAgreementVersion === null) continue;
    const ndaPayload = parseJsonObject(requiredText(ndaApproval, "payload_json"), "NDA payload");
    if (ndaPayload.agreementVersion !== ndaAgreementVersion || ndaPayload.signerAccountUserId !== member.account_user_id) throw new Error("Migration member NDA subject or version does not match");
  }

  return true;
}
