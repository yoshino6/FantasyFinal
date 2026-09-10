import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createConnection } from 'mysql2/promise';
import { classifyNegotiationItem, type NegotiationItem } from '../src/game/negotiation-item-policy';
import { monsterNegotiationProfile, creatureVoices } from '../src/config/monster-negotiation';
import { negotiationDialogue } from '../src/config/monster-negotiation-dialogues';
import { moodBands } from '../src/game/negotiation-rules';

// 只读现有数据库，不调用会执行全量初始化的 getPool。
const { parse } = createRequire(import.meta.url)('yaml');
const config = parse(readFileSync('alemon.config.yaml', 'utf8')); const db = config.FantasyFinal?.database ?? config.mysql;
const connection = await createConnection({ host: db.host, port: Number(db.port ?? 3306), user: db.user, password: db.password, database: db.database, charset: 'utf8mb4' });
try {
  const [items] = await connection.query<any[]>('SELECT id,code,name,item_type,item_category,stackable,trade_price,effect_json FROM item_definitions ORDER BY item_category,code');
  const [monsters] = await connection.query<any[]>('SELECT code,name FROM monster_templates ORDER BY code');
  const rows = items.map((item: NegotiationItem) => ({ item, policy: classifyNegotiationItem(item) }));
  const allowed = rows.filter(row => row.policy.usable).length;
  const safe = (value: unknown) => String(value ?? '').replaceAll('|', '／').replaceAll('\n', ' ');
  const stamp = new Date().toISOString().slice(0, 10);
  const itemLines = ['# 交涉物品分类清单', '', `审计日期：${stamp}。已有物品 ${items.length} 种；允许 ${allowed} 种，禁止 ${items.length - allowed} 种。`, '',
    '本清单由 `npx tsx scripts/negotiation-audit.ts` 只读生成。运行时使用同一分类函数；未绑定数量不足、实例来源等仍会在交付事务中重新校验。', '',
    '零收购价怪材复用现有炼金材料固定成本；普通肉块估值为 4，Boss 星尘仅用于容量估值为 100。地图、重要任务物、进化材料、实例等优先禁止；普通材料名称带 `map_` 不视为地图。家园专用建材暂因缺少统一交涉估值而不接收。', ''];
  for (const category of new Set(rows.map(row => row.item.item_category))) {
    const group = rows.filter(row => row.item.item_category === category);
    itemLines.push(`## ${category}`, '', `共 ${group.length} 种。`, '', '| 代号 | 物品 | 准入 | 交涉分类 | 单件估值 | 依据 |', '| --- | --- | --- | --- | ---: | --- |');
    for (const { item, policy } of group) itemLines.push(`| ${safe(item.code)} | ${safe(/ambush_/.test(item.code) ? '伏击残影材料' : item.name)} | ${policy.usable ? '允许' : '禁止'} | ${policy.subtype} | ${policy.usable ? Number(policy.value.toFixed(4)) : '—'} | ${policy.reason} |`);
    itemLines.push('');
  }
  writeFileSync('docs/交涉物品分类清单.md', itemLines.join('\n'));
  const lines = ['# 怪物交涉喜恶与文案覆盖审计', '', `审计日期：${stamp}。当前模板 ${monsters.length} 种，独立形态文案 ${Object.keys(creatureVoices).length} 组。`, '',
    '每个模板绑定形态及元素倾向，覆盖八档心情 × 喜好/一般/厌恶 × 两条文案。一般和厌恶物品拒收，留在玩家背包；行为只描写观察、回避、拒绝和示警，不描写毁坏或吞食。粒子逐类明确归类；同类行为按元素气息进一步变化。部位与临时召唤物在运行时交给本体处理，不独立领取奖励。动态伏击模板不在报告中展示玩家姓名。', '',
    '| 模板 | 名称 | 形态 | 喜好材料 | 厌恶材料 | 喜好粒子 | 厌恶粒子 | 一般粒子 |', '| --- | --- | --- | --- | --- | --- | --- | --- |'];
  for (const monster of monsters) {
    const profile = monsterNegotiationProfile(monster.code, monster.name);
    const particles = (preference: string) => Object.entries(profile.particles).filter(([, value]) => value === preference).map(([key]) => key).join('、') || '无';
    if (!profile.likes.length || !profile.dislikes.length || !Object.values(profile.particles).includes('like') || !Object.values(profile.particles).includes('dislike')) throw new Error(`偏好未覆盖：${monster.code}`);
    for (const mood of moodBands) for (const preference of ['like', 'neutral', 'dislike'] as const) {
      const first = negotiationDialogue(profile.family, mood.min, preference, '粒子·木', '木元素微尘', '', () => 0);
      const second = negotiationDialogue(profile.family, mood.min, preference, '粒子·木', '木元素微尘', first.key, () => 0);
      if (first.text === second.text || !first.text.includes('木元素微尘')) throw new Error(`文案未覆盖：${monster.code}/${mood.code}/${preference}`);
    }
    lines.push(`| ${monster.code} | ${safe(monster.code.startsWith('ambush_') ? '伏击残影（动态）' : monster.name)} | ${profile.family} | ${profile.likes.join('、')} | ${profile.dislikes.join('、')} | ${particles('like')} | ${particles('dislike')} | ${particles('neutral')} |`);
  }
  lines.push('', '## 单品例外', '', '全局物品准入优先；以下单品覆盖该怪物的类别偏好，不放行禁用物品。', '');
  for (const monster of monsters) {
    const profile = monsterNegotiationProfile(monster.code, monster.name);
    for (const [item, preference] of Object.entries(profile.items)) lines.push(`- ${monster.code}：${item} → ${{ like: '喜好', neutral: '一般', dislike: '厌恶' }[preference]}。`);
  }
  lines.push('', '## 各形态行为样例', '');
  for (const family of Object.keys(creatureVoices) as Array<keyof typeof creatureVoices>) {
    lines.push(`### ${family}`, '');
    for (const preference of ['like', 'neutral', 'dislike'] as const) {
      const first = negotiationDialogue(family, 0, preference, '粒子·木', '木元素微尘', '', () => 0);
      const next = negotiationDialogue(family, 0, preference, '粒子·木', '木元素微尘', first.key, () => 0);
      lines.push(`- ${preference}①：${first.text}`, `- ${preference}②：${next.text}`);
    }
    lines.push('');
  }
  writeFileSync('docs/怪物交涉喜恶与文案覆盖审计.md', lines.join('\n'));
  console.log(JSON.stringify({ items: items.length, allowed, denied: items.length - allowed, monsters: monsters.length, voices: Object.keys(creatureVoices).length, dialogueCombinations: monsters.length * 8 * 3 * 2 }));
} finally { await connection.end(); }
