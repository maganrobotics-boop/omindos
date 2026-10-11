import test from 'node:test';
import assert from 'node:assert/strict';
import { needsInternationalDeployment } from '../scripts/website-release-scope.mjs';

test('both languages, media and build configuration publish the bilingual site', () => {
  for (const path of ['apps/website/cn/robots/index.html', 'apps/website/cn/research-prototypes.css',
    'apps/website/assets/articulated-product-20261006.css', 'apps/website/en/robots/index.html',
    'apps/website/site.js', 'apps/website/_worker.js', 'scripts/prepare-international-artifact.py',
    '.github/workflows/deploy-website.yml']) {
    assert.equal(needsInternationalDeployment([path]), true, path);
  }
});
test('documentation and tests alone never publish', () => {
  assert.equal(needsInternationalDeployment(['docs/website-deployment.md', 'tests/website.test.mjs']), false);
});
