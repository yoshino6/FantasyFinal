import { alchemyOutputDefinitions } from './alchemy-catalog.js';

const alchemyByCode = new Map(alchemyOutputDefinitions.map(item => [item.code, item]));
const itemEffect = (item) => {
    const current = alchemyByCode.get(item.code);
    if (current)
        return { ...current.effect, alchemyOutput: true };
    try {
        return typeof item.effect_json === 'string' ? JSON.parse(item.effect_json) : item.effect_json ?? {};
    }
    catch {
        return {};
    }
};
const combatItemEffect = (effect, pvp = false) => !effect.openingSafeRecovery && !effect.skillReset && !effect.repairKit && !effect.foodBuff && !effect.deviceBlueprintBox && !effect.skillBook && (!pvp || !effect.experienceBonusPct && !effect.partyDropBonusPct) && Boolean(effect.tactic || effect.status || effect.throwable || effect.cleanse || ['heal', 'restoreMp', 'healPct', 'restoreMpPct', 'experienceBonusPct', 'partyDropBonusPct'].some(key => Number(effect[key]) > 0));
const itemUsePolicy = (item) => {
    if (item.item_type && item.item_type !== 'consumable')
        return { kind: 'passive', reason: '用于装备或制作，无直接消耗操作。' };
    const effect = itemEffect(item);
    const workflow = (command, reason, autoEnter = true) => ({ kind: 'workflow', command, reason, autoEnter });
    if (typeof effect.chestTableCode === 'string' && /^[a-z0-9_]+$/.test(effect.chestTableCode))
        return workflow(`/宝箱内容 ${effect.chestTableCode}`, '查看概率并选择单个或批量开箱。');
    if (effect.skillReset)
        return workflow('/归悟洗练', '先预览回溯额度，再确认洗练。');
    if (effect.repairKit)
        return workflow('/修理装备', '选择本人装备修理。');
    if (effect.skillBook)
        return workflow(`/研读技能书 ${item.id}`, '研读并按原规则解锁技能。');
    if (effect.characterChange === 'name')
        return workflow('/角色改名 ', '填写新昵称后使用。', false);
    if (effect.characterChange === 'gender')
        return workflow('/改性 ', '选择男或女后使用。', false);
    if (effect.evolutionInjection)
        return workflow(`/进化针剂预览 ${String(effect.evolutionInjection)}`, '打开进化注射预览。');
    if (effect.evolutionSeed)
        return workflow('/感悟进化之种', '按主线进度感悟。');
    if (effect.map)
        return workflow(`/地图区域 ${String(effect.map)}`, '查看地图，不消耗地图。');
    if (effect.adventurerCard)
        return workflow('/卡片', '展示冒险者卡片，不消耗。');
    if (effect.target === 'enemy' || effect.throwable || effect.status || effect.cleanse || effect.tactic)
        return { kind: 'combat', reason: '需要战斗目标或回合状态，请在战斗中使用。' };
    if (effect.foodBuff || effect.deviceBlueprintBox || ['heal', 'restoreMp', 'healPct', 'restoreMpPct', 'revivePct', 'experienceBonusPct', 'partyDropBonusPct'].some(key => Number(effect[key]) > 0))
        return { kind: 'direct', reason: '可在战斗外使用。' };
    if (effect.constructionBlueprint)
        return { kind: 'passive', reason: '持有图纸后从个人构造面板使用，不直接消耗图纸。' };
    if (item.code === 'celestial_judicator_imitation')
        return { kind: 'combat', reason: '仅用于哥布林国王讨伐的专属战斗流程。' };
    if (effect.npcGift || effect.girlGratitudeGift || effect.starOathRing || effect.playerAffinity || item.code === 'demon_breaker_teleporter')
        return { kind: 'passive', reason: '用于对应任务、赠礼或交互流程，请查看物品简介。' };
    return { kind: 'unsupported', reason: '尚无已接入的直接使用效果，不消耗物品。' };
};

export { combatItemEffect, itemEffect, itemUsePolicy };
