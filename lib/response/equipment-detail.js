import { useEvent, useRoute, useMessage, Format, logger } from 'alemonjs';
import { equipmentDetail as equipmentDetail$1, equippedEquipmentDetails } from '../game/adventure.service.js';
import { forgePrimaryKeys } from '../game/blacksmith.service.js';
import { armorClassDefenseMultiplier } from '../game/character.service.js';
import { messageFormat } from '../game/message.js';

const artifactEffects = {
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
const slotNames = { weapon: '武器', offhand: '副手', shoulder: '头肩', upper: '上装', waist: '腰部', lower: '下装', feet: '脚部', necklace: '项链', bracelet: '手镯', ring: '戒指' };
const equipmentSections = (effectJson, quality, primaryJson, category, subtype) => {
    const effect = (typeof effectJson === 'string' ? JSON.parse(effectJson) : effectJson ?? {});
    const primaryKeys = (() => {
        try {
            const raw = typeof primaryJson === 'string' ? JSON.parse(primaryJson) : primaryJson;
            return Array.isArray(raw) ? new Set(raw.filter(key => typeof key === 'string')) : new Set();
        }
        catch {
            return new Set();
        }
    })();
    if (!primaryKeys.size)
        for (const key of forgePrimaryKeys(category, subtype))
            primaryKeys.add(key);
    const scale = .6 + Math.max(0, Math.min(100, quality)) * .004;
    const labels = {
        hpMax: '生命', mpMax: '魔力', physicalAttack: '物攻', magicAttack: '魔攻', physicalDefense: '物防', magicDefense: '魔防', accuracy: '命中', evasion: '闪避', speed: '速度', critRateBp: '暴击', critDamageBp: '暴伤', critResistBp: '暴免', critDamageReductionBp: '暴抗', physicalAttackPct: '物攻',
        magicAttackPct: '魔攻', physicalDefensePct: '物防', magicDefensePct: '魔防', critRatePct: '暴击', critDamagePct: '暴伤', accuracyPct: '命中', evasionPct: '闪避', speedPct: '速度', mpPct: '魔力', hpPct: '生命', tenacity: '韧性', tenacityPct: '韧性', tenacityPierce: '破韧', tenacityPiercePct: '破韧'
    };
    const attributeLabel = (key) => labels[key] ?? (key.startsWith('elementMastery_') ? `${key.slice('elementMastery_'.length)}元素精通` : key.startsWith('elementResistance_') ? `${key.slice('elementResistance_'.length)}元素抗性` : '');
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
    const effectLabels = {
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
    if (effect.physicalForceCrit)
        effects.unshift('你的物理攻击必定暴击。');
    const artifact = String(effect.artifact ?? '');
    if (artifactEffects[artifact])
        effects.unshift(...artifactEffects[artifact]);
    return { attributes, effects };
};
const detailMarkdown = (item, heading = '装备详情') => {
    const sections = equipmentSections(item.effect_json, Number(item.quality), item.forge_primary_json, item.item_category, item.weapon_type);
    const isArmor = ['头肩', '上装', '腰部', '下装', '脚部'].includes(item.item_category);
    const typeText = isArmor ? `甲类：${item.weapon_type ?? '通用'}` : `装备类型：${item.weapon_type ?? '通用'}`;
    const markdown = Format.createMarkdown()
        .addTitle(heading)
        .addNewline()
        .addNewline()
        .addText(`[${item.item_category}]${item.name}\n${typeText}\n装备等级：Lv.${item.required_level}\n品质：${item.rarity}${Number(item.quality).toFixed(1)}%\n耐久：${item.durability}/${item.durability_max}\n\n装备属性：`)
        .addNewline();
    for (const attribute of sections.attributes.length ? sections.attributes : ['无'])
        markdown.addBlockquote(attribute).addNewline();
    markdown.addNewline().addText('特殊属性：').addNewline();
    for (const effect of sections.effects.length ? sections.effects : ['无'])
        markdown.addBlockquote(effect.replaceAll('$', '\\$').replaceAll('#', '\\#')).addNewline();
    return markdown.addNewline().addText('简介：').addNewline().addBlockquote(item.description);
};
var equipmentDetail = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        const item = await equipmentDetail$1(event.current.UserId, Number(route.param('id')));
        await message.send({ format: Format.create().addMarkdown(detailMarkdown(item)) });
    }
    catch (error) {
        logger.warn({ err: error, userId: event.current.UserId }, 'load equipment detail failed');
        await message.send({ format: messageFormat('装备详情', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const equippedEquipmentDetailHandler = async () => {
    const [event] = useEvent();
    const [message] = useMessage();
    try {
        const items = await equippedEquipmentDetails(event.current.UserId);
        if (!items.length)
            throw new Error('当前没有已装备的物品。');
        const actualAttributes = (item) => {
            const attributes = equipmentSections(item.effect_json, Number(item.quality), item.forge_primary_json, item.item_category, item.weapon_type).attributes;
            const actualText = (attribute) => attribute.replace(/^(.+?) 原始\+.+?｜实际\+(.+?)\((?:主|副)\)$/u, '$1+$2');
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
    }
    catch (error) {
        logger.warn({ err: error, userId: event.current.UserId }, 'load equipped equipment detail failed');
        await message.send({ format: messageFormat('装备详情', error instanceof Error ? error.message : '请稍后重试。') });
    }
};

export { equipmentDetail as default, equippedEquipmentDetailHandler };
