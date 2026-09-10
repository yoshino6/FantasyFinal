import { createHash } from 'node:crypto';
import { recordAchievement } from './achievement-events.js';

const recordPvpAchievements = async (c, battleId, winnerId) => {
    const [battles] = await c.execute('SELECT * FROM player_pvp_battle_sessions WHERE id=?', [battleId]);
    const b = battles[0];
    if (!b || !['attacker_win', 'defender_win'].includes(b.state))
        return;
    const [actors] = await c.execute('SELECT c.*,p.qq_user_id FROM characters c JOIN players p ON p.id=c.player_id WHERE c.id IN (?,?) AND c.npc_code IS NULL', [b.attacker_character_id, b.defender_character_id]);
    if (actors.length !== 2 || actors[0].qq_user_id === actors[1].qq_user_id)
        return;
    const parse = (v) => typeof v === 'string' ? JSON.parse(v) : v ?? {};
    const evidence = (actor) => parse(Number(actor.id) === Number(b.attacker_character_id) ? b.attacker_cooldowns : b.defender_cooldowns).__rules?.memory?.achievement;
    if (actors.some(a => !(Number(evidence(a)?.damage) > 0)))
        return;
    const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
    const pair = createHash('sha256').update(actors.map(a => String(a.qq_user_id)).sort().join('\0')).digest('hex');
    for (const actor of actors) {
        const opponent = actors.find(a => a.id !== actor.id);
        if (Number(opponent.level) < Math.ceil(Number(actor.level) * .8))
            continue;
        const facts = [{ metric: 'ACH_P01' }, ...['ACH_P16', 'ACH_P17', 'ACH_P18'].map(metric => ({ metric, distinct: day }))];
        if (Number(actor.id) === winnerId) {
            facts.push(...['ACH_P02', 'ACH_P03', 'ACH_P04', 'ACH_P05', 'ACH_P06'].map(metric => ({ metric })));
            facts.push(...['ACH_P07', 'ACH_P08', 'ACH_P09'].map(metric => ({ metric, distinct: String(opponent.qq_user_id) })));
            facts.push(...(Number(actor.id) === Number(b.attacker_character_id) ? ['ACH_P13', 'ACH_P14', 'ACH_P15'] : ['ACH_P10', 'ACH_P11', 'ACH_P12']).map(metric => ({ metric })));
            if (Number(actor.level) === Number(opponent.level))
                facts.push({ metric: 'ACH_P20' });
            if (Number(opponent.level) >= Number(actor.level) + 2)
                facts.push({ metric: 'ACH_P22' });
            const hp = Number(Number(actor.id) === Number(b.attacker_character_id) ? b.attacker_hp : b.defender_hp);
            if (hp > 0 && hp <= Number(actor.hp_max) * .1)
                facts.push({ metric: 'ACH_P23' });
            if (Number(b.turn_no) > 10)
                facts.push({ metric: 'ACH_P24' });
            facts.push({ metric: 'ACH_P25', distinct: String(actor.current_region_id) });
        }
        recordAchievement(c, Number(actor.id), facts, `pvp:${pair}:${day}`);
    }
};

export { recordPvpAchievements };
