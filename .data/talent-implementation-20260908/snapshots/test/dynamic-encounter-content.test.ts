import assert from 'node:assert/strict';
import test from 'node:test';
import { auditDynamicEncounterContent } from '../src/game/world-dynamics.content';

test('区域奇遇内容独占且具备完整开场', () => {
  const audit = auditDynamicEncounterContent();
  assert.equal(audit.regionCount, 14);
  assert.equal(audit.templateCount, 252);
  assert.deepEqual(audit.missingRegions, []);
  assert.deepEqual(audit.duplicateTitles, []);
  assert.deepEqual(audit.thinEntries, []);
});
