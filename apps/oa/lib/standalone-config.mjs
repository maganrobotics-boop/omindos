const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ACCOUNT_ID_PATTERN = /^[0-9a-f]{32}$/iu;
const ZERO_UUID = "00000000-0000-4000-8000-000000000000";
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

const STAGING = Object.freeze({
  workerName: "originmind-internal-oa-staging",
  databaseName: "originmind-internal-oa-staging",
});

function requiredStagingOrigin(environment) {
  const value = requiredText(environment, "OA_STAGING_PUBLIC_ORIGIN", 2_048);
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.port || parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) throw new Error();
    if (parsed.hostname === "oa.omindos.ai" || parsed.hostname === "oa.originmindos.com") throw new Error();
    if (!parsed.hostname.startsWith(`${STAGING.workerName}.`) || !parsed.hostname.endsWith(".workers.dev")) throw new Error();
    return parsed.origin;
  } catch {
    throw new Error(`OA_STAGING_PUBLIC_ORIGIN must be the isolated HTTPS ${STAGING.workerName}.<account-subdomain>.workers.dev origin`);
  }
}

function requiredText(environment, key, maximumLength = 4_096) {
  const value = typeof environment[key] === "string" ? environment[key].trim() : "";
  if (!value || value.length > maximumLength || CONTROL_CHARACTER_PATTERN.test(value)) {
    throw new Error(`${key} is required and must contain safe text`);
  }
  return value;
}

function optionalRolePair(environment, emailKey, nameKey) {
  const emailValue = typeof environment[emailKey] === "string" ? environment[emailKey].trim() : "";
  const nameValue = typeof environment[nameKey] === "string" ? environment[nameKey].trim() : "";
  if (!emailValue && !nameValue) return {};
  if (!emailValue || !nameValue || CONTROL_CHARACTER_PATTERN.test(emailValue) || CONTROL_CHARACTER_PATTERN.test(nameValue)) {
    throw new Error(`${emailKey} and ${nameKey} must be configured together`);
  }
  const emails = emailValue.split(",").map((value) => value.trim()).filter(Boolean);
  const names = nameValue.split(",").map((value) => value.trim()).filter(Boolean);
  if (!emails.length || emails.length !== names.length) {
    throw new Error(`${emailKey} and ${nameKey} must contain matching entries`);
  }
  return { [emailKey]: emails.join(","), [nameKey]: names.join(",") };
}

export function buildStandaloneConfig(target, environment = process.env) {
  if (target !== "staging") throw new Error("Only the isolated staging target may be generated");

  const databaseId = requiredText(environment, "OA_STAGING_D1_DATABASE_ID", 64).toLowerCase();
  if (!UUID_PATTERN.test(databaseId) || databaseId === ZERO_UUID) {
    throw new Error("OA_STAGING_D1_DATABASE_ID must be a real non-zero D1 UUID");
  }

  const accountId = requiredText(environment, "OA_STAGING_CLOUDFLARE_ACCOUNT_ID", 64).toLowerCase();
  if (!ACCOUNT_ID_PATTERN.test(accountId)) throw new Error("OA_STAGING_CLOUDFLARE_ACCOUNT_ID must be a 32-character Cloudflare account ID");
  const publicOrigin = requiredStagingOrigin(environment);

  const githubClientId = requiredText(environment, "GITHUB_OAUTH_CLIENT_ID", 128);
  if (!/^[A-Za-z0-9_-]{12,128}$/u.test(githubClientId)) {
    throw new Error("GITHUB_OAUTH_CLIENT_ID has an invalid format");
  }
  const feishuAppId = requiredText(environment, "FEISHU_LOGIN_APP_ID", 128);
  const feishuTenantKey = requiredText(environment, "FEISHU_LOGIN_TENANT_KEY", 128);
  if (!/^[A-Za-z0-9_-]{4,128}$/u.test(feishuAppId) || !/^[A-Za-z0-9_-]{4,128}$/u.test(feishuTenantKey)) {
    throw new Error("Feishu staging identifiers have an invalid format");
  }
  const privilegedRoleVars = {
    ...optionalRolePair(environment, "OA_ADMIN_EMAILS", "OA_ADMIN_NAMES"),
    ...optionalRolePair(environment, "OA_PROJECT_OWNER_EMAILS", "OA_PROJECT_OWNER_NAMES"),
    ...optionalRolePair(environment, "OA_FINANCE_OWNER_EMAILS", "OA_FINANCE_OWNER_NAMES"),
  };
  if (!privilegedRoleVars.OA_ADMIN_EMAILS) {
    throw new Error("OA_ADMIN_EMAILS and OA_ADMIN_NAMES are required for staging bootstrap");
  }

  return {
    $schema: "../../node_modules/wrangler/config-schema.json",
    account_id: accountId,
    name: STAGING.workerName,
    main: "../../worker/standalone.ts",
    compatibility_date: "2026-05-15",
    compatibility_flags: ["nodejs_compat"],
    workers_dev: true,
    preview_urls: false,
    // Let Cloudflare serve matching immutable JS/CSS/public assets directly,
    // while preventing a future static file from shadowing dynamic endpoints.
    // Other unmatched requests (including `/`) still fall through to the Worker.
    assets: {
      binding: "ASSETS",
      not_found_handling: "none",
      run_worker_first: ["/api/*", "/_vinext/*", "/__vinext/*"],
    },
    images: { binding: "IMAGES" },
    d1_databases: [{
      binding: "DB",
      database_name: STAGING.databaseName,
      database_id: databaseId,
      migrations_dir: "../../drizzle",
    }],
    vars: {
      OA_PUBLIC_ORIGIN: publicOrigin,
      CHATGPT_LOGIN_ENABLED: "false",
      GITHUB_LOGIN_ENABLED: "true",
      GITHUB_OAUTH_CLIENT_ID: githubClientId,
      FEISHU_LOGIN_ENABLED: "true",
      FEISHU_LOGIN_APP_ID: feishuAppId,
      FEISHU_LOGIN_TENANT_KEY: feishuTenantKey,
      FEISHU_PDF_ARCHIVE_ENABLED: "true",
      OA_MIGRATION_EXPORT_ENABLED: "false",
      OA_MIGRATION_WRITE_FROZEN: "false",
      OA_MIGRATION_UNFREEZE_ENABLED: "false",
      ...privilegedRoleVars,
    },
    secrets: { required: ["GITHUB_OAUTH_CLIENT_SECRET", "FEISHU_LOGIN_APP_SECRET"] },
    observability: { enabled: true },
  };
}

export const standaloneTargets = Object.freeze({ staging: STAGING });
