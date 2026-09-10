import { equipmentQualityMultiplier } from './constants.js';
import { panelPercentKeys } from './panel-stat-formula.js';

const armorSlots = ['shoulder', 'upper', 'waist', 'lower', 'feet'];
const armorSlot = (slot) => ({ shoulder: 'shoulder', '头肩': 'shoulder', upper: 'upper', '上装': 'upper', waist: 'waist', '腰部': 'waist', lower: 'lower', '下装': 'lower', feet: 'feet', '脚部': 'feet' }[slot]);
const armorAttributeKeys = ['accuracy', 'evasion', 'critResistBp', 'critDamageReductionBp', 'tenacity', 'speed'];
const largePercent = {
    '布甲': [16, 16, 0, 0, 0, 16], '皮甲': [12, 8, 4, 4, 4, 8], '轻甲': [4, 4, 8, 8, 8, 4],
    '重甲': [-4, -8, 12, 12, 12, -8], '板甲': [-16, -16, 16, 16, 16, -16]
};
const armorPiecePercent = (subtype, slot, quality = 100) => {
    const normalized = armorSlot(slot), values = largePercent[subtype ?? ''];
    const scale = (normalized === 'upper' || normalized === 'lower' ? 1 : .75) * equipmentQualityMultiplier(quality);
    return Object.fromEntries(armorAttributeKeys.map((key, index) => [panelPercentKeys[key], normalized && values ? values[index] * scale : 0]));
};
const armorPanelPercent = (rows) => {
    const factors = {}, seen = new Set();
    for (const row of rows) {
        const slot = armorSlot(row.slot);
        if (!slot || seen.has(slot))
            continue;
        seen.add(slot);
        for (const [key, value] of Object.entries(armorPiecePercent(row.weapon_type, slot, Number(row.quality ?? 100))))
            factors[key] = (factors[key] ?? 1) * (1 + value / 100);
    }
    return Object.fromEntries(Object.entries(factors).map(([key, value]) => [key, (value - 1) * 100]));
};
const armorPieceDescription = (subtype, slot, quality = 100) => {
    const labels = ['命中', '闪避', '暴免', '暴抗', '韧性', '速度'];
    const effect = armorPiecePercent(subtype, slot, quality);
    return armorAttributeKeys.flatMap((key, i) => {
        const value = effect[panelPercentKeys[key]];
        return value ? [`${labels[i]}${value > 0 ? '+' : ''}${Number(value.toFixed(2))}%`] : [];
    }).join('、');
};

export { armorAttributeKeys, armorPanelPercent, armorPieceDescription, armorPiecePercent, armorSlot, armorSlots };
