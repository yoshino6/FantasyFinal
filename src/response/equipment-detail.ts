import { armorPieceDescription } from '../game/armor-class';
import { Format, logger, useEvent, useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { equipmentDetail, equippedEquipmentDetails } from '../game/adventure.service';
import { forgePrimaryKeys } from '../game/blacksmith.service';
import { armorClassDefenseMultiplier } from '../game/character.service';
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

const slotNames: Record<string, string> = { weapon: '武器', offhand: '副手', shoulder: '头肩', upper: '上装', waist: '腰部', lower: '下装', feet: '脚部', necklace: '项链', bracelet: '手镯', ring: '戒指' };
type EquipmentDetailItem = Omit<Awaited<ReturnType<typeof equipmentDetail>>, 'fusionEffects'> & { fusionEffects?: Array<{ materialName: string; key: string; value: number; createdAt: Date }> };

const equipmentSections = (effectJson: unknown, quality: number, primaryJson: unknown, category: string, subtype: string | null) => {
  const effect = (typeof effectJson === 'string' ? JSON.parse(effectJson) : effectJson ?? {}) as Record<string, unknown>;
  const primaryKeys = (() => {
    try {
      const raw = typeof primaryJson === 'string' ? JSON.parse(primaryJson) : primaryJson;
      return Array.isArray(raw) ? new Set(raw.filter(key => typeof key === 'string')) : new Set<string>();
    } catch { return new Set<string>(); }
  })();
  if (!primaryKeys.size) for (const key of forgePrimaryKeys(category, subtype)) primaryKeys.add(key);
  const scale = .6 + Math.max(0, Math.min(100, quality)) * .004;
  const labels: Record<string, string> = {
    hpMax: '生命', mpMax: '魔力', physicalAttack: '物攻', magicAttack: '魔攻', physicalDefense: '物防', magicDefense: '魔防', accuracy: '命中', evasion: '闪避', speed: '速度', critRateBp: '暴击', critDamageBp: '暴伤', critResistBp: '暴免', critDamageReductionBp: '暴抗', physicalAttackPct: '物攻',
    magicAttackPct: '魔攻', physicalDefensePct: '物防', magicDefensePct: '魔防', critRatePct: '暴击', critDamagePct: '暴伤', accuracyPct: '命中', evasionPct: '闪避', speedPct: '速度', mpPct: '魔力', hpPct: '生命', tenacity: '韧性', tenacityPct: '韧性', tenacityPierce: '破韧', tenacityPiercePct: '破韧', constitutionPct: '体质', spiritPct: '精神', strengthPct: '力量', intelligencePct: '智力', agilityPct: '敏捷', perceptionPct: '感知'
  };
  const attributeLabel = (key: string) => labels[key] ?? (key.startsWith('elementMastery_') ? `${key.slice('elementMastery_'.length)}元素精通` : key.startsWith('elementResistance_') ? `${key.slice('elementResistance_'.length)}元素抗性` : '');
  const normalOrder = ['hpMax', 'mpMax', 'physicalAttack', 'magicAttack', 'physicalDefense', 'magicDefense', 'accuracy', 'evasion', 'speed', 'critRateBp', 'critDamageBp', 'critResistBp', 'critDamageReductionBp', 'tenacity', 'tenacityPierce', 'hpPct', 'mpPct', 'physicalAttackPct', 'magicAttackPct', 'physicalDefensePct', 'magicDefensePct', 'accuracyPct', 'evasionPct', 'speedPct', 'critRatePct', 'critDamagePct', 'tenacityPct', 'tenacityPiercePct'];
  const elementalOrder = ['金', '木', '水', '火', '土', '风', '雷', '冰', '光', '暗'];
  const attributes = Object.entries(effect)
    .filter(([key, value]) => attributeLabel(key) && Number(value))
    .map(([key, value]) => {
      const raw = key.endsWith('Pct') ? `${Number(value).toFixed(1)}%` : key.startsWith('element') ? Number(value).toFixed(1) : String(Math.round(Number(value)));
      const armorScale = key === 'physicalDefense' || key === 'magicDefense' ? armorClassDefenseMultiplier(subtype, key) : 1;
      const actual = key.endsWith('Pct') ? `${(Number(value) * scale).toFixed(1)}%` : key.startsWith('element') ? (Number(value) * scale).toFixed(1) : String(Math.floor(Number(value) * scale * armorScale));
      const group = primaryKeys.has(key) ? 0 : key.startsWith('elementMastery_') || key.startsWith('elementResistance_') ? 2 : 1;
      const order = group === 2 ? elementalOrder.indexOf(key.split('_')[1] ?? '') * 2 + (key.startsWith('elementResistance_') ? 1 : 0) : normalOrder.indexOf(key);
      return { group, order: order < 0 ? Number.MAX_SAFE_INTEGER : order, text: `${attributeLabel(key)} 原始+${raw}｜实际+${actual}${primaryKeys.has(key) ? '(主)' : '(副)'}` };
    })
    .sort((left, right) => left.group - right.group || left.order - right.order || left.text.localeCompare(right.text, 'zh-CN'))
    .map(attribute => attribute.text);
  const effectLabels: Record<string, string> = {
    ignoreDefensePct: '无视目标物理防御', lifestealPct: '造成伤害后恢复生命', magicDamagePct: '魔法伤害提高', manaCostReduction: '技能魔力消耗降低', damageBonusPct: '造成伤害提高', damageReductionPct: '受到伤害降低', minimumHitRatePct: '攻击命中率最低',
    actualHitRatePct: '实际命中率', physicalActualHitRatePct: '物理攻击实际命中率', physicalSkillDamagePct: '物理技能威力提高', magicSkillDamagePct: '魔法技能增伤', magicChantBonus: '魔法技能吟咏增加', physicalCriticalFinalDamagePct: '物理攻击暴击时最终伤害降低'
  };
  const effects = Object.entries(effect)
    .filter(([key, value]) => effectLabels[key] && Number(value))
    .map(([key, value]) => {
      const prefix = key === 'damageBonusPct' || key === 'damageReductionPct' ? '⭐️' : '';
      return key === 'physicalCriticalFinalDamagePct'
        ? `${prefix}${effectLabels[key]} ${Math.abs(Number(value))}%`
        : `${prefix}${effectLabels[key]} ${key === 'manaCostReduction' || key === 'magicChantBonus' ? value : `${value}%`}`;
    });
  const armorText = armorPieceDescription(subtype, String(effect.slot ?? category), quality);
  if (armorText) effects.unshift('甲类逐件乘算：' + armorText);
  if (effect.physicalForceCrit) effects.unshift('你的物理攻击必定暴击。');
  const artifact = String(effect.artifact ?? '');
  if (artifactEffects[artifact]) effects.unshift(...artifactEffects[artifact]);
  return { attributes, effects };
};

const detailMarkdown = (item: EquipmentDetailItem, heading = '装备详情') => {
  const sections = equipmentSections(item.effect_json, Number(item.quality), item.forge_primary_json, item.item_category, item.weapon_type);
  const isArmor = ['头肩', '上装', '腰部', '下装', '脚部'].includes(item.item_category);
  const typeText = isArmor ? `甲类：${item.weapon_type ?? '通用'}` : `装备类型：${item.weapon_type ?? '通用'}`;
  const markdown = Format.createMarkdown()
    .addTitle(heading)
    .addNewline()
    .addNewline()
    .addText(`[${item.item_category}]${item.name}\n${typeText}\n装备等级：Lv.${item.required_level}\n品质：${item.rarity}${Number(item.quality).toFixed(1)}%\n耐久：${item.durability}/${item.durability_max}\n\n装备属性：`)
    .addNewline();
  for (const attribute of sections.attributes.length ? sections.attributes : ['无']) markdown.addBlockquote(attribute).addNewline();
  markdown.addNewline().addText('特殊属性：').addNewline();
  for (const effect of sections.effects.length ? sections.effects : ['无']) markdown.addBlockquote(effect.replaceAll('$', '\\$').replaceAll('#', '\\#')).addNewline();
  const fusionLabels: Record<string, string> = { hpMax:'生命',mpMax:'魔力',physicalAttack:'物攻',magicAttack:'魔攻',physicalDefense:'物防',magicDefense:'魔防',accuracy:'命中',evasion:'闪避',critRateBp:'暴击',critDamageBp:'暴伤',critResistBp:'暴免',critDamageReductionBp:'暴抗',tenacity:'韧性',tenacityPierce:'破韧',speed:'速度',hpPct:'生命',mpPct:'魔力',physicalAttackPct:'物攻',magicAttackPct:'魔攻',physicalDefensePct:'物防',magicDefensePct:'魔防',accuracyPct:'命中',evasionPct:'闪避',critRatePct:'暴击',critDamagePct:'暴伤',critResistPct:'暴免',critDamageReductionPct:'暴抗',tenacityPct:'韧性',tenacityPiercePct:'破韧',speedPct:'速度',damageBonusPct:'造成伤害',constitutionPct:'体质',spiritPct:'精神',strengthPct:'力量',intelligencePct:'智力',agilityPct:'敏捷',perceptionPct:'感知' };
  const fusionText = (entry: { materialName: string; key: string; value: number }) => { const label = fusionLabels[entry.key] ?? (entry.key.startsWith('elementMastery_') ? `${entry.key.slice('elementMastery_'.length)}元素精通` : entry.key.startsWith('elementResistance_') ? `${entry.key.slice('elementResistance_'.length)}元素抗性` : entry.key); return `${entry.materialName}：${label}+${Number(entry.value).toFixed(2)}${entry.key.endsWith('Pct') ? '%' : ''}`; };
  if (item.fusionEffects?.length) {
    markdown.addNewline().addText('熔铸记录：').addNewline();
    for (const effect of item.fusionEffects) markdown.addBlockquote(fusionText(effect)).addNewline();
  }
  return markdown.addNewline().addText('简介：').addNewline().addBlockquote(item.description);
};

export default async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const item = await equipmentDetail(event.current.UserId, Number(route.param('id')));
    await message.send({ format: Format.create().addMarkdown(detailMarkdown(item)) });
  } catch (error) {
    logger.warn({ err: error, userId: event.current.UserId }, 'load equipment detail failed');
    await message.send({ format: messageFormat('装备详情', error instanceof Error ? error.message : '请稍后重试。') });
  }
};

export const equippedEquipmentDetailHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    const items = await equippedEquipmentDetails(event.current.UserId);
    if (!items.length) throw new Error('当前没有已装备的物品。');
    const actualAttributes = (item: EquipmentDetailItem) => {
      const attributes = equipmentSections(item.effect_json, Number(item.quality), item.forge_primary_json, item.item_category, item.weapon_type).attributes;
      const actualText = (attribute: string) => attribute.replace(/^(.+?) 原始\+.+?｜实际\+(.+?)\((?:主|副)\)$/u, '$1+$2');
      return {
        primary: attributes.filter(attribute => attribute.endsWith('(主)')).map(actualText),
        secondary: attributes.filter(attribute => attribute.endsWith('(副)')).map(actualText)
      };
    };
    const marks = '①②③④⑤⑥⑦⑧⑨⑩';
    const markdown = Format.createMarkdown().addTitle('装备详情').addNewline().addNewline();
    for (const [index, item] of items.entries()) {
      const attributes = actualAttributes(item);
      markdown.addText(`${marks.charAt(index) || `${index + 1}.`}【${slotNames[item.slot] ?? item.slot}】`).addNewline()
        .addBlockquote(`主属性：${attributes.primary.join('、') || '无'}`).addNewline()
        .addBlockquote(`副属性：${attributes.secondary.join('、') || '无'}`).addNewline();
    }
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回装备', '/装备', { type: 'command', autoEnter: true })) });
  } catch (error) {
    logger.warn({ err: error, userId: event.current.UserId }, 'load equipped equipment detail failed');
    await message.send({ format: messageFormat('装备详情', error instanceof Error ? error.message : '请稍后重试。') });
  }
};
