// 设计测算工具：只生成同目录 Markdown，不接入游戏或数据库。
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { calculateDerivedStats, equipmentQualityMultiplier, forgedEquipmentBase, forgeRarityMultiplier } from '../src/game/constants';
import type { Allocation, DerivedStats } from '../src/game/types';

const cap = 50;
export const keys = ['hpMax', 'mpMax', 'physicalAttack', 'magicAttack', 'physicalDefense', 'magicDefense', 'accuracy', 'evasion', 'critRateBp', 'critDamageBp', 'critResistBp', 'critDamageReductionBp', 'tenacity', 'tenacityPierce', 'speed'] as const;
export const labels = ['生命', '魔力', '物攻', '魔攻', '物防', '魔防', '命中', '闪避', '暴击', '暴伤', '暴抗', '暴减', '韧性', '破韧', '速度'];
export const directions = ['均衡', '战锋', '灵术', '守御', '灵巧'] as const;
type Direction = typeof directions[number];
export const weights: Record<Direction, number[]> = {
  均衡: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  战锋: [1.3,.7,1.6,.4,1,.8,1,1,1,1.2,1,.8,1,1.2,1],
  灵术: [.85,1.15,.4,1.6,.8,1.2,1,.8,1,1,1,1,1,1.2,1],
  守御: [1.4,.6,.6,.6,1.4,1.4,1,1,.8,.8,1.2,1.2,1.3,.7,1],
  灵巧: [1,1,1,1,.7,.7,1.3,1.3,1.2,1,.8,1,.6,1,1.4]
};
// 对应 baseForgeEffect 的名义主词条；不导入带数据库依赖的制造服务。
const weapon: Record<Direction, Partial<DerivedStats>> = {
  均衡: { physicalAttack: .9, magicAttack: .9 },
  战锋: { physicalAttack: 1 },
  灵术: { magicAttack: 1 },
  守御: { physicalDefense: 1, magicDefense: .5 },
  灵巧: { physicalAttack: .9, magicAttack: .9 }
};
const player = (level: number) => {
  const x = (100 + 10 * (level - 1)) / 6;
  return calculateDerivedStats(Object.fromEntries(['constitution','spirit','strength','intelligence','agility','perception'].map(key => [key, x])) as Allocation);
};
const floor = (value: number) => Math.floor(value + 1e-9); // 仅消除浮点运算的近整数误差。
const p1 = player(1);
export const birth = keys.map(key => floor(.8 * p1[key]));
const progress = (level: number) => (level - 1) / (cap - 1);
const body = (level: number) => {
  const t = progress(level), p = player(level);
  return keys.map((key, i) => (.8 + .2 * t) * p[key] + (1 - t) * (birth[i]! - .8 * p1[key]));
};
const weaponBudget = (level: number) => progress(level) * forgedEquipmentBase(level, '武器') * forgeRarityMultiplier['普通']! * equipmentQualityMultiplier(100);
export const increment = (level: number, direction: Direction) => {
  const end = Math.ceil(level / 10) * 10, start = end === 10 ? 1 : end - 10;
  const stageWeight = end - start + 3; // 首段8个普通级+一次4倍突破=12，后续阶段为13。
  const rate = (level % 10 === 0 ? 4 : 1) / stageWeight;
  const now = body(end), before = body(start), dw = weaponBudget(end) - weaponBudget(start);
  return keys.map((key, i) => ((now[i]! - before[i]!) * weights[direction][i]! + dw * (weapon[direction][key] ?? 0)) * rate);
};
const panel = (history: readonly Direction[]) => {
  const values = [...birth];
  history.forEach((direction, index) => increment(index + 2, direction).forEach((value, i) => { values[i]! += value; }));
  return values.map(floor);
};
const rows = Object.fromEntries(directions.map(direction => [direction, Array.from({ length: cap }, (_, index) => panel(Array<Direction>(index).fill(direction)))])) as Record<Direction, number[][]>;
const table = (header: string[], data: (string | number)[][]) => [
  `| ${header.join(' | ')} |`, `| ${header.map(() => '---:').join(' | ')} |`, ...data.map(row => `| ${row.join(' | ')} |`)
].join('\n');

assert.deepEqual(birth, [554,506,63,63,63,63,130,130,130,130,130,130,114,56,194]);
for (const direction of directions) {
  assert(Math.abs(weights[direction].reduce((a,b) => a+b, 0) - 15) < 1e-9);
  for (let level = 2; level <= cap; level++) {
    assert(increment(level, direction).every(value => Number.isFinite(value) && value > 0));
    if (level % 10 === 0) {
      const normal = increment(level - 1, direction);
      increment(level, direction).forEach((value, i) => assert(Math.abs(value - 4 * normal[i]!) < 1e-8));
      // 玩家实际看到的整数增量也须处于3～5倍，而不只是内部小数满足。
      rows[direction][level-1]!.forEach((value, i) => {
        const jump = value - rows[direction][level-2]![i]!;
        const normalVisible = rows[direction][level-2]![i]! - rows[direction][level-3]![i]!;
        assert(normalVisible > 0 && jump / normalVisible >= 3 && jump / normalVisible <= 5);
      });
    }
    assert(rows[direction][level-1]!.every((value, i) => value >= rows[direction][level-2]![i]!));
  }
}
const p50 = player(cap), w50 = weaponBudget(cap);
assert.deepEqual(rows.均衡[49], keys.map(key => floor(p50[key] + (weapon.均衡[key] ?? 0) * w50)));
// 混合方向按目标等级绑定增量；批量与逐级重放一致，次数不能替代历史。
const mixed: Direction[] = [...Array<Direction>(10).fill('守御'), ...Array<Direction>(19).fill('战锋')];
assert.notDeepEqual(panel(mixed), panel([...mixed].reverse()));
const running = [...birth];
mixed.forEach((direction, index) => {
  increment(index + 2, direction).forEach((value, i) => { running[i]! += value; });
  assert.deepEqual(running.map(floor), panel(mixed.slice(0, index + 1)));
});
// 全部重调为均衡、降级截取前缀、恢复等级均由同一函数重算。
assert.deepEqual(panel(mixed.map(() => '均衡')), rows.均衡[29]);
assert.deepEqual(panel(Array<Direction>(9).fill('均衡')), rows.均衡[9]);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
let md = `# 机巧逐级属性重算 V2\n\n状态：历史预算基底，固定路线已由[性格与材料成长 V3](机巧性格与材料成长设计V3.md)替换。下表不再代表实际人偶升级结果，仅供 V3 混合计算与预算核查。尚未实装。覆盖 Lv.1～50；由 [测算脚本](机巧成长数值测算.ts) 生成，运行：\n\n\`\`\`powershell\nnpx tsx docs/机巧成长数值测算.ts\n\`\`\`\n\n## 1. 对标口径与公式\n\n保留出生时约为无装备标准玩家 80% 的固定面板，逐级追赶，在当前设计上限 Lv.50 对标同级、总初始 100、总成长 10、六维均分的玩家。普通表示稀有度，100 表示装备品质，品质系数为 1。参照名义主词条，不包括随机打造浮动、材料追加词条、精炼、五件防具、饰品、神器、职业被动和药剂。品质 100 本身并不保证主词条掷到上限。\n\n均衡与灵巧使用普通匕首的双攻预算（各 0.9W），战锋使用长剑（物攻 W），灵术使用法杖（魔攻 W），守御使用盾牌（物防 W、魔防 0.5W）。这只是数值参照，人偶仍不能穿戴装备。其他方向还会重新分配本体成长，所以“约等于”指对应定位的面板预算，不是所有属性逐项相等，更不保证同等胜率。\n\n设 P(L) 为源码计算的标准玩家无装备面板，B=floor(0.8P(1)) 为固定出生值，各属性独立计算：\n\n\`\`\`text\nt(L) = (L-1)/49\nr(L) = 0.8 + 0.2t(L)\nC(L) = r(L)P(L) + (1-t(L))(B-0.8P(1))\nW(L) = forgedEquipmentBase(L, 武器) × 普通稀有度系数 × 品质100系数\n     = (8 + 4.3×(100+10(L-1))/6) × 1.2^floor(L/10)\nZ(L) = t(L)W(L)\n阶段终点 e = ceil(L/10)×10\n阶段起点 s = e=10 时取1，否则取e-10\n阶段权重 Q = (e-s)+3；首段12，后续每段13\n该级权重 q(L) = L为10的整数倍时4，否则1\nΔ(L,d) = [(C(e)-C(s)) × 本体方向倍率(d)\n          + (Z(e)-Z(s)) × 武器方向系数(d)] × q(L)/Q\n面板(L) = floor(B + Σ[k=2..L] Δ(k,该级记录的方向))\n\`\`\`\n\nC(1)=B、Z(1)=0；C(50)=P(50)、Z(50)=W(50)。均衡每项在 Lv.50 精确达到名义普通匕首参照（最终取整后），不是继续按无装备玩家的 80% 成长。本体倍率取本文件测算脚本中的 weights 常量（历史预算定义），武器增量不再乘本体倍率。以十级为阶段，保留 C/Z 在阶段起点和终点的总预算，将阶段内普通升级分配 1 份、十级突破分配 4 份。本体与武器的各项属性一起突破，十级同时保证领悟特殊技能。首段 Lv.1→10 有 8 次普通升级与 1 次突破，总权重 12；后续每段有 9 次普通升级与 1 次突破，总权重 13。比较同一培养方向、同一阶段时，十级增量严格为普通级的 4 倍；方向切换会改变分配，不能跨方向强求逐项四倍。\n\n破韧沿用 calculateDerivedStats 内部取整；其余中间结果保留精度，不能逐级截断累加。浮点近整数误差只用 1e-9 容差纠正。培养顺序影响结果：每条历史必须绑定目标等级，不能按方向次数重建；重调也只能替换所选等级的方向。批量培养逐级执行；主人等级限制按历史前缀重放。\n\n阶段内的 C(L)/Z(L) 是预算锚函数，实际面板按上述阶段分配重放，只有阶段边界与锚值相合。所有跨级培养仍逐级扣除 E(L) 并判定技能；4 倍属性增量不重复乘技能权重，也不额外赠送 4 次领悟。\n\n等级上限将来提高时必须发布新成长版本并重新评估，不把旧版本分母 49 随上限动态改变。育成成本 E(L)=200+40L+4L² 保持原方案，材料仍是唯一经验来源。最新规则已取消人偶专属折扣，战斗公式与人物一致；本文件仅保留历史成长预算，输出是否达标仍需用实际面板和技能循环验证。\n\n## 2. 五种方向逐级完整面板\n\n以下每个方向都是从 Lv.1 起持续选择该方向的结果；混合培养必须使用逐级公式。暴击等字段保持项目原有属性单位，并非直接百分比。\n`;
for (const direction of directions) md += `\n### ${direction}\n\n${table(['等级', ...labels], rows[direction].map((row, i) => [i+1, ...row]))}\n`;
md += `\n## 3. 均衡每一级的可见增量\n\n以下为相邻最终面板之差，包含最终取整效应；不可拿这张整数表累加其他方向。其他方向逐级增量可由上一节相邻行相减。\n\n${table(['到达等级', ...labels], rows.均衡.slice(1).map((row, i) => [i+2, ...row.map((value, k) => value - rows.均衡[i]![k]!) ]))}\n`;
md += `\n## 4. Lv.50 对标核查\n\n${table(['属性', '普通匕首玩家', ...directions], keys.map((key, i) => [labels[i]!, floor(p50[key] + (weapon.均衡[key] ?? 0) * w50), ...directions.map(direction => rows[direction][49]![i]!)]))}\n\n方向分配并非等价战力证明：匕首本来就有双攻主词条；守御得到盾牌防御预算但缺少攻击武器预算。应覆盖均衡/专精方向及物理/法系怪物，复核攻防非线性、治疗强度、挡刀和大招收益。全队多个人偶的额外行动收益仍需战斗验证。\n\n## 5. 已完成的数值校验与边界\n\n脚本已断言：出生面板一致、五方向倍率各合计 15、全部 245 次方向升级增量为正、五方向面板不倒退、全部 25 个方向突破的内部增量为同阶段普通级 4 倍且可见整数增量处于 3～5 倍、Lv.50 均衡与普通匕首参照逐项一致、混合培养批量和逐级结果一致、方向顺序不可忽略、全部重调回均衡可复现。降级取历史前缀，恢复使用完整历史。尚未执行游戏内战斗、数据库升级或运行时培养验证。\n\n源码依据：[玩家派生属性、品质与锻造基础](../src/game/constants.ts)、[各类武器名义主词条](../src/game/blacksmith.service.ts)。主方案：[机巧](机巧人偶制造与养成系统设计方案V1.md)。\n`;
writeFileSync(new URL('./机巧逐级属性重算V2.md', import.meta.url), md, 'utf8');
console.log(JSON.stringify({ validated: true, samples: [1,5,10,20,30,40,50].map(level => ({ level, stats: rows.均衡[level-1] })), milestones: [10,20,30,40,50].map(level => ({ level, normal: rows.均衡[level-2]!.map((v,i)=>v-rows.均衡[level-3]![i]!), jump: rows.均衡[level-1]!.map((v,i)=>v-rows.均衡[level-2]![i]!) })), lv30: Object.fromEntries(directions.map(d => [d, rows[d][29]])), nextWar: panel([...Array<Direction>(9).fill('均衡'), '战锋']) }, null, 2));

}
