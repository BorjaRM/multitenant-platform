const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const adrFiles = [
  'ADR-002-postgresql-rls-tenant-context.md',
  'ADR-006-transactional-outbox-worker.md',
  'ADR-007-drizzle-tenant-aware-repositories.md',
];

test('TEN-REQ-021: architectural decisions are recorded in ADRs', async () => {
  for (const file of adrFiles) {
    const filePath = path.join(__dirname, '..', '..', '..', 'specs', 'architecture', 'adrs', file);
    assert.ok(fs.existsSync(filePath), `ADR document ${file} must exist`);

    const content = fs.readFileSync(filePath, 'utf8');
    for (const heading of [
      'Status',
      'Context',
      'Decision',
      'Consequences',
      'Evidence',
      'Follow-up',
    ]) {
      assert.match(content, new RegExp(`^## ${heading}$`, 'm'), `${file}: ${heading}`);
    }
    const metadata = require('yaml').parse(content.match(/^---\n([\s\S]*?)\n---/)[1]);
    assert.equal(typeof metadata.title, 'string');
    assert.equal(metadata['related-spike'], 'SPIKE-001');
  }
});

test('TEN-REQ-021: decisions explicitly cover concurrency, pooling, unit of work and limitations', () => {
  const root = path.join(__dirname, '..', '..', '..', 'specs', 'architecture', 'adrs');
  const content = fs.readFileSync(path.join(root, adrFiles[0]), 'utf8');
  for (const heading of ['Concurrency', 'Pooling', 'Unit of work', 'Limitations'])
    assert.match(content, new RegExp(`^## ${heading}$`, 'm'));
  assert.match(content, /READ COMMITTED/);
  assert.match(content, /FOR UPDATE/);
});
