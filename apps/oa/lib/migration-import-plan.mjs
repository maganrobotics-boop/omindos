export const MIGRATION_IMPORT_TABLE_ORDER = Object.freeze([
  "approvals",
  "members",
  "auth_identities",
  "account_profiles",
  "approval_revisions",
  "approval_events",
  "member_events",
  "labor_source_claims",
  "external_archives",
  "direct_messages",
]);

export const MIGRATION_IMPORT_MAX_D1_QUERIES = 50;
const MIGRATION_IMPORT_FIXED_D1_QUERIES = 18;

export function migrationImportInsertStatementCount(payload) {
  let statements = 0;
  for (const tableName of MIGRATION_IMPORT_TABLE_ORDER) {
    const table = payload?.tables?.find((candidate) => candidate.name === tableName);
    if (!table || !Array.isArray(table.columns) || !table.columns.length || !Array.isArray(table.rows)) throw new Error(`Migration table ${tableName} is missing or malformed`);
    const maximumRowsPerStatement = table.name === "approval_revisions" ? 1 : Math.max(1, Math.floor((100 - 2) / table.columns.length));
    statements += Math.ceil(table.rows.length / maximumRowsPerStatement);
  }
  return statements;
}

export function migrationImportD1QueryCount(payload) {
  return MIGRATION_IMPORT_FIXED_D1_QUERIES + migrationImportInsertStatementCount(payload);
}

function tableRecords(payload, name) {
  const table = payload?.tables?.find((candidate) => candidate.name === name);
  if (!table || !Array.isArray(table.columns) || !Array.isArray(table.rows)) throw new Error(`Migration table ${name} is missing or malformed`);
  return table.rows.map((row) => Object.fromEntries(table.columns.map((column, index) => [column, row[index]])));
}

function normalizedEmail(value) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  const at = email.indexOf("@");
  if (!email || email.length > 254 || at <= 0 || at !== email.lastIndexOf("@") || at === email.length - 1 || /[\s|]/u.test(email)) throw new Error("Target administrator email is invalid");
  return email;
}

export function assertTargetAdministratorReentry(payload, variables) {
  const administratorEmails = typeof variables?.OA_ADMIN_EMAILS === "string"
    ? variables.OA_ADMIN_EMAILS.split(",").map(normalizedEmail)
    : [];
  const administratorNames = typeof variables?.OA_ADMIN_NAMES === "string"
    ? variables.OA_ADMIN_NAMES.split(",").map((value) => value.trim()).filter(Boolean)
    : [];
  if (!administratorEmails.length || administratorEmails.length !== administratorNames.length || new Set(administratorEmails).size !== administratorEmails.length) throw new Error("Target administrator tuple is invalid");
  const members = tableRecords(payload, "members");
  const identities = tableRecords(payload, "auth_identities");
  const githubEnabled = variables?.GITHUB_LOGIN_ENABLED === "true";
  const feishuPrefix = variables?.FEISHU_LOGIN_ENABLED === "true"
    && typeof variables.FEISHU_LOGIN_APP_ID === "string"
    && typeof variables.FEISHU_LOGIN_TENANT_KEY === "string"
    ? `${variables.FEISHU_LOGIN_APP_ID}:${variables.FEISHU_LOGIN_TENANT_KEY}:`
    : "";
  for (const email of administratorEmails) {
    const member = members.find((row) => row.status === "active"
      && row.chatgpt_account === email
      && row.account_user_id === `email:${email}`);
    if (!member || typeof member.id !== "string" || !member.id) continue;
    const canReenter = identities.some((identity) => {
      if (identity.member_id !== member.id || identity.unlinked_at !== null || typeof identity.provider_subject !== "string") return false;
      if (identity.provider === "github" && githubEnabled) return /^[1-9]\d{0,31}$/u.test(identity.provider_subject);
      if (identity.provider === "feishu" && feishuPrefix && identity.provider_subject.startsWith(feishuPrefix)) {
        return /^ou[-_][A-Za-z0-9_-]{4,125}$/u.test(identity.provider_subject.slice(feishuPrefix.length));
      }
      return false;
    });
    if (canReenter) return true;
  }
  throw new Error("No configured target administrator can re-enter with a migrated GitHub or Feishu identity");
}
