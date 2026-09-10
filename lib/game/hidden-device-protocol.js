const legacy = {
    physical_evade_once: { primary: 'protection', fragments: [{ kind: 'evade' }] },
    easter_egg: { primary: 'support', fragments: [{ kind: 'random', count: 5 }] },
    physical_all: { primary: 'damage', fragments: [{ kind: 'damage', power: 200 }] },
    precision_aim: { primary: 'support', fragments: [{ kind: 'status', code: 'accuracy', value: 100, duration: 99, untilHit: true }, { kind: 'status', code: 'crit_bonus', value: 100, duration: 99, untilHit: true }] },
    weave_repair: { primary: 'heal', fragments: [{ kind: 'heal', percent: 18 }, { kind: 'cleanse', count: 1 }] },
    gravity_tether: { primary: 'control', fragments: [{ kind: 'status', code: 'slow', value: 30, duration: 2, debuff: true }, { kind: 'status', code: 'evasion_down', value: 30, duration: 2, debuff: true }] },
    fold_barrier: { primary: 'protection', fragments: [{ kind: 'status', code: 'reduction', value: 15, duration: 2 }] },
    shock_pile: { primary: 'damage', fragments: [{ kind: 'damage', power: 120 }, { kind: 'control', code: 'stun', chance: 65 }] },
    frost_pulse: { primary: 'damage', fragments: [{ kind: 'damage', power: 100, magic: true, element: '冰' }, { kind: 'status', code: 'slow', value: 25, duration: 2, debuff: true }] },
    phase_decoy: { primary: 'protection', fragments: [{ kind: 'reduce_once', value: 80 }] },
    counter_spider: { primary: 'dispel', fragments: [{ kind: 'dispel', count: 1 }] },
    coil_cannon: { primary: 'damage', fragments: [{ kind: 'damage', power: 180, element: '雷' }, { kind: 'status', code: 'exposed', value: 25, duration: 2, debuff: true }] },
    autonomous_repair: { primary: 'heal', fragments: [{ kind: 'heal', percent: 30 }] },
    reactor_overcharge: { primary: 'damage', fragments: [{ kind: 'damage', power: 230, magic: true, element: '火' }], selfHpCost: 15 },
    reactor_thermal_share: { primary: 'support', fragments: [{ kind: 'status', code: 'damage', value: 20, duration: 2 }] }
};
const inventorCapability = (skill) => {
    const capability = skill.inventor ?? legacy[skill.effect ?? ''];
    if (!capability || capability.windup || !capability.fragments.length)
        return undefined;
    return { ...capability, fragments: capability.fragments.map(fragment => fragment.kind === 'damage' ? { ...fragment, power: skill.power ?? fragment.power } : { ...fragment }) };
};
const inventorProjection = (capability) => ({ ...capability, fragments: (() => { const numeric = capability.fragments.find(f => ['damage', 'heal', 'shield'].includes(f.kind)); const other = capability.fragments.filter(f => !['damage', 'heal', 'shield'].includes(f.kind)); return numeric ? [numeric, ...other.slice(0, 1)] : other.slice(0, 2); })().map(fragment => {
        if (fragment.kind === 'damage')
            return { ...fragment, power: Math.min(200, fragment.power) };
        if (fragment.kind === 'heal' || fragment.kind === 'shield')
            return { ...fragment, percent: Math.min(20 / .9, fragment.percent) };
        if (fragment.kind === 'control')
            return { ...fragment, chance: Math.min(50, fragment.chance) };
        if (fragment.kind === 'status')
            return { ...fragment, value: ['reduction', 'physical_reduction', 'magic_reduction'].includes(fragment.code) ? Math.min(25 / .8, fragment.value) : fragment.value, duration: Math.min(2, fragment.duration), untilHit: false };
        if (fragment.kind === 'reduce_once')
            return { ...fragment, value: Math.min(25, fragment.value) };
        if (fragment.kind === 'random')
            return { ...fragment, count: 2 };
        return fragment;
    }) });

export { inventorCapability, inventorProjection };
