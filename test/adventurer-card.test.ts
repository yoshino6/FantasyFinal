import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/game/adventurer-card.service.ts', import.meta.url), 'utf8');

test('冒险者卡片资料查询不使用 MySQL 保留字 rank 作为裸别名', () => {
  assert.doesNotMatch(source, /adventurer_rank\s+AS\s+rank\b/iu);
  assert.match(source, /adventurer_rank\s+AS\s+adventurerRank\b/u);
  assert.match(source, /rankBadgeStyle\(profile\.adventurerRank\)/u);
  assert.match(source, /escapeXml\(profile\.adventurerRank\)/u);
});
