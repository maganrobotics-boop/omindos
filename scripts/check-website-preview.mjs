import assert from 'node:assert/strict';
import {readFile,writeFile,appendFile} from 'node:fs/promises';
const account='41e8b3404be24e1dd288556d77ffc951', project='omindos-website';
assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID,account);
assert.equal(process.env.GITHUB_EVENT_NAME,'workflow_dispatch');
assert.equal(process.env.GITHUB_REF,'refs/heads/main');
const token=process.env.CLOUDFLARE_API_TOKEN;
assert.ok(token,'Missing provider-managed Pages token');
const base=`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${project}`;
async function get(suffix=''){
  const r=await fetch(base+suffix,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});
  assert.equal(r.status,200,`Pages preview lookup returned HTTP ${r.status}`);
  const body=await r.json();assert.equal(body.success,true);return body.result;
}
const p=await get();assert.equal(p.name,project);assert.equal(p.production_branch,'main');
assert.ok(p.domains.includes('omindos.ai'));
const canonical=p.canonical_deployment?.id;assert.ok(canonical);
if(process.argv.includes('--before')){
  await writeFile('/tmp/omindos-preview-baseline.json',JSON.stringify({id:canonical,commit:p.canonical_deployment.deployment_trigger?.metadata?.commit_hash}));
  console.log(`Preserved production deployment ${canonical}`);
}else{
  assert.ok(process.argv.includes('--after'));
  const baseline=JSON.parse(await readFile('/tmp/omindos-preview-baseline.json','utf8'));
  assert.equal(canonical,baseline.id,'Preview changed production deployment');
  const id=process.env.EXPECTED_DEPLOYMENT_ID;assert.match(id??'',/^[a-f\d-]{36}$/);
  const preview=await get('/deployments/'+id);
  assert.equal(preview.environment,'preview');assert.equal(preview.latest_stage?.status,'success');
  assert.equal(preview.deployment_trigger?.metadata?.commit_hash,process.env.GITHUB_SHA);
  const url=new URL(preview.url);assert.ok(url.hostname.endsWith('.omindos-website.pages.dev'));
  console.log(`Verified public preview: ${url.origin}/en/`);
  console.log(`Production unchanged: ${canonical}`);
  if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`Public English preview: ${url.origin}/en/\n\nThis preview is public, not access-controlled. Production remains ${canonical}.\n`);
}
