const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const traceabilityPath = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'specs',
  'spikes',
  'SPIKE-001-traceability.md',
);

test('TEN-REQ-020: traceability is documented for every requirement and checkpoint', async () => {
  const content = fs.readFileSync(traceabilityPath, 'utf8');
  const reqs = [
    'TEN-REQ-001',
    'TEN-REQ-002',
    'TEN-REQ-003',
    'TEN-REQ-004',
    'TEN-REQ-005',
    'TEN-REQ-006',
    'TEN-REQ-007',
    'TEN-REQ-008',
    'TEN-REQ-009',
    'TEN-REQ-010',
    'TEN-REQ-011',
    'TEN-REQ-012',
    'TEN-REQ-013',
    'TEN-REQ-014',
    'TEN-REQ-015',
    'TEN-REQ-016',
    'TEN-REQ-017',
    'TEN-REQ-018',
    'TEN-REQ-019',
    'TEN-REQ-020',
    'TEN-REQ-021',
  ];

  for (const req of reqs) {
    assert.match(content, new RegExp(req), `Traceability must list ${req}`);
  }

  const totalRows = (content.match(/\| TEN-REQ-/g) || []).length;
  assert.ok(totalRows >= 21, 'Traceability must include all 21 TEN-REQ rows');
  assert.match(
    content,
    /Checkpoint|Implementation|Prueba|Evidencia|Estado/i,
    'Traceability must include evidence and status columns',
  );
});

test('TEN-REQ-020: conformance validates real paths and refuses duplicate, unassigned or falsely closed requirements', () => {
  const {
    validateTraceability,
  } = require('../../../.github/skills/execute-tenancy-spike/scripts/verify-traceability.ts');
  const root = path.join(__dirname, '..', '..', '..');
  const relative = 'specs/spikes/SPIKE-001-traceability.md';
  const content = fs.readFileSync(path.join(root, relative), 'utf8');
  assert.equal(validateTraceability(root).requirements, 21);
  for (const invalid of [
    content.replace('packages/database/src/runtime.ts', 'packages/database/src/nonexistent.ts'),
    content.replace('| TEN-REQ-001 | Checkpoint 3', '| TEN-REQ-001 | Checkpoint 6'),
    content.replace('| TEN-REQ-002 |', '| TEN-REQ-001 |'),
    content.replace('status: implemented', 'status: verified'),
    content.replace(/(\| TEN-REQ-020 \|[^\n]+)Implemented/, '$1Verified'),
  ])
    assert.throws(() => validateTraceability(root, { [relative]: invalid }));
});
