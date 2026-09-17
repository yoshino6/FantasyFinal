import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { bossRewardStrengthLabel, bossTraitCardImage, bossTraitCardSvg, bossTraitStrengthLabel } from '../src/game/boss-trait-card.service';

const dreamlikeCard = {
  bossName: '梦幻的死灵法师·乌兹',
  difficultyCode: 'dreamlike' as const,
  effects: [
    '【魔泉不涸】每次实际行动开始回复10%最大魔力',
    '【亡潮四起】一次召唤4只亡灵，获得护盾与3层狂乱',
    '【冥龙再临】死荣咏唱缩短至1回合并可重试，骨龙带盾且领域效果翻倍'
  ]
};

test('Boss词条强弱值转换为文字等级', () => {
  assert.deepEqual([1.1, 1.25, 1.45, 1.65, 2.15, 2.6, 3.6, 5, 8, 20].map(bossTraitStrengthLabel),
    ['很低', '较低', '低', '略低', '中', '略高', '较高', '高', '很高', '极高']);
  assert.equal(bossRewardStrengthLabel(900), '很高');
  assert.equal(bossRewardStrengthLabel(800), '很高');
});

test('Boss词条图片隐藏校准信息与具体数值', () => {
  const svg = bossTraitCardSvg(dreamlikeCard);
  assert.doesNotMatch(svg, /校准装备|词条定位|满培养|最终倍率|品质100%/);
  assert.doesNotMatch(svg, /×\d|\+\d+%/);
  assert.match(svg, />较高<|>很高<|>极高</);
  assert.match(svg, /属性与奖励仅显示概览等级/);
});

test('32级 Boss 词条图片包含可发送的 WebP 画面', async () => {
  const image = await bossTraitCardImage(dreamlikeCard);
  const metadata = await sharp(image).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 1200);
  assert.ok(Number(metadata.height) >= 1200);
  assert.ok(image.length > 10_000);
});
