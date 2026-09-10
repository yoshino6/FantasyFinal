import { randomUUID } from 'node:crypto';
import { ownedTalent, readTalentData, talentDay, saveTalentData } from './talent-data.js';
import { ordinaryTalentItem } from './talent-rewards.js';
import { scaledDropEntries } from './negotiation-rules.js';

const rollTalentDropPack = (table, multiplier = 1, random = Math.random) => {
    const results = new Map();
    for (const drop of scaledDropEntries(table, d => d.group ? d.probability : d.chance * d.probability, multiplier * (table[0]?.scale ?? 1), random)) {
        const n = drop.min + Math.floor(random() * (Math.max(drop.min, drop.max) - drop.min + 1));
        results.set(drop.code, (results.get(drop.code) ?? 0) + n);
    }
    return [...results].map(([code, quantity]) => ({ code, quantity }));
};
const talentDropPack = async (c, id, table, eventKey, boss) => {
    const talent = await ownedTalent(c, id), data = await readTalentData(c, id);
    const codes = table.map(d => d.code);
    if (!codes.length)
        return [];
    const [items] = await c.execute(`SELECT * FROM item_definitions WHERE code IN (${codes.map(() => '?').join(',')})`, codes);
    const eligible = (drop) => !boss && drop.chance > 0 && drop.chance < 1 && ordinaryTalentItem(items.find(i => i.code === drop.code) ?? {});
    const groupEligible = (drop) => eligible(drop) && (!drop.group || table.filter(d => d.group === drop.group).every(eligible));
    const ordinary = table.filter(groupEligible), rest = table.filter(d => !groupEligible(d));
    const daily = `letters:${talentDay()}`, preview = talent?.number === 'I03' && data.settings.previewDrops === true && ordinary.length > 0 && (data.counters[daily] ?? 0) < 5;
    if (preview) {
        data.counters[daily] = (data.counters[daily] ?? 0) + 1;
        await saveTalentData(c, id, data);
    }
    const first = rollTalentDropPack(ordinary, talent?.number === 'B03' ? 2 : 1);
    if (preview) {
        data.jobs.push({ id: randomUUID(), kind: 'letter', created: Date.now(), ready: Date.now(), payload: { eventKey, table: ordinary, preview: first } });
        await saveTalentData(c, id, data);
        return rollTalentDropPack(rest);
    }
    return [...rollTalentDropPack(rest), ...first];
};

export { rollTalentDropPack, talentDropPack };
