import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const normalDocument = readFileSync(resolve(root, 'docs/怪物卡片逐怪设计表V1.md'), 'utf8');
const officerDocument = readFileSync(resolve(root, 'docs/执法者星骷机制卡与召唤物来源V1.md'), 'utf8');

const tierCode = { '普通小怪': 'normal', '大怪': 'large', '精英': 'elite', 'BOSS': 'boss' };
const slotCode = { '武器': 'weapon', '副手': 'offhand', '上装': 'upper', '下装': 'lower', '头肩': 'shoulder', '腰带': 'waist', '鞋子': 'feet', '项链': 'necklace', '手镯': 'bracelet', '戒指': 'ring' };
const slotList = value => value.split('/').map(slot => slotCode[slot]).filter(Boolean);

const cards = [];
for (const line of normalDocument.split(/\r?\n/u)) {
  const match = /^\| `([^`]+)`<br>([^|]+) \| (\d+) \/ ([^|]+) \| ([^|]+) \| ([^|]+) \|/.exec(line);
  if (!match) continue;
  const [, monsterCode, monsterNameRaw, levelRaw, tierRaw, slotsRaw, effectTextRaw] = match;
  const tier = tierCode[tierRaw.trim()];
  if (!tier) throw new Error(`未知怪物品阶：${tierRaw}`);
  const allowedSlots = slotList(slotsRaw.trim());
  if (!allowedSlots.length) throw new Error(`未知附魔部位：${slotsRaw}`);
  const monsterName = monsterNameRaw.trim();
  cards.push({
    cardCode: `monster_card_${monsterCode}`,
    monsterCode,
    monsterName,
    name: `${monsterName}·卡片`,
    level: Number(levelRaw),
    tier,
    allowedSlots,
    effectText: effectTextRaw.trim(),
    sourcePolicy: ['uzz_skeleton_berserker','uzz_skeleton_archer','uzz_pain_wraith','uzz_skeleton_mage','uzz_frost_bone_dragon','habadragon','goblin_royal_guard','goblin_royal_spearman'].includes(monsterCode) ? 'source_boss' : 'kill'
  });
}

const officerLevel = { s3: 20, s4: 25, s5: 30, k1: 35, k2: 40, k3: 45, k4: 50, k5: 60 };
for (const line of officerDocument.split(/\r?\n/u)) {
  const match = /^\| (s[3-5]|k[1-5]) \| `([^`]+)` ([^|]+) \| ([^|]+) \| ([^|]+) \| ([\d.]+)% \|/.exec(line);
  if (!match) continue;
  const [, rank, monsterCode, titleRaw, slotRaw, effectTextRaw, rateRaw] = match;
  const allowedSlots = slotList(slotRaw.trim());
  const level = rank === 'k5' && monsterCode === 'city_chief_executor' ? 80 : officerLevel[rank];
  cards.push({
    cardCode: `monster_card_${monsterCode}_${rank}`,
    monsterCode,
    monsterName: titleRaw.trim().split('·')[0],
    name: `${titleRaw.trim()}·卡片`,
    level,
    tier: Number(rateRaw) === 0.5 ? 'boss' : 'elite',
    allowedSlots,
    effectText: effectTextRaw.trim(),
    sourcePolicy: 'city_pursuit',
    pursuitRank: rank
  });
}

if (cards.filter(card => card.sourcePolicy !== 'city_pursuit').length !== 167) throw new Error('常规卡片数量不是167。');
if (cards.filter(card => card.sourcePolicy === 'city_pursuit').length !== 21) throw new Error('执法者卡片数量不是21。');
const unique = new Set(cards.map(card => card.cardCode));
if (unique.size !== cards.length) throw new Error('卡片code重复。');

const output = `/* 此文件由 scripts/generate-monster-card-data.mjs 根据定稿设计表生成。 */\nexport const monsterCardData = ${JSON.stringify(cards, null, 2)} as const;\n`;
const outputPath = resolve(root, 'src/config/monster-card-data.generated.ts');
if (process.argv.includes('--check')) {
  const current = readFileSync(outputPath, 'utf8');
  if (current !== output) {
    console.error('monster-card-data.generated.ts 与定稿设计表不一致，请重新运行生成脚本。');
    process.exitCode = 1;
  } else console.log(`checked ${cards.length} monster cards`);
} else {
  writeFileSync(outputPath, output, 'utf8');
  console.log(`generated ${cards.length} monster cards`);
}
