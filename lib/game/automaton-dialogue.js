import { createHash } from 'node:crypto';
import { automatonCorpus } from './automaton-corpus.js';
import { automatonRandom } from './automaton-growth.js';

const dialogueHash = (text) => createHash('sha256').update(text.normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu, '')).digest('hex');
const escapeAutomatonText = (text) => text.replace(/[\\`*_{}\[\]()<>#|!~]/g, '\\$&');
const automatonInteractionText = (name, text) => `〖${escapeAutomatonText(name)}〗\n“${escapeAutomatonText(text)}”`;
const automatonBattleInteractionText = (line) => {
    const match = /^[【〖](.*)[】〗]「(.*)」$/.exec(line);
    return match ? automatonInteractionText(match[1], match[2]) : escapeAutomatonText(line);
};
const renderAutomatonQuote = (template, state, owner = '旅伴', enemy = '对手') => {
    const text = template.replace(/\{(称呼|自称|主人|人偶|敌人)\}/g, (_, key) => ({ 称呼: state.personality.ownerAddress, 自称: state.personality.selfAddress, 主人: owner, 人偶: state.name, 敌人: enemy })[key]);
    if ([...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(text)].length > 40)
        return null;
    return text;
};
const chooseAutomatonQuote = (state, event, key, used, facts = new Set(), allowCustom = false, owner, enemy) => {
    const custom = allowCustom ? (state.customQuotes[event] ?? []).map((text, i) => ({ id: `custom_${event}_${i}`, text, requires: [] })) : [];
    const candidates = (custom.length ? custom : automatonCorpus.dialogues.filter(q => q.personaId === state.personality.coreId && q.event === event)).filter(q => q.requires.every(f => facts.has(f))).map(q => ({ ...q, rendered: renderAutomatonQuote(q.text, state, owner, enemy), hash: dialogueHash(q.text.replace(/\{[^}]+\}/g, '')) })).filter(q => q.rendered !== null && !used.has(q.hash));
    if (!candidates.length)
        return null;
    const expression = state.personality.traits.find(t => t.id.startsWith('expression_'))?.ordinal ?? 5;
    const interest = state.personality.traits.find(t => t.id.startsWith('interest_'))?.ordinal;
    const topics = ['天空|云|星', '雨|水', '花|草|树|叶', '石|山', '书|文字|记录', '齿轮|机关|修', '火|炉|光', '食|味|汤', '歌|声|曲', '路|远方|风景'];
    const weighted = candidates.map(q => ({ q, weight: Math.max(.5, Math.min(2, 1 + (state.preferences[q.id] ?? 0) * .1)) * (expression <= 3 ? 25 / Math.max(10, q.rendered.length) : expression >= 8 ? q.rendered.length / 20 : 1) * (interest && ['daily', 'greeting', 'reunion', 'rest'].includes(event) && new RegExp(topics[interest - 1]).test(q.text) ? 1.5 : 1) }));
    let roll = automatonRandom(state.seed, `dialogue:${key}`) * weighted.reduce((s, q) => s + q.weight, 0);
    for (const { q, weight } of weighted) {
        roll -= weight;
        if (roll < 0)
            return { id: q.id, text: q.rendered, hash: q.hash };
    }
    return null;
};

export { automatonBattleInteractionText, automatonInteractionText, chooseAutomatonQuote, dialogueHash, escapeAutomatonText, renderAutomatonQuote };
