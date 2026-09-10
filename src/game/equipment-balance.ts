import { forgedEquipmentBase, legacyForgedEquipmentBase, forgeRarityMultiplier } from './constants';
import { armorSlot } from './armor-class';

export type BalanceEquipment = { code: string; item_category: string; weapon_type: string | null; required_level: number; rarity: string; effect_json: unknown };
export const balanceRecord = (value: unknown): Record<string, unknown> => typeof value === 'string' ? JSON.parse(value) : value && typeof value === 'object' ? value as Record<string, unknown> : {};
const round = (value: number) => Math.round(value * 100) / 100;

/** 历史主词条重设是显式策略，普通预览不会擅自采用。 */
export const resetLegacyEquipmentPrimary = (item: BalanceEquipment, instanceEffect?: unknown, fusionEffects: unknown[] = []) => {
  const definition = balanceRecord(item.effect_json), effect = instanceEffect == null ? definition : balanceRecord(instanceEffect);
  if (item.rarity === '神器' || definition.artifact || effect.artifact) return {effect, changed:false, blocked:false, reason:'神器不调整'};
  const slot = armorSlot(String(definition.slot ?? item.item_category)), weapon = ['武器','副手'].includes(item.item_category), shield = item.weapon_type === '盾牌';
  if (!slot && !weapon) return {effect, changed:false, blocked:false, reason:'不属于主词条调整范围'};
  const keys = !weapon || shield ? ['physicalDefense','magicDefense'] : item.weapon_type === '匕首' ? ['physicalAttack','magicAttack'] : ['法杖','法书','法球'].includes(item.weapon_type ?? '') ? ['magicAttack'] : ['physicalAttack'];
  const base = forgedEquipmentBase(Number(item.required_level),weapon?'武器':'防具',slot) * (forgeRarityMultiplier[item.rarity] ?? 1);
  const out = {...effect};
  for(const key of keys) {
    const coefficient = shield && key==='magicDefense' ? .5 : weapon && item.weapon_type==='匕首' ? .9 : 1;
    // 打造定义是原始成品；商店定义会被启动更新，不能用它还原旧基准。
    const immutable = /^(crafted_|epic_|owner_test_)/.test(item.code) && Number(definition.balanceVersion??0)<3;
    const requested = fusionEffects.reduce<number>((sum,row)=>sum+Math.max(0,Number(balanceRecord(row)[key]??0)),0);
    const verified = instanceEffect != null && immutable ? Math.min(requested,Math.max(0,Number(effect[key]??0)-Number(definition[key]??0))) : 0;
    out[key] = round(base * coefficient + verified);
  }
  out.balanceVersion=3;
  return {effect:out,changed:true,blocked:false,reason:'已授权按新标准重设主词条，仅保留台账与实例差额共同可核实的熔铸增量'};
};

/** 只处理能从旧主词条基准核实的记录；不推断历史自定义装备，也不把熔铸台账的申请量当成实得量。 */
export const equipmentBalancePreview = (item: BalanceEquipment, instanceEffect?: unknown) => {
  const definition = balanceRecord(item.effect_json), effect = instanceEffect == null ? definition : balanceRecord(instanceEffect);
  const unchanged = (reason: string) => ({ effect, changed: false, blocked: false, reason });
  const blocked = (reason: string) => ({ effect, changed: false, blocked: true, reason });
  if (item.rarity === '神器' || definition.artifact || effect.artifact) return unchanged('神器不调整');
  if (Number(effect.balanceVersion ?? 0) >= 3) return unchanged('已是新版');
  const slot = armorSlot(String(definition.slot ?? item.item_category));
  const weapon = ['武器','副手'].includes(item.item_category), shield = item.weapon_type === '盾牌';
  if (!slot && !weapon) return unchanged('不属于武器或五个防具部位');
  const keys = !weapon || shield ? ['physicalDefense','magicDefense'] : item.weapon_type === '匕首' ? ['physicalAttack','magicAttack'] : ['法杖','法书','法球'].includes(item.weapon_type ?? '') ? ['magicAttack'] : ['physicalAttack'];
  const rarity = forgeRarityMultiplier[item.rarity]; if (!rarity) return blocked('无法识别稀有度');
  const category = weapon ? '武器' : '防具', level = Number(item.required_level);
  const oldBase = legacyForgedEquipmentBase(level, category) * rarity, newBase = forgedEquipmentBase(level, category, slot) * rarity;
  const out = {...effect};
  for (const key of keys) {
    const coefficient = shield && key === 'magicDefense' ? .5 : weapon && item.weapon_type === '匕首' ? .9 : 1;
    const before = Number(definition[key] ?? 0), value = Number(effect[key] ?? 0), oldNominal = oldBase * coefficient, newNominal = newBase * coefficient;
    if (!Number.isFinite(before) || !Number.isFinite(value) || before <= 0) return blocked(`缺少可核实的${key}主词条`);
    // 商店/开局定义可能已被初始化更新；实例与定义不同则必须继续审计，不能只标记为已迁移。
    const matchesNew = Math.abs(before - newNominal) < .02 || Math.abs(before - Math.floor(newNominal)) < .001;
    const matchesOld = Math.abs(before - oldNominal) < .02 || Math.abs(before - Math.floor(oldNominal)) < .001;
    const rolledOld = weapon && !shield && item.code.startsWith('crafted_') && before >= oldNominal * .9 - .02 && before <= oldNominal * 1.1 + .02;
    if (matchesNew && Math.abs(value - before) < .02) { out[key] = before; continue; }
    if (Number(definition.balanceVersion ?? 0) >= 3 || matchesNew) return blocked('定义已经更新，实例主词条来源需核实');
    if (!matchesOld && !rolledOld) return blocked(`旧${key}不匹配已知锻造基准，需核实历史版本或辅材投入`);
    if (value < before - .02) return blocked(`实例${key}低于定义，不能推断历史缩放`);
    const newPrimary = matchesOld ? newNominal : before / oldNominal * newNominal;
    // 主词条以外的差额原值保留，既不乘倍率，也不套用新上限截断。
    out[key] = round(newPrimary + value - before);
  }
  out.balanceVersion = 3;
  return { effect: out, changed: true, blocked: false, reason:'仅调整可核实主词条，保留全部其他字段及实例差额' };
};
