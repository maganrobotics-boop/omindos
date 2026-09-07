import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

const account = '41e8b3404be24e1dd288556d77ffc951';
const projectName = 'omindos-website';
const databaseId = '3651ff92-d9fb-45aa-9d1d-623d25bf3459';
assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID, account, 'Unexpected Cloudflare account');
const token = process.env.CLOUDFLARE_API_TOKEN;
assert.ok(token, 'CLOUDFLARE_API_TOKEN is missing from GitHub Actions Secrets');
const deployed = process.argv.includes('--deployed');
if (deployed) {
  assert.match(process.env.EXPECTED_COMMIT_SHA ?? '', /^[a-f0-9]{40}$/, 'A full deployed commit SHA is required');
  assert.ok(process.env.EXPECTED_DEPLOYMENT_ID, 'Wrangler did not return a deployment ID');
}

async function checkProject() {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${projectName}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  // Do not include authorization headers or response bodies in error logs.
  assert.equal(response.status, 200, `Cloudflare project lookup returned HTTP ${response.status}`);
  const payload = await response.json();
  assert.equal(payload.success, true, 'Cloudflare project lookup failed');
  const project = payload.result;
  assert.equal(project.name, projectName);
  assert.equal(project.production_branch, 'main');
  assert.ok(project.domains.includes('omindos.ai'), 'Production domain is missing');
  assert.equal(project.deployment_configs.production.d1_databases?.VISITS_DB?.id, databaseId, 'Statistics database binding changed');
  if (deployed) {
    const live = project.canonical_deployment;
    assert.equal(live?.id, process.env.EXPECTED_DEPLOYMENT_ID, 'Production deployment ID has not updated');
    assert.equal(live?.deployment_trigger?.metadata?.commit_hash, process.env.EXPECTED_COMMIT_SHA, 'Production commit does not match this workflow');
    assert.equal(live?.latest_stage?.status, 'success', 'Production deployment did not succeed');
    console.log(`Verified production deployment ${live.id} at commit ${process.env.EXPECTED_COMMIT_SHA}`);
  }
  console.log('Verified omindos-website, main branch, omindos.ai, and the existing VISITS_DB binding');
}

for (let attempt = 1; ; attempt++) {
  try { await checkProject(); break; }
  catch (error) {
    if (attempt === (deployed ? 6 : 2)) throw error;
    await delay(5_000);
  }
}
