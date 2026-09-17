const folioBuffs = { s07: [['attack', 18, 30]], s08: [['magic', 18, 30]], s09: [['defense', 25, 40]], s10: [['magic_defense', 25, 40]], s11: [['speed', 18, 30], ['evasion', 8, 15]], s12: [['accuracy', 10, 20]], s13: [['attack', 12, 20]], s14: [['magic', 12, 20]], s15: [['defense', 15, 25], ['magic_defense', 15, 25]], s16: [['speed', 12, 20], ['hit', 5, 10]], s18: [['regen', 3, 5]] };
const folioDebuffs = { p15: ['slow', 15, 25, 2], p20: ['attack_down', 8, 25, 2], p21: ['slow', 8, 25, 1], m05: ['slow', 8, 25, 2], m06: ['hit_down', 10, 20, 2], m07: ['magic_down', 8, 25, 2], m08: ['attack_down', 8, 25, 2], m14: ['slow', 10, 25, 1], m15: ['slow', 12, 25, 2], m17: ['healing_down', 10, 25, 2], m18: ['attack_down', 10, 25, 2], m23: ['evasion_down', 8, 15, 2], m24: ['exposed_hit', 10, 20, 2], m28: ['slow', 10, 25, 2], m29: ['slow', 10, 25, 2], m30: ['slow', 18, 25, 2] };
const folioEffectPreview = (skill, factor) => {
    const id = skill.code.slice(6), fmt = (n) => String(Number(n.toFixed(2))), rows = [];
    const value = (base, cap) => fmt(Math.min(cap, base * factor)) + (base * factor >= cap ? '（该项已达上限）' : '');
    const turns = (n, cap = 4) => Math.min(cap, Math.max(1, Math.floor(n * factor + 1e-9)));
    const names = { attack: '物攻', magic: '魔攻', defense: '物防', magic_defense: '魔防', speed: '速度', evasion: '闪避值', accuracy: '下次攻击命中值', hit: '命中修正系数', slow: '减速', attack_down: '物攻降低', magic_down: '魔攻降低', hit_down: '命中抑制系数', healing_down: '造成治疗降低', evasion_down: '闪避值降低', exposed_hit: '受击命中修正系数', regen: '每跳最大HP恢复' };
    for (const [code, base, cap] of folioBuffs[id] ?? [])
        rows.push(names[code] + ' ' + value(base, cap) + (['accuracy', 'evasion'].includes(code) ? '点' : '%') + '，' + turns(3) + '回合');
    if (folioDebuffs[id]) {
        const [code, base, cap, time] = folioDebuffs[id];
        rows.push(names[code] + ' ' + value(base, cap) + (code === 'evasion_down' ? '点' : '%') + '，' + turns(time) + '回合（再按目标韧性结算）');
    }
    if (['p04', 'p10', 'm04'].includes(id))
        rows.push((id === 'p04' ? '本次首目标命中修正系数 ' : '本次命中值 ') + value(10, 20) + (id === 'p04' ? '%' : '点'));
    if (['s02', 's04', 's06'].includes(id))
        rows.push('直接治疗 ' + value(id === 's02' ? 60 : id === 's04' ? 40 : 50, id === 's02' ? 120 : 80) + '%魔攻');
    if (['s05', 's17'].includes(id))
        rows.push('生命护盾 ' + value(id === 's05' ? 12 : 8, id === 's05' ? 20 : 12) + '%目标最大HP，' + turns(3) + '回合');
    if (id === 'm03')
        rows.push('灼烧 普通' + value(2, 4) + '% / Boss' + value(.5, 1) + '%最大HP，' + turns(2, 3) + '回合；每跳仍最多40%施法者魔攻');
    return rows;
};

export { folioBuffs, folioDebuffs, folioEffectPreview };
