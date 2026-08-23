import { Format, logger, useEvent, useMessage, useRoute } from 'alemonjs';
import { equipmentDetail } from '../game/adventure.service';
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

const equipmentSections = (effectJson: unknown, quality: number, primaryJson: unknown) => {
  const effect = (typeof effectJson === 'string' ? JSON.parse(effectJson) : effectJson ?? {}) as Record<string, unknown>;
  const primaryKeys = (() => {
    try {
      const raw = typeof primaryJson === 'string' ? JSON.parse(primaryJson) : primaryJson;
      return Array.isArray(raw) ? new Set(raw.filter(key => typeof key === 'string')) : new Set<string>();
    } catch { return new Set<string>(); }
  })();
  const scale = .6 + Math.max(0, Math.min(100, quality)) * .004;
  const labels: Record<string, string> = {
    hpMax: '生命', mpMax: '魔力', physicalAttack: '物攻', magicAttack: '魔攻', physicalDefense: '物防', magicDefense: '魔防', accuracy: '命中', evasion: '闪避', speed: '速度', critRateBp: '暴击', physicalAttackPct: '物攻',
    magicAttackPct: '魔攻', physicalDefensePct: '物防', magicDefensePct: '魔防', critRatePct: '暴击', critDamagePct: '暴伤', accuracyPct: '命中', evasionPct: '闪避', speedPct: '速度', mpPct: '魔力', hpPct: '生命', tenacityPct: '韧性'
  };
  const attributeLabel = (key: string) => labels[key] ?? (key.startsWith('elementMastery_') ? `${key.slice('elementMastery_'.length)}元素精通` : key.startsWith('elementResistance_') ? `${key.slice('elementResistance_'.length)}元素抗性` : '');
  const attributes = Object.entries(effect)
    .filter(([key, value]) => attributeLabel(key) && Number(value))
    .map(([key, value]) => { const actual = key.endsWith('Pct') ? `${(Number(value) * scale).toFixed(1)}%` : key.startsWith('element') ? (Number(value) * scale).toFixed(1) : String(Math.floor(Number(value) * scale)); const kind = primaryKeys.size ? (primaryKeys.has(key) ? '(主)' : '(副)') : ''; return `${attributeLabel(key)} ${Number(value) >= 0 ? '+' : ''}${actual}${kind}`; });
  const effectLabels: Record<string, string> = {
    ignoreDefensePct: '无视目标物理防御', lifestealPct: '造成伤害后恢复生命', magicDamagePct: '魔法伤害提高', manaCostReduction: '技能魔力消耗降低', damageBonusPct: '造成伤害提高', minimumHitRatePct: '攻击命中率最低',
    actualHitRatePct: '实际命中率', physicalActualHitRatePct: '物理攻击实际命中率', physicalSkillDamagePct: '物理技能威力提高', magicSkillDamagePct: '魔法技能增伤', magicChantBonus: '魔法技能吟咏增加', physicalCriticalFinalDamagePct: '物理攻击暴击时最终伤害降低'
  };
  const effects = Object.entries(effect)
    .filter(([key, value]) => effectLabels[key] && Number(value))
    .map(([key, value]) => key === 'physicalCriticalFinalDamagePct'
      ? `${effectLabels[key]} ${Math.abs(Number(value))}%`
      : `${effectLabels[key]} ${key === 'manaCostReduction' || key === 'magicChantBonus' ? value : `${value}%`}`);
  if (effect.physicalForceCrit) effects.unshift('你的物理攻击必定暴击。');
  const artifact = String(effect.artifact ?? '');
  if (artifactEffects[artifact]) effects.unshift(...artifactEffects[artifact]);
  return { attributes, effects };
};

export default async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const item = await equipmentDetail(event.current.UserId, Number(route.param('id')));
    const sections = equipmentSections(item.effect_json, Number(item.quality), item.forge_primary_json);
    const markdown = Format.createMarkdown()
      .addTitle('装备详情')
      .addNewline()
      .addNewline()
      .addText(`[${item.item_category}]${item.name}\n装备等级：Lv.${item.required_level}\n品质：${Number(item.quality).toFixed(1)}%\n耐久：${item.durability}/${item.durability_max}\n\n装备属性：`)
      .addNewline();

    for (const attribute of sections.attributes.length ? sections.attributes : ['无']) {
      markdown.addBlockquote(attribute).addNewline();
    }
    markdown.addNewline().addText('装备效果：').addNewline();
    for (const effect of sections.effects.length ? sections.effects : ['无']) {
      markdown.addBlockquote(effect.replaceAll('$', '\\$').replaceAll('#', '\\#')).addNewline();
    }
    markdown.addNewline().addText('简介：').addNewline().addBlockquote(item.description);
    await message.send({ format: Format.create().addMarkdown(markdown) });
  } catch (error) {
    logger.warn({ err: error, userId: event.current.UserId }, 'load equipment detail failed');
    await message.send({ format: messageFormat('装备详情', error instanceof Error ? error.message : '请稍后重试。') });
  }
};
