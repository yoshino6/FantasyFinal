import { obeysFurnaceOrder, pressureChange } from './regional-boss-v2.js';

const regionalActionKind = (action, damaging = true) => action.type === 'attack' ? 'attack'
    : action.type === 'defend' ? 'defend' : action.type === 'skill' || action.type === 'device' ? damaging ? 'damage_skill' : 'support_skill' : 'sustain';
const actionKind = (member, action) => regionalActionKind(action, action.type === 'skill' && action.skillId === member.skill?.id ? member.skill.damaging : member.preferredDamaging ?? true);
const choices = (member) => [member.preferred, { type: 'attack' }, { type: 'defend' }, ...(member.skill ? [{ type: 'skill', skillId: member.skill.id }] : [])];
const planRegionalAuto = (state, members, turn) => {
    const effective = members.filter(member => !member.controlled && member.hp > 0);
    const automatic = effective.filter(member => member.automatic && !member.committed);
    const result = new Map(automatic.map(member => [member.key, member.preferred]));
    if (state.code === 'gruen_mountainheart') {
        const delta = (member, kind) => pressureChange(kind, (state.weight[member.key] ?? 0) >= turn);
        let bestScore = -Infinity;
        let best = result;
        const search = (index, score, actions) => {
            if (index === automatic.length) {
                let pressure = state.pressure;
                let collapse = false;
                for (const member of effective) {
                    const action = actions.get(member.key);
                    pressure = Math.max(state.phase === 3 ? 15 : 0, pressure + delta(member, member.committed ?? (action ? actionKind(member, action) : 'attack')));
                    if (pressure >= 100) {
                        collapse = true;
                        pressure = 35;
                    }
                }
                const target = state.warningAt ? 29 : 84;
                const scored = score - Math.max(0, pressure - target) * 100 - (collapse ? 10000 : 0);
                if (scored > bestScore) {
                    bestScore = scored;
                    best = new Map(actions);
                }
                return;
            }
            const member = automatic[index];
            for (const action of choices(member)) {
                const kind = actionKind(member, action);
                const safety = member.hp / member.hpMax < .4 && action.type === 'defend' ? 8 : 0;
                const value = action.type === 'skill' ? kind === 'damage_skill' ? 5 : 2 : action.type === 'attack' ? 3 : action.type === 'item' ? 2 : 0;
                const preferred = JSON.stringify(action) === JSON.stringify(member.preferred) ? 8 : 0;
                actions.set(member.key, action);
                search(index + 1, score + value + preferred + safety, actions);
            }
        };
        search(0, 0, new Map());
        return best;
    }
    if (!state.orderDue || state.orderDue > turn || !effective.length)
        return result;
    const threshold = state.revolt ? effective.length : Math.ceil(effective.length / 2);
    const vote = (key) => state.revolt ? 1 : key === state.foreman ? 2 : 1;
    const chosen = new Set(effective.filter(member => member.committed && state.orders[member.key] && !obeysFurnaceOrder(state.orders[member.key], member.committed)).map(member => member.key));
    let votes = [...chosen].reduce((sum, key) => sum + vote(key), 0);
    const canRest = state.heat < 30 && !state.lastFullFire && !state.revolt && !state.overloadAt && effective.every(member => (state.scars[member.key] ?? 0) < 3);
    const ranked = [...automatic].sort((a, b) => {
        const health = (member) => member.hp / member.hpMax - (state.scars[member.key] ?? 0) * .3 + Math.min(.3, member.shield / member.hpMax) + (member.key === state.foreman && member.hp / member.hpMax >= .6 ? .15 : 0);
        return health(b) - health(a) || a.key.localeCompare(b.key);
    });
    for (const member of ranked)
        if (!canRest && votes < threshold) {
            chosen.add(member.key);
            votes += vote(member.key);
        }
    for (const member of automatic) {
        const order = state.orders[member.key];
        if (!order)
            continue;
        const rebel = chosen.has(member.key);
        const available = choices(member).filter(action => obeysFurnaceOrder(order, actionKind(member, action)) !== rebel);
        result.set(member.key, available[0] ?? { type: 'defend' });
    }
    return result;
};

export { planRegionalAuto, regionalActionKind };
