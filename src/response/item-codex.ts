import { Format, logger, useEvent, useMessage, useRoute } from 'alemonjs';
import { itemCodex } from '../game/adventure.service';
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

const equipmentSections = (effectJson: unknown) => {
  const effect = jsonObject(effectJson);
  const attributeLabels: Record<string, string> = {
    physicalAttack: '物理攻击', magicAttack: '魔法攻击', critRateBp: '暴击', physicalAttackPct: '物理攻击', magicAttackPct: '魔法攻击',
    physicalDefensePct: '物理防御', magicDefensePct: '魔法防御', critRatePct: '暴击', critDamagePct: '暴伤', accuracyPct: '命中', evasionPct: '闪避', speedPct: '速度', mpPct: '魔力', hpPct: '生命', tenacityPct: '韧性'
  };
  const attributes = Object.entries(effect).filter(([key, value]) => attributeLabels[key] && Number(value)).map(([key, value]) => `${attributeLabels[key]} ${Number(value) >= 0 ? '+' : ''}${key.endsWith('Pct') ? `${Number(value)}%` : Number(value)}`);
  const effectLabels: Record<string, string> = { ignoreDefensePct: '无视目标物理防御', lifestealPct: '造成伤害后恢复生命', magicDamagePct: '魔法伤害提高', manaCostReduction: '技能魔力消耗降低', damageBonusPct: '造成伤害提高', minimumHitRatePct: '攻击命中率最低' };
  const effects = Object.entries(effect).filter(([key, value]) => effectLabels[key] && Number(value)).map(([key, value]) => `${effectLabels[key]} ${key === 'manaCostReduction' ? value : `${value}%`}`);
  const artifact = String(effect.artifact ?? '');
  if (artifactEffects[artifact]) effects.unshift(...artifactEffects[artifact]);
  return { attributes, effects };
};

export default async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const item = await itemCodex(event.current.UserId, String(route.param('id')));
    const title = item.item_type === 'equipment' ? `【${item.item_category}】${item.name}` : item.name;
    const markdown = Format.createMarkdown().addTitle(title).addNewline().addNewline()
      .addText(`图鉴ID：${item.codex_id}\n重量：${Number(item.weight).toFixed(2)}`);
    if (item.item_type === 'equipment') {
      const sections = equipmentSections(item.effect_json);
      markdown.addText('\n耐久：100\n\n原始属性：\n');
      for (const attribute of sections.attributes.length ? sections.attributes : ['无']) markdown.addBlockquote(attribute).addNewline();
      markdown.addNewline().addText('原始效果：\n');
      for (const effect of sections.effects.length ? sections.effects : ['无']) markdown.addBlockquote(effect.replaceAll('$', '\\$').replaceAll('#', '\\#')).addNewline();
    }
    markdown.addNewline().addText('简介：\n').addBlockquote(item.description).addNewline().addNewline().addText('获取来源：\n').addBlockquote(item.obtain_source);
    await message.send({ format: Format.create().addMarkdown(markdown) });
  } catch (error) {
    logger.warn({ err: error }, 'item codex failed');
    await message.send({ format: messageFormat('物品图鉴', error instanceof Error ? error.message : '请稍后重试。') });
  }
};
