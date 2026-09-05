import { Format, logger, useEvent, useMessage, useRoute } from 'alemonjs';
import { itemCodex } from '../game/adventure.service';
import { forgePrimaryKeys } from '../game/blacksmith.service';
import { getPool } from '../database/pool';
import { messageFormat } from '../game/message';

const artifactEffects: Record<string, string[]> = {
  holy_sword: ['普攻与斩击技能恒为物理伤害。', '普攻或斩击技能暴击时，给予目标1层[破甲剑痕]。', '$破甲剑痕$目标物理防御降低16%，持续3回合，可叠加。'],
  demon_sword: ['普攻与斩击技能恒为魔法伤害。', '普攻或斩击技能命中时，给予自身1层[魔剑激涌]。', '#魔剑激涌#自身伤害提高16%，持续3回合，可叠加。'],
  saint_staff: ['光属性技能威力提高33%。'],
  death_dagger: ['暴击时，本次攻击最终伤害提高50%。'],
  godfist: ['物攻与魔攻恒取较高的一项。'],
  oracle_grimoire: ['所有技能吟咏-1。'],
  prayer_orb: ['释放辅助类技能时，给予全部受益对象1层[祈祷圣音]。', '#祈祷圣音#每回合恢复3%生命与魔力，持续3回合，可叠加。'],
  immortal_shield: ['受到物理伤害降低40%。'],
  star_crown: ['魔法技能威力提高16%。'],
  sky_robe: ['受到魔法伤害降低40%。'],
  wind_girdle: ['移动速度+3，且无视负重带来的移速降低。'],
  time_greaves: ['濒死时保留1 HP，清除异常与减益，并在下次出手前无敌；每场战斗限一次。'],
  gale_boots: ['命中时有33%概率追击，再次造成相同的一次攻击。'],
  oath_necklace: ['每回合恢复3%最大生命。'],
  fate_bracelet: ['魔力不足时，会以 1:1 的生命补足魔力；生命不足以支付时，无法释放技能。'],
  eternal_ring: ['每回合恢复3%最大魔力。']
};

const jsonObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}; } catch { return {}; }
};

const equipmentSections = (effectJson: unknown, category: string, subtype: string | null) => {
  const effect = jsonObject(effectJson);
  const primaryKeys = new Set(forgePrimaryKeys(category, subtype));
  const attributeLabels: Record<string, string> = {
    hpMax: '生命', mpMax: '魔力', physicalAttack: '物理攻击', magicAttack: '魔法攻击', physicalDefense: '物理防御', magicDefense: '魔法防御',
    accuracy: '命中', evasion: '闪避', critRateBp: '暴击', critDamageBp: '暴伤', critResistBp: '暴免', critDamageReductionBp: '暴抗', tenacity: '韧性', tenacityPierce: '破韧', speed: '速度',
    physicalAttackPct: '物理攻击', magicAttackPct: '魔法攻击', physicalDefensePct: '物理防御', magicDefensePct: '魔法防御', critRatePct: '暴击', critDamagePct: '暴伤',
    accuracyPct: '命中', evasionPct: '闪避', speedPct: '速度', mpPct: '魔力', hpPct: '生命', tenacityPct: '韧性', tenacityPiercePct: '破韧'
  };
  const attributeLabel = (key: string) => attributeLabels[key] ?? (key.startsWith('elementMastery_') ? `${key.slice('elementMastery_'.length)}元素精通` : key.startsWith('elementResistance_') ? `${key.slice('elementResistance_'.length)}元素抗性` : '');
  const normalOrder = ['hpMax', 'mpMax', 'physicalAttack', 'magicAttack', 'physicalDefense', 'magicDefense', 'accuracy', 'evasion', 'speed', 'critRateBp', 'critDamageBp', 'critResistBp', 'critDamageReductionBp', 'tenacity', 'tenacityPierce', 'hpPct', 'mpPct', 'physicalAttackPct', 'magicAttackPct', 'physicalDefensePct', 'magicDefensePct', 'accuracyPct', 'evasionPct', 'speedPct', 'critRatePct', 'critDamagePct', 'tenacityPct', 'tenacityPiercePct'];
  const elementalOrder = ['金', '木', '水', '火', '土', '风', '雷', '冰', '光', '暗'];
  const attributes = Object.entries(effect).filter(([key, value]) => attributeLabel(key) && Number(value)).map(([key, value]) => {
    const group = primaryKeys.has(key) ? 0 : key.startsWith('elementMastery_') || key.startsWith('elementResistance_') ? 2 : 1;
    const order = group === 2 ? elementalOrder.indexOf(key.split('_')[1] ?? '') * 2 + (key.startsWith('elementResistance_') ? 1 : 0) : normalOrder.indexOf(key);
    return { group, order: order < 0 ? Number.MAX_SAFE_INTEGER : order, text: `${attributeLabel(key)} ${Number(value) >= 0 ? '+' : ''}${key.endsWith('Pct') ? `${Number(value)}%` : Number(value)}${primaryKeys.has(key) ? '(主)' : '(副)'}` };
  }).sort((left, right) => left.group - right.group || left.order - right.order || left.text.localeCompare(right.text, 'zh-CN')).map(attribute => attribute.text);
  const effectLabels: Record<string, string> = { ignoreDefensePct: '无视目标物理防御', lifestealPct: '造成伤害后恢复生命', magicDamagePct: '魔法伤害提高', manaCostReduction: '技能魔力消耗降低', damageBonusPct: '造成伤害提高', damageReductionPct: '受到伤害降低', minimumHitRatePct: '攻击命中率最低' };
  const effects = Object.entries(effect).filter(([key, value]) => effectLabels[key] && Number(value)).map(([key, value]) => `${key === 'damageBonusPct' || key === 'damageReductionPct' ? '⭐️' : ''}${effectLabels[key]} ${key === 'manaCostReduction' ? value : `${value}%`}`);
  const artifact = String(effect.artifact ?? '');
  if (artifactEffects[artifact]) effects.unshift(...artifactEffects[artifact]);
  return { attributes, effects };
};

const consumableEffects = (effectJson: unknown) => {
  const effect = jsonObject(effectJson); const lines: string[] = [];
  if (Number(effect.heal ?? 0)) lines.push(`立即恢复 ${Number(effect.heal)} 点生命。`);
  if (Number(effect.restoreMp ?? 0)) lines.push(`立即恢复 ${Number(effect.restoreMp)} 点魔力。`);
  if (Number(effect.healPct ?? 0)) lines.push(`立即恢复最大生命的 ${Number(effect.healPct)}%。`);
  if (Number(effect.restoreMpPct ?? 0)) lines.push(`立即恢复最大魔力的 ${Number(effect.restoreMpPct)}%。`);
  if (effect.cleanse) lines.push('清除自身可净化的异常状态。');
  const status = jsonObject(effect.status);
  const statusNames: Record<string, string> = { regeneration: '再生', mana_regeneration: '回流', barrier: '减伤', battle_cry: '战吼', precision: '精准', critical_focus: '凝神', sprint: '迅行', alchemy_guard: '坚守', alchemy_evasion: '轻灵', burn: '灼烧', bind: '束缚', stun: '眩晕', exposed: '易伤', imbalance: '失衡', alchemy_confusion: '混乱' };
  if (String(status.code)) lines.push(`施加${effect.target === 'enemy' ? '目标' : '自身'}「${statusNames[String(status.code)] ?? String(status.code)}」${Number(status.turns) ? `，持续 ${Number(status.turns)} 回合` : ''}${Number(status.chance) ? `（${Number(status.chance)}% 基础概率）` : ''}。`);
  const throwable = jsonObject(effect.throwable);
  if (Number(throwable.damageScale ?? 0)) lines.push(`对当前目标造成${String(throwable.element ?? '无')}属性直击伤害。`);
  if (Number(effect.experienceBonusPct ?? 0)) lines.push(`战斗经验获取提高 ${Number(effect.experienceBonusPct)}%。`);
  if (Number(effect.partyDropBonusPct ?? 0)) lines.push(`所在队伍打怪掉率提高 ${Number(effect.partyDropBonusPct)}%。`);
  if (Number(effect.playerAffinity ?? 0)) lines.push(`赠送给好友后，好感增加 ${Number(effect.playerAffinity)} 点。`);
  if (Number(effect.giftDailyLimit ?? 0)) lines.push(`每日最多可用于赠礼 ${Number(effect.giftDailyLimit)} 次。`);
  if (effect.starOathRing) lines.push('星誓仪式需要双方各准备一枚。');
  if (Number(effect.battleCount ?? 0)) lines.push(`持续 ${Number(effect.battleCount)} 场战斗。`);
  if (Number(effect.perBattleLimit ?? 0)) lines.push(`每场战斗最多使用 ${Number(effect.perBattleLimit)} 次。`);
  return { effect, lines };
};
const skillBookDetails = async (effectJson: unknown) => {
  const code = String(jsonObject(effectJson).skillBook ?? ''); if (!code) return null;
  const pool = await getPool();
  const [skills] = await pool.execute<any[]>('SELECT id,name,category,skill_kind,element,range_type,target_scope,power,mana_cost,cooldown_turns,chant_turns,description FROM skill_definitions WHERE code=? LIMIT 1', [code]);
  const skill = skills[0]; if (!skill) return null;
  const [effects] = await pool.execute<any[]>('SELECT e.name,se.value_override,se.duration_override,se.target_scope FROM skill_effects se JOIN effect_definitions e ON e.id=se.effect_id WHERE se.skill_id=? ORDER BY e.id', [skill.id]);
  return { skill, effects };
};
const foodDetails = async (itemId: number) => {
  const pool = await getPool();
  const [rows] = await pool.execute<any[]>('SELECT buff_json,duration_minutes FROM guild_restaurant_menu WHERE item_id=? AND is_active=1 LIMIT 1', [itemId]);
  return rows[0] ?? null;
};
const foodBuffText = (value: unknown) => {
  const buff = jsonObject(value); const labels: Record<string, string> = { hpPct: '生命上限', mpPct: '魔力上限', physicalAttackPct: '物攻', magicAttackPct: '魔攻', physicalDefensePct: '物防', magicDefensePct: '魔防', accuracyPct: '命中', evasionPct: '闪避', speedPct: '速度' };
  return Object.entries(buff).filter(([key, amount]) => labels[key] && Number(amount)).map(([key, amount]) => `${labels[key]}+${Number(amount)}%`).join('｜') || '获得餐食增益';
};

export default async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const item = await itemCodex(event.current.UserId, String(route.param('id')));
    const title = item.item_type === 'equipment' ? `【${item.item_category}】${item.name}` : item.name;
    const markdown = Format.createMarkdown().addTitle(title).addNewline().addNewline()
      .addText(`图鉴ID：${item.codex_id}\n重量：${Number(item.weight).toFixed(2)}`);
    if (item.item_type === 'equipment') {
      const sections = equipmentSections(item.effect_json, item.item_category, item.weapon_type);
      const isArmor = ['头肩', '上装', '腰部', '下装', '脚部'].includes(item.item_category);
      markdown.addText(`\n${isArmor ? '甲类' : '装备类型'}：${item.weapon_type ?? '通用'}\n耐久：100\n\n原始属性：\n`);
      for (const attribute of sections.attributes.length ? sections.attributes : ['无']) markdown.addBlockquote(attribute).addNewline();
      markdown.addNewline().addText('特殊属性：\n');
      for (const effect of sections.effects.length ? sections.effects : ['无']) markdown.addBlockquote(effect.replaceAll('$', '\\$').replaceAll('#', '\\#')).addNewline();
    }
    if (item.item_type === 'consumable') {
      const details = consumableEffects(item.effect_json);
      markdown.addText('\n\n效果：\n');
      for (const effect of details.lines.length ? details.lines : ['使用后会产生特殊效果。']) markdown.addBlockquote(effect).addNewline();
      const book = await skillBookDetails(item.effect_json);
      if (book) {
        const skill = book.skill;
        markdown.addNewline().addText(`可领悟技能：\n【${skill.name}】\n`).addBlockquote(`类别：${skill.category}｜种类：${skill.skill_kind || '无'}｜属性：${skill.element || '无'}｜距离：${skill.range_type || '无'}｜目标范围：${skill.target_scope || '单体'}`).addNewline()
          .addBlockquote(`威力：${skill.power}｜蓝耗：${skill.mana_cost}｜冷却：${skill.cooldown_turns}｜吟咏：${skill.chant_turns}`).addNewline();
        if (book.effects.length) markdown.addText('特殊效果：\n').addBlockquote(book.effects.map((effect: any) => `${effect.name}${effect.value_override !== null ? `：${effect.value_override}` : ''}${effect.duration_override !== null ? `（${effect.duration_override}回合）` : ''}${effect.target_scope === 'self' ? '（自身）' : ''}`).join('｜')).addNewline();
        markdown.addText('技能简介：\n').addBlockquote(skill.description).addNewline();
      }
      if (item.item_category === '食物') {
        const food = await foodDetails(Number(item.id));
        if (food) markdown.addNewline().addText('餐食增益：\n').addBlockquote(`${foodBuffText(food.buff_json)}（${food.duration_minutes}分钟）`).addNewline();
      }
    }
    markdown.addNewline().addText('简介：\n').addBlockquote(item.description).addNewline().addNewline().addText('获取来源：\n').addBlockquote(item.obtain_source);
    await message.send({ format: Format.create().addMarkdown(markdown) });
  } catch (error) {
    logger.warn({ err: error }, 'item codex failed');
    await message.send({ format: messageFormat('物品图鉴', error instanceof Error ? error.message : '请稍后重试。') });
  }
};
