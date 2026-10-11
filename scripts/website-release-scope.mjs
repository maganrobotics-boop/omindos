import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Both languages share the international artifact; scope does not authorize
// publication ahead of the Chinese production site.
export function needsInternationalDeployment(paths) {
  return paths.some(path => path.startsWith('apps/website/') ||
    ['scripts/prepare-international-artifact.py', 'scripts/website-release-scope.mjs',
     '.github/workflows/deploy-website.yml'].includes(path));
}

export function isInternationalReleaseEvent(eventName, ref) {
  return eventName === 'workflow_dispatch' && ref === 'refs/heads/main';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const deploy = isInternationalReleaseEvent(process.env.GITHUB_EVENT_NAME, process.env.GITHUB_REF);
  appendFileSync(process.env.GITHUB_OUTPUT, 'deploy_international=' + deploy + '\n');
  console.log(deploy ? 'International release explicitly requested after Chinese acceptance'
    : 'Tests only: prioritize omindos.cn; international sync is deferred');
}
