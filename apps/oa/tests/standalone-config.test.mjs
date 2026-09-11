import assert from "node:assert/strict";
import test from "node:test";

import { buildStandaloneConfig, standaloneTargets } from "../lib/standalone-config.mjs";

const validEnvironment = {
  OA_STAGING_CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  OA_STAGING_D1_DATABASE_ID: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  OA_STAGING_PUBLIC_ORIGIN: "https://originmind-internal-oa-staging.example.workers.dev",
  GITHUB_OAUTH_CLIENT_ID: "Ov23liExampleClientId",
  FEISHU_LOGIN_APP_ID: "cli_example_app_id",
  FEISHU_LOGIN_TENANT_KEY: "tenant_example_key",
  OA_ADMIN_EMAILS: "admin@example.com",
  OA_ADMIN_NAMES: "OA Admin",
};

test("standalone staging config is isolated and contains every runtime binding", () => {
  const config = buildStandaloneConfig("staging", validEnvironment);
  assert.equal(config.name, standaloneTargets.staging.workerName);
  assert.equal(config.account_id, validEnvironment.OA_STAGING_CLOUDFLARE_ACCOUNT_ID);
  assert.equal(config.main, "../../worker/standalone.ts");
  assert.deepEqual(config.assets, {
    binding: "ASSETS",
    not_found_handling: "none",
    run_worker_first: ["/api/*", "/_vinext/*", "/__vinext/*"],
  });
  assert.deepEqual(config.images, { binding: "IMAGES" });
  assert.equal(config.d1_databases[0].binding, "DB");
  assert.equal(config.d1_databases[0].database_id, validEnvironment.OA_STAGING_D1_DATABASE_ID);
  assert.equal(config.vars.OA_PUBLIC_ORIGIN, validEnvironment.OA_STAGING_PUBLIC_ORIGIN);
  assert.equal(config.vars.OA_MIGRATION_EXPORT_ENABLED, "false");
  assert.equal(config.vars.OA_MIGRATION_WRITE_FROZEN, "false");
  assert.equal(config.vars.OA_MIGRATION_UNFREEZE_ENABLED, "false");
  assert.equal(config.vars.CHATGPT_LOGIN_ENABLED, "false");
  assert.equal(config.vars.GITHUB_LOGIN_ENABLED, "true");
  assert.equal(config.vars.FEISHU_LOGIN_ENABLED, "true");
  assert.equal(config.vars.FEISHU_LOGIN_APP_ID, validEnvironment.FEISHU_LOGIN_APP_ID);
  assert.equal(config.vars.FEISHU_LOGIN_TENANT_KEY, validEnvironment.FEISHU_LOGIN_TENANT_KEY);
  assert.equal(config.vars.FEISHU_PDF_ARCHIVE_ENABLED, "true");
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.secrets.required, ["GITHUB_OAUTH_CLIENT_SECRET", "FEISHU_LOGIN_APP_SECRET"]);
  assert.doesNotMatch(JSON.stringify(config.vars), /secret|token/iu);
});

test("standalone staging config rejects placeholders, missing admin tuples, and unsafe origins", () => {
  assert.throws(() => buildStandaloneConfig("staging", {
    ...validEnvironment,
    OA_STAGING_D1_DATABASE_ID: "00000000-0000-4000-8000-000000000000",
  }), /real non-zero D1 UUID/u);
  assert.throws(() => buildStandaloneConfig("staging", {
    ...validEnvironment,
    OA_ADMIN_NAMES: "",
  }), /configured together/u);
  assert.throws(() => buildStandaloneConfig("staging", {
    ...validEnvironment,
    OA_STAGING_PUBLIC_ORIGIN: "https://oa.omindos.ai",
  }), /isolated HTTPS/u);
  assert.throws(() => buildStandaloneConfig("staging", {
    ...validEnvironment,
    OA_STAGING_PUBLIC_ORIGIN: "https://oa.originmindos.com",
  }), /isolated HTTPS/u);
  assert.throws(() => buildStandaloneConfig("staging", {
    ...validEnvironment,
    OA_STAGING_PUBLIC_ORIGIN: "https://oa-staging.originmindos.com",
  }), /workers\.dev origin/u);
  assert.throws(() => buildStandaloneConfig("staging", {
    ...validEnvironment,
    OA_STAGING_PUBLIC_ORIGIN: "https://another-worker.example.workers.dev",
  }), /workers\.dev origin/u);
  assert.throws(() => buildStandaloneConfig("staging", {
    ...validEnvironment,
    OA_STAGING_PUBLIC_ORIGIN: "https://originmind-internal-oa-staging.example.workers.dev:8443",
  }), /workers\.dev origin/u);
});

test("standalone production config is fixed and cannot be redirected by the environment", () => {
  const config = buildStandaloneConfig("production", {
    CLOUDFLARE_ACCOUNT_ID: "ffffffffffffffffffffffffffffffff",
    OA_PUBLIC_ORIGIN: "https://attacker.example",
    OA_STAGING_D1_DATABASE_ID: "00000000-0000-4000-8000-000000000000",
  });
  assert.deepEqual(config, {
    $schema: "../../node_modules/wrangler/config-schema.json",
    account_id: "41e8b3404be24e1dd288556d77ffc951",
    name: "originmind-internal-oa-staging",
    main: "../../worker/standalone.ts",
    compatibility_date: "2026-05-15",
    compatibility_flags: ["nodejs_compat"],
    workers_dev: false,
    preview_urls: false,
    keep_vars: true,
    assets: {
      binding: "ASSETS",
      not_found_handling: "none",
      run_worker_first: ["/api/*", "/_vinext/*", "/__vinext/*"],
    },
    images: { binding: "IMAGES" },
    d1_databases: [
      {
        binding: "DB",
        database_name: "originmind-internal-oa-production",
        database_id: "34af7e92-7da5-47cd-b7c0-1270e157c0e6",
        migrations_dir: "../../drizzle",
      },
      {
        binding: "WEBSITE_DB",
        database_name: "omindos-website-visits",
        database_id: "3651ff92-d9fb-45aa-9d1d-623d25bf3459",
      },
    ],
    vars: { OA_PUBLIC_ORIGIN: "https://oa.omindos.ai" },
    triggers: { crons: ["* * * * *"] },
    secrets: { required: ["GITHUB_OAUTH_CLIENT_SECRET", "FEISHU_LOGIN_APP_SECRET"] },
    observability: { enabled: true },
  });
  assert.equal("route" in config, false);
  assert.equal("routes" in config, false);
  assert.throws(() => buildStandaloneConfig("preview", validEnvironment), /Only staging or production/u);
});
