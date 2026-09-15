import assert from 'node:assert/strict';
import test from 'node:test';
import { heartCards } from '../src/game/heart-question-content';
import { attributes } from '../src/game/types';

test('V3 问心题库包含 500 个无疑问句的独立深层事件与 3000 个立场选项', () => {
  assert.equal(heartCards.length, 500);
  assert.equal(new Set(heartCards.map(card => card.title)).size, 500);
  assert.equal(new Set(heartCards.map(card => card.prompt)).size, 500);
  assert.ok(heartCards.every(card => card.version === 3));
  assert.ok(heartCards.every(card => !card.title.includes('你') && !/[？?]/.test(card.prompt) && !card.prompt.includes('你')));

  const choices = heartCards.flatMap(card => card.options);
  assert.equal(choices.length, 3000);
  assert.equal(new Set(choices.map(choice => choice.text)).size, 3000);
  assert.ok(choices.every(choice => choice.text.includes('我') && !choice.text.includes('你') && !/[？?]/.test(choice.text)));
  assert.ok(heartCards.every(card => new Set(card.options.map(choice => choice.favor)).size === attributes.length));

  const pairs = new Set(choices.map(choice => `${choice.favor}>${choice.repel}`));
  assert.equal(pairs.size, attributes.length * (attributes.length - 1));
});
