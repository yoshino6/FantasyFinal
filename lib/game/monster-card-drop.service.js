import { logger } from 'alemonjs';
import { monsterCards, nonDroppingMonsterTemplates, pursuitMonsterCardByKey, normalMonsterCardByMonster, sourceBossMonsterCards, pursuitRank } from '../config/monster-cards.js';
import { getPool, withTransaction } from '../database/pool.js';
import { achievementItem } from './achievement-hooks.js';
import { grantInventory } from './inventory-binding.js';
import { secureRandom, luckWeight, clamp } from './negotiation-rules.js';

const rewardChannel = 'monster_card';
const formulaVersion = 1;
const excludedTraitCodes = new Set(['summoned', 'boss_component', 'boss_test', 'advanced_profession_trial', 'npc_sparring']);
const jsonValue = (value) => {
    if (typeof value !== 'string')
        return value;
    try {
        return JSON.parse(value);
    }
    catch {
        return null;
    }
};
const traitsFor = (value) => {
    const parsed = jsonValue(value);
    return Array.isArray(parsed) ? parsed.filter((item) => Boolean(item) && typeof item === 'object') : [];
};
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const partyBonusFor = (size) => ({ 1: 0, 2: .6, 3: 1, 4: 1.5 }[Math.max(1, Math.min(4, size))] ?? 0);
const calculateMonsterCardProbability = (input) => {
    const members = [...input.members].sort((left, right) => left.characterId - right.characterId);
    if (!members.length)
        throw new Error('没有可获得怪物卡片的玩家。');
    if (members.length > 4)
        throw new Error('怪物卡片结算最多支持四名玩家。');
    const recipientWeights = members.map(member => ({
        characterId: member.characterId,
        weight: input.useLuck ? luckWeight(finite(member.luck)) : 1,
        share: 0
    }));
    const weightTotal = recipientWeights.reduce((sum, row) => sum + row.weight, 0);
    for (const row of recipientWeights)
        row.share = row.weight / weightTotal;
    const weightedDropBonus = members.reduce((sum, member, index) => sum + recipientWeights[index].weight * finite(member.dropBonus), 0) / weightTotal;
    const luckMultiplier = input.useLuck ? recipientWeights.reduce((product, row) => product * row.weight, 1) : 1;
    const partyBonus = partyBonusFor(members.length);
    const traitBonus = finite(input.traitBonus);
    const elixirBonus = finite(input.elixirBonus);
    const omniscientBonus = finite(input.omniscientBonus);
    const globalMultiplier = finite(input.globalMultiplier, 1);
    const totalMultiplier = globalMultiplier * (1 + partyBonus + traitBonus + elixirBonus + omniscientBonus + weightedDropBonus) * luckMultiplier;
    const baseProbability = clamp(finite(input.baseProbability), 0, 1);
    return {
        baseProbability,
        partyBonus,
        traitBonus,
        elixirBonus,
        omniscientBonus,
        weightedDropBonus,
        luckMultiplier,
        globalMultiplier,
        totalMultiplier,
        finalProbability: clamp(baseProbability * totalMultiplier, 0, 1),
        recipientWeights
    };
};
const decideMonsterCardRoll = (probability, random = secureRandom) => {
    const rollValue = clamp(finite(random()), 0, 1);
    if (probability.finalProbability < 1 && rollValue >= probability.finalProbability)
        return { rollValue, dropped: false, recipientRoll: null, recipientCharacterId: null };
    const recipientRoll = clamp(finite(random()), 0, 1);
    let cursor = recipientRoll;
    for (const row of probability.recipientWeights) {
        cursor -= row.share;
        if (cursor < 0)
            return { rollValue, dropped: true, recipientRoll, recipientCharacterId: row.characterId };
    }
    const recipientCharacterId = probability.recipientWeights.at(-1)?.characterId ?? null;
    return { rollValue, dropped: true, recipientRoll, recipientCharacterId };
};
const sourceCardByMonster = new Map(monsterCards.filter(card => card.sourcePolicy === 'source_boss').map(card => [card.monsterCode, card]));
const monsterCardCandidatesForTarget = (target) => {
    if (!target.defeated || !target.spawnId || !target.monsterCode || nonDroppingMonsterTemplates.has(target.monsterCode))
        return [];
    const traits = traitsFor(target.traits);
    if (traits.some(trait => excludedTraitCodes.has(String(trait.code ?? ''))))
        return [];
    const pursuit = traits.find(trait => trait.code === 'city_pursuit');
    if (pursuit) {
        const stars = Math.floor(finite(pursuit.pursuit_stars));
        const skulls = Math.floor(finite(pursuit.pursuit_skulls));
        if (skulls < 1 && stars < 3)
            return [];
        const frozenRank = pursuitRank(stars, skulls);
        const card = pursuitMonsterCardByKey.get(`${target.monsterCode}:${frozenRank}`);
        return card ? [{ card, sourceBossCode: null, pursuitRank: frozenRank }] : [];
    }
    const candidates = [];
    const direct = normalMonsterCardByMonster.get(target.monsterCode);
    if (direct?.sourcePolicy === 'kill')
        candidates.push({ card: direct, sourceBossCode: null, pursuitRank: null });
    for (const representedMonsterCode of sourceBossMonsterCards[target.monsterCode] ?? []) {
        const card = sourceCardByMonster.get(representedMonsterCode);
        if (card)
            candidates.push({ card, sourceBossCode: target.monsterCode, pursuitRank: null });
    }
    return candidates;
};
const targetTraitBonus = (target) => traitsFor(target.traits)
    .reduce((sum, trait) => sum + finite(trait.dropPct) / 100, 0);
const recordMonsterCardRolls = async (connection, input, random = secureRandom) => {
    if (!input.members.length)
        return 0;
    const members = [...input.members].sort((left, right) => left.characterId - right.characterId);
    let inserted = 0;
    for (const target of input.targets) {
        for (const candidate of monsterCardCandidatesForTarget(target)) {
            const [existing] = await connection.execute('SELECT id FROM monster_card_rolls WHERE source_spawn_id=? AND reward_channel=? AND card_code=? LIMIT 1 FOR UPDATE', [target.spawnId, rewardChannel, candidate.card.cardCode]);
            if (existing[0])
                continue;
            const probability = calculateMonsterCardProbability({
                baseProbability: candidate.card.baseDropRate,
                members,
                useLuck: input.useLuck,
                traitBonus: targetTraitBonus(target),
                elixirBonus: input.elixirBonus,
                omniscientBonus: input.omniscientBonus,
                globalMultiplier: input.globalMultiplier
            });
            const decision = decideMonsterCardRoll(probability, random);
            const formula = {
                formulaVersion,
                p0: probability.baseProbability,
                P: probability.partyBonus,
                T: probability.traitBonus,
                E: probability.elixirBonus,
                O: probability.omniscientBonus,
                A: probability.weightedDropBonus,
                L: probability.luckMultiplier,
                G: probability.globalMultiplier,
                M: probability.totalMultiplier,
                pTeam: probability.finalProbability,
                useLuck: input.useLuck,
                members: members.map((member, index) => ({
                    characterId: member.characterId,
                    luck: input.useLuck ? finite(member.luck) : null,
                    luckWeight: probability.recipientWeights[index].weight,
                    dropBonus: finite(member.dropBonus)
                })),
                recipientRoll: decision.recipientRoll,
                sourcePolicy: candidate.card.sourcePolicy,
                pursuitRank: candidate.pursuitRank
            };
            const [result] = await connection.execute(`INSERT INTO monster_card_rolls
        (source_spawn_id,reward_channel,session_id,source_boss_code,represented_monster_code,card_code,card_version,formula_version,
         base_probability,final_probability,roll_value,formula_json,eligible_character_ids_json,recipient_weights_json,recipient_character_id,status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE id=id`, [
                target.spawnId, rewardChannel, input.sessionId, candidate.sourceBossCode, candidate.card.monsterCode,
                candidate.card.cardCode, candidate.card.version, formulaVersion, probability.baseProbability, probability.finalProbability,
                decision.rollValue, JSON.stringify(formula), JSON.stringify(members.map(member => member.characterId)),
                JSON.stringify(probability.recipientWeights), decision.recipientCharacterId, decision.dropped ? 'pending' : 'no_drop'
            ]);
            inserted += Number(result.affectedRows) === 1 ? 1 : 0;
        }
    }
    return inserted;
};
const grantRoll = (rollId) => withTransaction(async (connection) => {
    const [rows] = await connection.execute('SELECT * FROM monster_card_rolls WHERE id=? FOR UPDATE', [rollId]);
    const row = rows[0];
    if (!row || !['pending', 'failed'].includes(row.status))
        return null;
    const recipientCharacterId = Number(row.recipient_character_id ?? 0);
    if (!recipientCharacterId)
        throw new Error('怪物卡片判定缺少领取角色。');
    const definition = monsterCards.find(card => card.cardCode === row.card_code && card.version === Number(row.card_version));
    if (!definition || definition.monsterCode !== row.represented_monster_code)
        throw new Error('怪物卡片判定引用的定义版本不存在。');
    const [items] = await connection.execute("SELECT id,name,item_type,codex_id FROM item_definitions WHERE code=? AND item_category='怪物卡片' LIMIT 1", [row.card_code]);
    const item = items[0];
    if (!item)
        throw new Error(`怪物卡片物品定义不存在：${row.card_code}`);
    const [characters] = await connection.execute('SELECT name FROM characters WHERE id=? LIMIT 1', [recipientCharacterId]);
    if (!characters[0])
        throw new Error('怪物卡片领取角色不存在。');
    await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [recipientCharacterId, item.id]);
    await grantInventory(connection, recipientCharacterId, Number(item.id), { unbound: 1, trade: 0, personal: 0 });
    await achievementItem(connection, recipientCharacterId, Number(item.id));
    const [updated] = await connection.execute(`UPDATE monster_card_rolls
    SET status='granted',granted_at=NOW(3),attempt_count=LEAST(65535,attempt_count+1),last_attempt_at=NOW(3),last_error=NULL
    WHERE id=? AND status IN ('pending','failed')`, [rollId]);
    if (Number(updated.affectedRows) !== 1)
        throw new Error('怪物卡片发放状态发生并发变化。');
    return {
        rollId: Number(row.id), sessionId: row.session_id, recipientCharacterId, recipientName: characters[0].name,
        itemId: Number(item.id), name: item.name, itemType: item.item_type, codexId: item.codex_id
    };
});
const errorText = (error) => (error instanceof Error ? error.message : String(error ?? '未知错误')).slice(0, 500);
const markGrantFailed = async (rollId, error) => {
    try {
        await withTransaction(async (connection) => {
            await connection.execute(`UPDATE monster_card_rolls
        SET status='failed',attempt_count=LEAST(65535,attempt_count+1),last_attempt_at=NOW(3),last_error=?
        WHERE id=? AND status IN ('pending','failed')`, [errorText(error), rollId]);
        });
    }
    catch (markError) {
        logger.warn({ err: markError, rollId }, '怪物卡片失败状态暂未写回，判定仍保留为可恢复状态');
    }
};
const grantRolls = async (rollIds) => {
    const granted = [];
    for (const rollId of rollIds) {
        try {
            const result = await grantRoll(rollId);
            if (result)
                granted.push(result);
        }
        catch (error) {
            await markGrantFailed(rollId, error);
            logger.warn({ err: error, rollId }, '怪物卡片发放失败，已保留原判定等待重试');
        }
    }
    return granted;
};
const grantMonsterCardsForSession = async (sessionId) => {
    try {
        const pool = await getPool();
        const [rows] = await pool.execute(`SELECT id FROM monster_card_rolls
      WHERE session_id=? AND status IN ('pending','failed') ORDER BY id`, [sessionId]);
        return await grantRolls(rows.map(row => Number(row.id)));
    }
    catch (error) {
        logger.warn({ err: error, sessionId }, '怪物卡片待发放记录暂不可读取，将由后续恢复任务重试');
        return [];
    }
};
const recoverPendingMonsterCardGrants = async (limit = 50) => {
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const pool = await getPool();
    const [rows] = await pool.execute(`SELECT id FROM monster_card_rolls
    WHERE status IN ('pending','failed') ORDER BY updated_at,id LIMIT ?`, [safeLimit]);
    return grantRolls(rows.map(row => Number(row.id)));
};

export { calculateMonsterCardProbability, decideMonsterCardRoll, grantMonsterCardsForSession, monsterCardCandidatesForTarget, recordMonsterCardRolls, recoverPendingMonsterCardGrants };
