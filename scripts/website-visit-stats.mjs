import assert from 'node:assert/strict';
import { appendFile, readFile } from 'node:fs/promises';

// Run only in the established, explicitly dispatched production release job,
// after check-website-project.mjs verifies account, project, and D1 binding.
const account = '41e8b3404be24e1dd288556d77ffc951';
const database = '3651ff92-d9fb-45aa-9d1d-623d25bf3459';
assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID, account, 'Unexpected Cloudflare account');
assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch', 'Explicit production dispatch required');
assert.equal(process.env.GITHUB_REF, 'refs/heads/main', 'Production main required');
const token = process.env.CLOUDFLARE_API_TOKEN;
assert.ok(token, 'CLOUDFLARE_API_TOKEN is missing from GitHub Actions Secrets');
const mode = process.argv[2];
assert.ok(['--prepare', '--report'].includes(mode), 'Choose --prepare or --report');

async function query(sql, params = []) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }), signal: AbortSignal.timeout(20_000),
  });
  // Do not print response bodies, credentials, row-level logs, or OEM data.
  assert.equal(response.status, 200, `Statistics database query returned HTTP ${response.status}`);
  const payload = await response.json();
  assert.equal(payload.success, true, 'Statistics database query failed');
  assert.ok(Array.isArray(payload.result) && payload.result.every(item => item.success), 'Statistics database statement failed');
  return payload.result[0]?.results || [];
}

async function summarize(title, data) {
  const output = JSON.stringify(data, null, 2);
  console.log(`${title}\n${output}`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `### ${title}\n\nAggregate page-view events only; not unique visitors or online users. The .cn collector is separate.\n\n\`\`\`json\n${output}\n\`\`\`\n\n`);
}

if (mode === '--prepare') {
  // These reads neither repair nor reinterpret old counts. They document a
  // legacy baseline before the isolated v2 schema and collector are activated.
  const minute = Math.floor(Date.now() / 60_000);
  await summarize('omindos.ai legacy unfiltered baseline', {
    observedAt: new Date().toISOString(), collection: 'legacy_unfiltered_page_loads',
    total: await query('SELECT visits FROM visit_totals WHERE id = 1'),
    last24HoursByMinute: await query('SELECT COALESCE(SUM(visits), 0) AS visits FROM visit_recent WHERE minute_bucket >= ? AND minute_bucket <= ?', [minute - 1439, minute]),
    topCountries: await query('SELECT country_code, visits FROM visit_country ORDER BY visits DESC, country_code LIMIT 10'),
    limitation: 'Historical automation and people cannot be separated retrospectively from these aggregates.',
  });
  const migration = await readFile(new URL('../migrations/website/0003_filtered_visit_stats.sql', import.meta.url), 'utf8');
  for (const statement of migration.replace(/^--.*$/gm, '').split(';').map(value => value.trim()).filter(Boolean)) {
    await query(statement);
  }
  console.log('Prepared isolated v2 aggregate tables. Legacy counts and OEM tables were not modified.');
}

await summarize('omindos.ai filtered collection v2', {
  observedAt: new Date().toISOString(), collection: 'filtered_page_view_events_v2',
  metadata: await query('SELECT first_event_at, metric FROM visit_collection_v2 WHERE id = 1'),
  classifications: await query('SELECT classification, visits FROM visit_totals_v2 ORDER BY classification'),
  acceptedPageViews: await query("SELECT COALESCE(SUM(visits), 0) AS visits FROM visit_totals_v2 WHERE classification IN ('accepted_unknown', 'accepted_scored')"),
  acceptedTopCountries: await query("SELECT country_code, SUM(visits) AS visits FROM visit_country_v2 WHERE classification IN ('accepted_unknown', 'accepted_scored') GROUP BY country_code ORDER BY visits DESC, country_code LIMIT 10"),
  limitation: 'Accepted events can still include undetected automation. Missing or zero bot scores are unknown. Excluded events are audit counts only; no human, unique-visitor or online count is inferred.',
});
