const kingbeastPhaseTransitions = {
    split: {
        code: 'split', title: '第二阶段·王座分离',
        description: '雷光缠绕的王旗骤然展开。哥布林国王一脚蹬开破碎的鞍座，从哈巴龙背上翻身跃下；断裂的缰具坠入泥地，巨龙仰首咆哮。',
        dialogue: [{ speaker: '哥布林国王', text: '算了，我自己来！' }, { speaker: '哈巴龙', text: '吼——！' }],
        effect: '哥布林国王与哈巴龙解除合体；从下一轮正常行动序列起，双方分别行动。'
    },
    castling: {
        code: 'castling', title: '第三阶段·王车易位',
        description: '国王手中的王旗猛然回卷。哈巴龙踏碎地面横冲而来，以庞大的身躯撞开战线，将摇摇欲坠的国王完全挡在身后。',
        dialogue: [{ speaker: '哥布林国王', text: '哈巴龙，护驾！把他们全都碾碎！' }, { speaker: '哈巴龙', text: '吼！' }],
        effect: '哈巴龙强制承接单体攻击并获得20%最终减伤，持续3次自身行动；哥布林国王永久获得20%攻击提升。'
    },
    enrage_king: {
        code: 'enrage_king', title: '最终阶段·孤王狂怒',
        description: '哈巴龙轰然倒地，泥水与断木一同飞溅。哥布林国王扶正歪斜的王冠，雷光沿王旗寸寸爬升，最后在他的怒吼中炸裂。',
        dialogue: [{ speaker: '哥布林国王', text: '你们会为此付出代价！' }],
        effect: '哥布林国王进入永久狂暴：攻击+30%、命中+20%、速度+15%、控制抗性+30%。'
    },
    enrage_dragon: {
        code: 'enrage_dragon', title: '最终阶段·孤龙狂怒',
        description: '王旗坠入尘土，最后一截缰绳随之崩断。失去驾驭者的哈巴龙缓缓转身，竖瞳里再没有半分畏缩，只剩下失控的暴怒。',
        dialogue: [{ speaker: '哈巴龙', text: '嗷——！' }],
        effect: '哈巴龙进入永久狂暴：攻击+30%、命中+20%、速度+15%、控制抗性+30%。'
    }
};
const kingbeastPhaseTransition = (code) => {
    const transition = kingbeastPhaseTransitions[code];
    return { ...transition, dialogue: transition.dialogue.map(line => ({ ...line })) };
};
const kingbeastPhaseTransitionLog = (transition) => [
    `$阶段转换·${transition.title}$${transition.description}`,
    ...transition.dialogue.map(line => `$${line.speaker}$“${line.text}”`)
].join('\n');
const withoutKingbeastPhaseTransitionLogs = (logs, transitionLogs) => logs.filter(line => !transitionLogs.has(line) && !line.startsWith('$阶段转换·'));
const bossPhaseTransitionLogsAfterRound = (logs, transitionLogs, roundSuffix = '') => {
    const roundLogs = withoutKingbeastPhaseTransitionLogs(logs, transitionLogs);
    if (roundSuffix) {
        if (roundLogs.length)
            roundLogs[roundLogs.length - 1] += roundSuffix;
        else
            roundLogs.push(roundSuffix);
    }
    return [...roundLogs, ...transitionLogs];
};
const objectValue = (value) => {
    if (!value)
        return {};
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        }
        catch {
            return {};
        }
    }
    return typeof value === 'object' && !Array.isArray(value) ? value : {};
};
const arrayValue = (value) => {
    if (!value)
        return [];
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        }
        catch {
            return [];
        }
    }
    return Array.isArray(value) ? value : [];
};
const kingbeastEncounter = (unit) => arrayValue(unit.traits_json)
    .map(objectValue)
    .find(trait => trait.code === 'kingbeast_encounter');
const kingbeastUnitRole = (unit) => String(kingbeastEncounter(unit)?.role ?? '');
const kingbeastGroupId = (unit) => String(kingbeastEncounter(unit)?.groupId ?? '');
const kingbeastMapTargets = (units) => {
    const seen = new Set();
    return units.flatMap(unit => {
        const group = kingbeastGroupId(unit);
        if (group && ['guard', 'spearman'].includes(kingbeastUnitRole(unit)))
            return [];
        if (!group || !isKingbeastPrimaryCore(unit))
            return [unit];
        if (seen.has(group))
            return [];
        seen.add(group);
        const representative = units.find(other => kingbeastGroupId(other) === group && kingbeastUnitRole(other) === 'dragon') ?? unit;
        return [{ ...representative, name: '哥布林国王＆哈巴龙' }];
    });
};
const isKingbeastPrimaryCore = (unit) => ['king', 'dragon'].includes(kingbeastUnitRole(unit));
const isLivingKingbeastUnit = (unit) => !Boolean(unit.is_defeated) && Number(unit.current_hp ?? 1) > 0;
const kingbeastCooldowns = (unit) => objectValue(unit.cooldowns);
const kingbeastFused = (units) => {
    const cores = units.filter(isKingbeastPrimaryCore);
    return cores.length === 2 && cores.some(core => !Boolean(kingbeastCooldowns(core).kingbeast_phase_two));
};
const isHiddenFusedKing = (unit, units) => kingbeastUnitRole(unit) === 'king'
    && kingbeastFused(units.filter(candidate => kingbeastGroupId(candidate) === kingbeastGroupId(unit)));
const kingbeastForcedSingleTarget = (units) => {
    const cores = units.filter(unit => isKingbeastPrimaryCore(unit) && isLivingKingbeastUnit(unit));
    const dragon = cores.find(unit => kingbeastUnitRole(unit) === 'dragon');
    if (!dragon)
        return undefined;
    if (kingbeastFused(units))
        return undefined;
    return Number(kingbeastCooldowns(dragon).kingbeast_castling_turns ?? 0) > 0 ? dragon : undefined;
};
const kingbeastSelectableTargets = (units) => units.filter(unit => isLivingKingbeastUnit(unit) && !isHiddenFusedKing(unit, units));
const kingbeastSymbiosisActive = (units, groupId = '') => {
    const grouped = groupId ? units.filter(unit => kingbeastGroupId(unit) === groupId) : units;
    return grouped.some(unit => kingbeastUnitRole(unit) === 'guard' && isLivingKingbeastUnit(unit))
        && grouped.some(unit => kingbeastUnitRole(unit) === 'spearman' && isLivingKingbeastUnit(unit));
};
const kingbeastCombatMultipliers = (unit) => {
    const role = kingbeastUnitRole(unit);
    const cooldowns = kingbeastCooldowns(unit);
    const symbiosis = Boolean(cooldowns.kingbeast_symbiosis);
    const enrage = isKingbeastPrimaryCore(unit) && Boolean(cooldowns.royal_beast_enrage);
    const randomEffects = arrayValue(unit.traits_json).map(objectValue).find(trait => trait.code === 'boss_random_effect');
    const bloodPact = enrage && arrayValue(randomEffects?.exclusive).map(String).includes('royal_beast_blood_pact');
    const enrageFactor = bloodPact ? 1.45 : 1;
    const royalSignal = Number(cooldowns.royal_signal ?? 0) > 0;
    return {
        attack: (role === 'spearman' && symbiosis ? .75 : 1) * (bloodPact ? enrageFactor : enrage ? 1.30 : 1) * (role === 'king' && Boolean(cooldowns.kingbeast_castling_attack) ? 1.20 : 1),
        defense: role === 'guard' && symbiosis ? .75 : 1,
        accuracy: (bloodPact ? enrageFactor : enrage ? 1.20 : 1) * (royalSignal ? 1.30 : 1),
        speed: (bloodPact ? enrageFactor : enrage ? 1.15 : 1) * (royalSignal ? 1.30 : 1),
        tenacity: bloodPact ? enrageFactor : enrage ? 1.30 : 1
    };
};
const kingbeastPassiveSummary = (unit) => kingbeastUnitRole(unit) === 'dragon'
    ? '硬皮：受到的物理伤害-30%，受到的魔法伤害+30%'
    : kingbeastUnitRole(unit) === 'king'
        ? '雷铸王袍：受到的魔法伤害-30%，受到的物理伤害+30%'
        : '';
const kingbeastPassiveDamageMultiplier = (unit, damageKind) => {
    const role = kingbeastUnitRole(unit);
    if (role === 'dragon')
        return damageKind === 'physical' ? .70 : damageKind === 'magic' ? 1.30 : 1;
    if (role === 'king')
        return damageKind === 'magic' ? .70 : damageKind === 'physical' ? 1.30 : 1;
    return 1;
};
const kingbeastCoreDamageMultiplier = (unit, symbiosis, damageKind = 'untyped') => isKingbeastPrimaryCore(unit)
    ? (symbiosis ? (arrayValue(unit.traits_json).map(objectValue).some(trait => trait.code === 'main_quest_goblin_king') ? .67 : .75) : 1) * (kingbeastUnitRole(unit) === 'dragon' && Number(kingbeastCooldowns(unit).kingbeast_castling_turns ?? 0) > 0 ? .80 : 1) * kingbeastPassiveDamageMultiplier(unit, damageKind)
    : 1;
const kingbeastTransition = (units) => {
    const cores = units.filter(isKingbeastPrimaryCore);
    const king = cores.find(unit => kingbeastUnitRole(unit) === 'king');
    const dragon = cores.find(unit => kingbeastUnitRole(unit) === 'dragon');
    if (!king || !dragon || cores.length !== 2)
        return { phaseRequired: false, split: false, castling: false, enrage: undefined };
    const living = cores.filter(isLivingKingbeastUnit);
    const fallen = cores.filter(unit => !isLivingKingbeastUnit(unit));
    if (fallen.length)
        return { phaseRequired: true, split: false, castling: false, enrage: living.length === 1 && !kingbeastCooldowns(living[0]).royal_beast_enrage ? living[0] : undefined };
    const split = kingbeastFused(cores) && Number(dragon.current_hp) < Number(dragon.hp_max) * .5;
    const phaseTwo = !kingbeastFused(cores) || split;
    const castlingUsed = Boolean(kingbeastCooldowns(king).kingbeast_castling_used);
    const castling = phaseTwo && !castlingUsed && Number(dragon.current_hp) < Number(dragon.hp_max) * .5 && Number(king.current_hp) < Number(king.hp_max) * .2;
    return { phaseRequired: split, split, castling, enrage: undefined };
};
const kingbeastSummonDue = (turn, lastSummonTurn, livingCourtCount, bonusPhase = false) => !bonusPhase
    && (livingCourtCount === 0 || Math.max(0, turn - lastSummonTurn) >= 10);
const kingbeastPanelSummary = (units, turn, lastSummonTurn) => {
    const court = units.filter(unit => ['guard', 'spearman'].includes(kingbeastUnitRole(unit)) && isLivingKingbeastUnit(unit));
    const guards = court.filter(unit => kingbeastUnitRole(unit) === 'guard').length;
    const spears = court.filter(unit => kingbeastUnitRole(unit) === 'spearman').length;
    const remaining = court.length ? Math.max(0, 10 - Math.max(0, turn - lastSummonTurn)) : 0;
    const states = [kingbeastFused(units) ? '合体期：国王不可选中，但会受到全体伤害' : '王座已分离：国王与哈巴龙独立行动'];
    states.push('核心被动：哈巴龙「硬皮」物理-30%／魔法+30%；国王「雷铸王袍」魔法-30%／物理+30%');
    states.push(`王庭存活：雷矛侍卫${spears}｜王庭盾卫${guards}`);
    states.push(remaining ? `援军最迟${remaining}回合后抵达` : '王庭征召待触发');
    if (kingbeastSymbiosisActive(units))
        states.push(`矛盾共生：双侍卫受抑，王座双核心承伤-${units.some(unit => arrayValue(unit.traits_json).map(objectValue).some(trait => trait.code === 'main_quest_goblin_king')) ? 33 : 25}%`);
    const dragon = units.find(unit => kingbeastUnitRole(unit) === 'dragon');
    if (dragon && Number(kingbeastCooldowns(dragon).kingbeast_castling_turns ?? 0) > 0)
        states.push(`王车易位：强制攻击哈巴龙，剩余${Number(kingbeastCooldowns(dragon).kingbeast_castling_turns)}次哈巴龙行动`);
    const livingCore = units.find(unit => isKingbeastPrimaryCore(unit) && isLivingKingbeastUnit(unit) && Boolean(kingbeastCooldowns(unit).royal_beast_enrage));
    if (livingCore)
        states.push(`${kingbeastUnitRole(livingCore) === 'king' ? '孤王' : '孤龙'}狂暴：持续至战斗结束`);
    return states.join('｜');
};

export { bossPhaseTransitionLogsAfterRound, isHiddenFusedKing, isKingbeastPrimaryCore, isLivingKingbeastUnit, kingbeastCombatMultipliers, kingbeastCooldowns, kingbeastCoreDamageMultiplier, kingbeastEncounter, kingbeastForcedSingleTarget, kingbeastFused, kingbeastGroupId, kingbeastMapTargets, kingbeastPanelSummary, kingbeastPassiveDamageMultiplier, kingbeastPassiveSummary, kingbeastPhaseTransition, kingbeastPhaseTransitionLog, kingbeastSelectableTargets, kingbeastSummonDue, kingbeastSymbiosisActive, kingbeastTransition, kingbeastUnitRole, withoutKingbeastPhaseTransitionLogs };
