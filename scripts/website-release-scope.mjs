import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Both language trees are published on .ai. Build/routing changes also deploy.
export function needsInternationalDeployment(paths) {
  return paths.some(path => path.startsWith('apps/website/') ||
    ['scripts/prepare-international-artifact.py', 'scripts/website-release-scope.mjs',
     '.github/workflows/deploy-website.yml'].includes(path));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  let deploy = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';
  if (process.env.GITHUB_EVENT_NAME === 'push') {
    // Missing history is a failed gate, never permission to publish.
    if (!event.before || /^0+$/.test(event.before)) throw new Error('A known previous commit is required');
    const paths = execFileSync('git', ['diff', '--name-only', '-z', event.before, process.env.GITHUB_SHA], {encoding:'utf8'})
      .split('\0').filter(Boolean);
    deploy = needsInternationalDeployment(paths);
  }
  appendFileSync(process.env.GITHUB_OUTPUT, `deploy_international=${deploy}\n`);
  console.log(`International deployment required: ${deploy}`);
}
