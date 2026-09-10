import { forgeRarityMultiplier, forgedEquipmentBase, legacyForgedEquipmentBase } from './constants.js';
import { armorSlot } from './armor-class.js';

const balanceRecord = (value) => typeof value === 'string' ? JSON.parse(value) : value && typeof value === 'object' ? value : {};
const round = (value) => Math.round(value * 100) / 100;
const resetLegacyEquipmentPrimary = (item, instanceEffect, fusionEffects = []) => {
    const definition = balanceRecord(item.effect_json), effect = instanceEffect == null ? definition : balanceRecord(instanceEffect);
    if (item.rarity === '神器' || definition.artifact || effect.artifact)
        return { effect, changed: false, blocked: false, reason: '神器不调整' };
    const slot = armorSlot(String(definition.slot ?? item.item_category)), weapon = ['武器', '副手'].includes(item.item_category), shield = item.weapon_type === '盾牌';
    if (!slot && !weapon)
        return { effect, changed: false, blocked: false, reason: '不属于主词条调整范围' };
    const keys = !weapon || shield ? ['physicalDefense', 'magicDefense'] : item.weapon_type === '匕首' ? ['physicalAttack', 'magicAttack'] : ['法杖', '法书', '法球'].includes(item.weapon_type ?? '') ? ['magicAttack'] : ['physicalAttack'];
    const base = forgedEquipmentBase(Number(item.required_level), weapon ? '武器' : '防具', slot) * (forgeRarityMultiplier[item.rarity] ?? 1);
    const out = { ...effect };
    for (const key of keys) {
        const coefficient = shield && key === 'magicDefense' ? .5 : weapon && item.weapon_type === '匕首' ? .9 : 1;
        const immutable = /^(crafted_|epic_|owner_test_)/.test(item.code) && Number(definition.balanceVersion ?? 0) < 3;
        const requested = fusionEffects.reduce((sum, row) => sum + Math.max(0, Number(balanceRecord(row)[key] ?? 0)), 0);
        const verified = instanceEffect != null && immutable ? Math.min(requested, Math.max(0, Number(effect[key] ?? 0) - Number(definition[key] ?? 0))) : 0;
        out[key] = round(base * coefficient + verified);
    }
    out.balanceVersion = 3;
    return { effect: out, changed: true, blocked: false, reason: '已授权按新标准重设主词条，仅保留台账与实例差额共同可核实的熔铸增量' };
};
const equipmentBalancePreview = (item, instanceEffect) => {
    const definition = balanceRecord(item.effect_json), effect = instanceEffect == null ? definition : balanceRecord(instanceEffect);
    const unchanged = (reason) => ({ effect, changed: false, blocked: false, reason });
    const blocked = (reason) => ({ effect, changed: false, blocked: true, reason });
    if (item.rarity === '神器' || definition.artifact || effect.artifact)
        return unchanged('神器不调整');
    if (Number(effect.balanceVersion ?? 0) >= 3)
        return unchanged('已是新版');
    const slot = armorSlot(String(definition.slot ?? item.item_category));
    const weapon = ['武器', '副手'].includes(item.item_category), shield = item.weapon_type === '盾牌';
    if (!slot && !weapon)
        return unchanged('不属于武器或五个防具部位');
    const keys = !weapon || shield ? ['physicalDefense', 'magicDefense'] : item.weapon_type === '匕首' ? ['physicalAttack', 'magicAttack'] : ['法杖', '法书', '法球'].includes(item.weapon_type ?? '') ? ['magicAttack'] : ['physicalAttack'];
    const rarity = forgeRarityMultiplier[item.rarity];
    if (!rarity)
        return blocked('无法识别稀有度');
    const category = weapon ? '武器' : '防具', level = Number(item.required_level);
    const oldBase = legacyForgedEquipmentBase(level, category) * rarity, newBase = forgedEquipmentBase(level, category, slot) * rarity;
    const out = { ...effect };
    for (const key of keys) {
        const coefficient = shield && key === 'magicDefense' ? .5 : weapon && item.weapon_type === '匕首' ? .9 : 1;
        const before = Number(definition[key] ?? 0), value = Number(effect[key] ?? 0), oldNominal = oldBase * coefficient, newNominal = newBase * coefficient;
        if (!Number.isFinite(before) || !Number.isFinite(value) || before <= 0)
            return blocked(`缺少可核实的${key}主词条`);
        const matchesNew = Math.abs(before - newNominal) < .02 || Math.abs(before - Math.floor(newNominal)) < .001;
        const matchesOld = Math.abs(before - oldNominal) < .02 || Math.abs(before - Math.floor(oldNominal)) < .001;
        const rolledOld = weapon && !shield && item.code.startsWith('crafted_') && before >= oldNominal * .9 - .02 && before <= oldNominal * 1.1 + .02;
        if (matchesNew && Math.abs(value - before) < .02) {
            out[key] = before;
            continue;
        }
        if (Number(definition.balanceVersion ?? 0) >= 3 || matchesNew)
            return blocked('定义已经更新，实例主词条来源需核实');
        if (!matchesOld && !rolledOld)
            return blocked(`旧${key}不匹配已知锻造基准，需核实历史版本或辅材投入`);
        if (value < before - .02)
            return blocked(`实例${key}低于定义，不能推断历史缩放`);
        const newPrimary = matchesOld ? newNominal : before / oldNominal * newNominal;
        out[key] = round(newPrimary + value - before);
    }
    out.balanceVersion = 3;
    return { effect: out, changed: true, blocked: false, reason: '仅调整可核实主词条，保留全部其他字段及实例差额' };
};

export { balanceRecord, equipmentBalancePreview, resetLegacyEquipmentPrimary };
