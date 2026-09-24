#!/usr/bin/env tsx

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';
import { parse } from 'yaml';

export function validateTraceability(root = process.cwd(), overrides: Record<string, string> = {}) {
  function read(relative: string) {
    const content = overrides[relative] ?? fs.readFileSync(path.join(root, relative), 'utf8');
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
    assert.ok(frontmatter, `Missing frontmatter: ${relative}`);
    return { content, metadata: parse(frontmatter[1]) };
  }
  const requirements = read('specs/spikes/SPIKE-001-requirements.md');
  const traceability = read('specs/spikes/SPIKE-001-traceability.md');
  const results = read('specs/spikes/SPIKE-001-results.md');
  const ids = [...requirements.content.matchAll(/^### (TEN-REQ-\d{3})/gm)].map((match) => match[1]);
  assert.equal(ids.length, 21);
  assert.equal(new Set(ids).size, 21);
  const rows: string[][] = [];
  let current: string[] = [];
  for (const token of new MarkdownIt().parse(traceability.content, {})) {
    if (token.type === 'tr_open') current = [];
    if (token.type === 'inline')
      current.push((token.children ?? []).map((child) => child.content).join(''));
    if (token.type === 'tr_close' && /^TEN-REQ-\d{3}$/.test(current[0] ?? ''))
      rows.push([...current]);
  }
  assert.equal(rows.length, 21, 'Exactly 21 requirement rows required');
  assert.equal(new Set(rows.map((row) => row[0])).size, 21, 'Duplicate requirement');
  const owners = [3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 3, 1, 4, 4, 4, 5, 5, 4, 4, 6, 6];
  for (const row of rows) {
    assert.equal(row.length, 6, `Invalid matrix columns: ${row[0]}`);
    const [id, checkpoint, implementation, test, evidence, state] = row;
    assert.ok(ids.includes(id), id);
    const owner = owners[Number(id.slice(-3)) - 1];
    assert.equal(checkpoint, `Checkpoint ${owner}`, `${id}: incorrect checkpoint`);
    for (const relative of [...implementation.split(', '), test]) {
      assert.ok(
        !path.isAbsolute(relative) && !relative.includes('..'),
        'Repository-relative path required',
      );
      assert.ok(
        fs.existsSync(path.join(root, relative)),
        `Missing implementation/test: ${relative}`,
      );
    }
    assert.ok(
      test.startsWith(`test/integration/checkpoint-${owner}/`),
      `${id}: test checkpoint mismatch`,
    );
    assert.ok(
      fs.readFileSync(path.join(root, test), 'utf8').includes(id),
      `${id}: test does not reference requirement`,
    );
    assert.equal(
      evidence,
      `npm run test:integration:checkpoint-${owner}`,
      `${id}: executable evidence required`,
    );
    assert.ok(
      ['Draft', 'Implemented', 'Verified', 'Failed', 'Deferred'].includes(state),
      `${id}: invalid status`,
    );
    const requirement = requirements.content.split(`### ${id}`)[1]?.split('\n### ')[0];
    assert.ok(requirement?.includes(`**Estado:** ${state}`), `${id}: requirement state differs`);
    if (state !== 'Verified')
      assert.ok(results.content.includes(id), `${id}: unverified requirement must be disclosed`);
  }
  assert.equal(traceability.metadata.status, results.metadata.status, 'Global states disagree');
  const verified = rows.filter((row) => row[5] === 'Verified').length;
  assert.equal(results.metadata['verified-requirements'], verified, 'Verified counts disagree');
  const hasPullRequest = /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(
    String(traceability.metadata['pull-request']),
  );
  if (!hasPullRequest) {
    assert.notEqual(
      rows.find((row) => row[0] === 'TEN-REQ-020')?.[5],
      'Verified',
      'PR evidence missing',
    );
    assert.ok(results.content.includes('PR_PENDING'), 'Missing PR blocker');
  }
  if (traceability.metadata.status === 'verified') {
    assert.equal(verified, 21);
    assert.ok(hasPullRequest, 'PR required for closure');
    assert.equal(traceability.metadata['human-review'], 'approved', 'Human review required');
  }
  return {
    requirements: rows.length,
    verified,
    closed: traceability.metadata.status === 'verified',
  };
}

if (require.main === module) {
  try {
    console.log('Traceability conformance:', validateTraceability());
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
