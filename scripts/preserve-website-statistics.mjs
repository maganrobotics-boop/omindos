import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// The last verified production before the English homepage release.
export const BASELINE_COMMIT = '9a76b841d330f43fab07566875949714afee3995';
export function preserveClientVersion(html) {
  // A later filtered-v2 release must never reuse the cached legacy collector.
  return html.replaceAll('/portal-client.js?v=20261017-filtered-visits', '/portal-client.js?v=20261018-preserve-9a76b841');
}

export function baselineFile(path) {
  return execFileSync('git', ['show', `${BASELINE_COMMIT}:${path}`], { encoding: 'utf8' });
}

function bounds(source, start, end) {
  assert.equal(source.split(start).length, 2, `Expected one ${start}`);
  assert.equal(source.split(end).length, 2, `Expected one ${end}`);
  const from = source.indexOf(start), to = source.indexOf(end);
  assert.ok(to > from, 'Collector boundaries are out of order');
  return [from, to];
}

export function preserveWorker(current, baseline) {
  // Only these two analytics regions change. OEM, routing, assets and all
  // English entry behavior remain byte-for-byte from the release source.
  for (const [start, oldStart, end] of [
    ['function isSameOriginBrowserRequest(', 'function isSameSiteBrowserRequest(', 'async function digestText('],
    ['async function recordVisit(', 'async function recordVisit(', 'function languageForHostname('],
  ]) {
    const [from, to] = bounds(current, start, end);
    const [oldFrom, oldTo] = bounds(baseline, oldStart, end);
    current = current.slice(0, from) + baseline.slice(oldFrom, oldTo) + current.slice(to);
  }
  assert.doesNotMatch(current, /visit_\w+_v2|visitClassification|visitAcknowledgement|isSameOriginBrowserRequest/);
  return current;
}

export function preserveClient(current, baseline) {
  const marker = '  // Only the canonical English host belongs to this collection.';
  const oldMarker = '  // The domestic static host has no visit database; skip unsupported POSTs.';
  assert.equal(current.split(marker).length, 2);
  assert.equal(baseline.split(oldMarker).length, 2);
  const from = current.indexOf(marker), oldFrom = baseline.indexOf(oldMarker);
  assert.equal(current.slice(0, from), baseline.slice(0, oldFrom), 'Language/navigation code differs; review before preserving collector');
  return current.slice(0, from) + baseline.slice(oldFrom);
}

export async function prepare(artifact) {
  const workerPath = resolve(artifact, '_worker.js');
  const clientPath = resolve(artifact, 'portal-client.js');
  const worker = preserveWorker(await readFile(workerPath, 'utf8'), baselineFile('apps/website/_worker.js'));
  const client = preserveClient(await readFile(clientPath, 'utf8'), baselineFile('apps/website/portal-client.js'));
  await writeFile(workerPath, worker);
  await writeFile(clientPath, client);
  async function versionHtml(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await versionHtml(path);
      else if (entry.name.endsWith('.html')) {
        const html = await readFile(path, 'utf8'), updated = preserveClientVersion(html);
        if (updated !== html) await writeFile(path, updated);
      }
    }
  }
  await versionHtml(resolve(artifact));
  console.log(`Preserved production visit collector and storage from ${BASELINE_COMMIT}; v2 migration/report are deferred`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.ok(process.argv[2], 'An international artifact directory is required');
  await prepare(process.argv[2]);
}
