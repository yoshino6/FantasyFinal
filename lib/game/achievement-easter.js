import { surpriseDefeatFacts } from './achievement-surprise.js';
import { achievementBossTargets } from './achievement-boss.js';
import { recordAchievement } from './achievement-events.js';

const parsed = (value) => typeof value === 'string' ? JSON.parse(value) : value ?? {};
const achievementBattleOutcome = async (c, sessionId, outcome, members, targets, bosses = []) => {
    if (outcome === 'defeat')
        bosses = await achievementBossTargets(c, targets);
    const ids = members.filter(m => !m.npc_code).map(m => Number(m.id));
    if (!ids.length || !targets.length)
        return;
    const [actors] = await c.query('SELECT c.id,p.qq_user_id FROM characters c JOIN players p ON p.id=c.player_id WHERE c.id IN (?) AND c.npc_code IS NULL ORDER BY p.qq_user_id', [ids]);
    for (const actor of actors) {
        const identity = String(actor.qq_user_id), life = String(actor.id), member = members.find(m => Number(m.id) === Number(actor.id));
        await c.execute('INSERT IGNORE INTO achievement_profiles(identity_key) VALUES (?)', [identity]);
        await c.execute('SELECT identity_key FROM achievement_profiles WHERE identity_key=? FOR UPDATE', [identity]);
        const [receipt] = await c.execute("INSERT IGNORE INTO achievement_progress(identity_key,life_key,metric,value_json) VALUES (?,?,?,?)", [identity, life, 'egg_battle:' + sessionId, JSON.stringify({ outcome })]);
        if (!receipt.affectedRows)
            continue;
        const [rows] = await c.execute("SELECT value_json FROM achievement_progress WHERE identity_key=? AND life_key=? AND metric='egg_losing_streak' FOR UPDATE", [identity, life]);
        const previous = parsed(rows[0]?.value_json);
        const evidence = parsed(member.cooldowns).__rules?.memory?.achievement ?? {};
        const [lifeRows] = await c.execute("SELECT value_json FROM achievement_progress WHERE identity_key=? AND life_key=? AND metric='pve_life_history' FOR UPDATE", [identity, life]);
        const history = parsed(lifeRows[0]?.value_json);
        const retried = history.retried ??= [];
        if (outcome === 'defeat') {
            history.defeated = true;
            for (const t of targets)
                if (!retried.includes(String(t.id)))
                    retried.push(String(t.id));
        }
        if (outcome === 'escape')
            for (const t of targets)
                if (!retried.includes(String(t.id)))
                    retried.push(String(t.id));
        const contributed = member.stamina_eligible && (Number(evidence.damage) > 0 || Number(evidence.healed) > 0 || Number(evidence.playerSupport) > 0);
        if (outcome === 'victory' && contributed) {
            const valid = targets.filter(t => Number(t.level) >= Math.max(1, Math.ceil(Number(member.level) * .8)));
            const facts = [];
            if (valid.length && history.defeated)
                facts.push('ACH_A23');
            if (valid.some(t => retried.includes(String(t.id))))
                facts.push('ACH_B24');
            if (bosses.length && history.fromBirth === true && !history.bossWon && !history.defeated)
                facts.push('ACH_B25');
            if (bosses.length)
                history.bossWon = true;
            if (facts.length)
                recordAchievement(c, Number(actor.id), facts, 'pve-history:' + sessionId);
        }
        await c.execute('INSERT INTO achievement_progress(identity_key,life_key,metric,value_json) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE value_json=VALUES(value_json)', [identity, life, 'pve_life_history', JSON.stringify(history)]);
        if (outcome === 'defeat') {
            const extras = surpriseDefeatFacts(member, members, bosses);
            if (extras.length)
                recordAchievement(c, Number(actor.id), extras, 'surprise-defeat:' + sessionId);
        }
        const solo = members.length === 1 && targets.length === 1 && !!member.stamina_eligible;
        const enemy = solo ? String(targets[0].id) : '';
        if (members.length === 1 && member.stamina_eligible && outcome === 'defeat' && Number(member.current_hp) <= 0) {
            const level = Number(member.level);
            const facts = [];
            if (bosses.some(b => Number(b.level) >= level && Number(b.level) <= level + 2 && evidence.bossOpeningKnockout === `target:${b.id}`))
                facts.push('ACH_EGG13');
            if (bosses.some(b => Number(b.level) >= level && Number(b.hp_max) > 0 && Number(b.current_hp) > 0 && Number(b.current_hp) <= Number(b.hp_max) * .01 && Number(evidence.damage) >= Number(b.hp_max) * .5))
                facts.push('ACH_EGG14');
            if (facts.length)
                recordAchievement(c, Number(actor.id), facts, 'challenge-defeat:' + sessionId);
        }
        const qualifiedLoss = solo && outcome === 'defeat' && Number(member.current_hp) <= 0 && Number(evidence.received) > 0;
        const count = qualifiedLoss ? (previous.enemy === enemy ? Number(previous.count ?? 0) + 1 : 1) : 0;
        if (count >= 10)
            recordAchievement(c, Number(actor.id), ['ACH_EGG01'], 'egg:' + sessionId);
        if (outcome === 'victory' && solo && Number(member.current_hp) > 0 && Number(evidence.damage) > 0 && previous.enemy === enemy && Number(previous.count) >= 9)
            recordAchievement(c, Number(actor.id), ['ACH_EGG02'], 'egg:' + sessionId);
        await c.execute("INSERT INTO achievement_progress(identity_key,life_key,metric,value_json) VALUES (?,?,'egg_losing_streak',?) ON DUPLICATE KEY UPDATE value_json=VALUES(value_json)", [identity, life, JSON.stringify({ enemy: qualifiedLoss ? enemy : '', count })]);
    }
};

export { achievementBattleOutcome };
