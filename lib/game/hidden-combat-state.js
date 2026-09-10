import { hiddenProfession, hiddenSkill } from './hidden-profession.config.js';

const hiddenState = (unit) => {
    const existing = unit.cooldowns.__hidden;
    if (existing && typeof existing === 'object') {
        existing.ticks ??= [];
        return existing;
    }
    const state = { resource: 0, incomeTurn: -1, income: 0, action: 0, ticks: [] };
    unit.cooldowns.__hidden = state;
    return state;
};
const hiddenResourceView = (cooldowns) => {
    const state = cooldowns.__hidden;
    const profession = state?.profession ? hiddenProfession(state.profession) : undefined;
    return profession ? { professionCode: profession.code, code: profession.code, name: profession.resource, current: state?.resource ?? 0, max: 100 } : null;
};
const hiddenResourceShortage = (code, cooldowns) => {
    const skill = hiddenSkill(code);
    if (!skill?.resource)
        return null;
    const state = cooldowns.__hidden, current = Math.max(0, Number(state?.resource) || 0);
    return current < skill.resource ? `${hiddenProfession(skill.profession).resource}不足：需要 ${skill.resource}，当前 ${current}/100。` : null;
};
const gainHiddenResource = (unit, turn, amount, refund = false) => {
    const state = hiddenState(unit), profession = hiddenProfession(state.profession ?? '');
    if (!profession || amount <= 0 || !refund && (state.consumes || unit.hp <= 0))
        return 0;
    if (state.incomeTurn !== turn) {
        state.incomeTurn = turn;
        state.income = 0;
    }
    const gained = Math.max(0, Math.min(amount, 100 - state.resource, refund ? 100 : profession.cap - state.income));
    state.resource += gained;
    if (!refund)
        state.income += gained;
    return gained;
};
const hiddenActionKey = (unit, turn) => `${unit.key}/${turn}/${hiddenState(unit).action}`;

export { gainHiddenResource, hiddenActionKey, hiddenResourceShortage, hiddenResourceView, hiddenState };
