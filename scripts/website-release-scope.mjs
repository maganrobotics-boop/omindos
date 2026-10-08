import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// These assets are referenced only by the Chinese research prototype pages.
const chineseAssets = new Set([
  'apps/website/assets/articulated-product-20261006.css',
  'apps/website/assets/articulated-research-model-20261006.png',
]);
export function needsInternationalDeployment(paths) {
  return paths.some(path => path.startsWith('apps/website/') &&
    !path.startsWith('apps/website/cn/') && !chineseAssets.has(path));
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
