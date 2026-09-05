import assert from 'node:assert/strict';
import test from 'node:test';
import { auditDynamicNpcDialogues } from '../src/game/dynamic-npc-dialogue.service';

test('新增域民对白具备独立资料且不回落到旧共用句', () => {
  const audit = auditDynamicNpcDialogues();
  assert.equal(audit.profileCount, 42);
  assert.deepEqual(audit.missingVoices, []);
  assert.deepEqual(audit.missingHabits, []);
  assert.deepEqual(audit.missingNotes, []);
  assert.deepEqual(audit.duplicateSamples, []);
  assert.deepEqual(audit.duplicateNotes, []);
  assert.deepEqual(audit.forbiddenSamples, []);
  assert.equal(audit.sampleCount, 630);
});
