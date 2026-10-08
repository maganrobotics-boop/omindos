import test from 'node:test';
import assert from 'node:assert/strict';
import { needsInternationalDeployment } from '../scripts/website-release-scope.mjs';

test('Chinese pages and their exclusive assets do not publish the international site', () => {
  assert.equal(needsInternationalDeployment([
    'apps/website/cn/robots/index.html', 'apps/website/cn/research-prototypes.css',
    'apps/website/assets/articulated-product-20261006.css',
    'apps/website/assets/articulated-research-model-20261006.png',
    'tests/website.test.mjs', '.github/workflows/deploy-website.yml',
  ]), false);
});
test('English pages, shared assets and the Worker still require international deployment', () => {
  for (const path of ['apps/website/en/robots/index.html', 'apps/website/product-details.css',
    'apps/website/site.js', 'apps/website/_worker.js', 'apps/website/assets/new-shared-image.png']) {
    assert.equal(needsInternationalDeployment(['apps/website/cn/robots/index.html', path]), true, path);
  }
});
test('documentation and tests alone never publish', () => {
  assert.equal(needsInternationalDeployment(['docs/website-deployment.md', 'tests/website.test.mjs']), false);
});
