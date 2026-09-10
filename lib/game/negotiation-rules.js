import { randomInt } from 'node:crypto';

const negotiationVersion = 1;
const moodScale = 1_000_000;
const moodBands = [
    { code: 'furious', name: '暴怒', min: -1e6 },
    { code: 'resentful', name: '愤懑', min: -5e5 },
    { code: 'hostile', name: '敌意', min: -2e5 },
    { code: 'wary', name: '戒备', min: 0 },
    { code: 'hesitant', name: '迟疑', min: 400_000 },
    { code: 'receptive', name: '缓和', min: 600_000 },
    { code: 'pleased', name: '欣悦', min: 800_000 },
    { code: 'trusting', name: '信任', min: moodScale }
];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const moodBand = (ppm) => [...moodBands].reverse().find(band => ppm >= band.min) ?? moodBands[0];
const negotiationProbability = (ppm, charm = 0) => {
    const p = Math.pow(clamp(ppm / moodScale, 0, 1), Math.log(.2) / Math.log(.5));
    return clamp(p + .5 * clamp(charm / 100, -1, 1) * p * (1 - p), 0, 1);
};
const moodDropMultiplier = (ppm) => 2 * clamp(ppm / moodScale, 0, 1);
const giftAggression = (ppm, preference) => preference === 'like' ? 0
    : clamp((preference === 'neutral' ? .08 : .25) * Math.pow(1 - clamp(ppm / moodScale, -1, 1), preference === 'neutral' ? 2 : 1.5), 0, preference === 'neutral' ? .9 : .95);
const talkAggression = (ppm, failures) => clamp(.08 + .07 * failures + .01 * failures ** 2 + .35 * (1 - ppm / moodScale) ** 2, 0, .95);
const secureRandom = () => randomInt(0, 2 ** 47) / 2 ** 47;
const normalWeights = Object.freeze(Array.from({ length: 201 }, (_, i) => Math.exp(-((i - 100) ** 2) / 1800)));
const normalTotal = normalWeights.reduce((sum, w) => sum + w, 0);
const drawHiddenAttribute = (random = secureRandom) => {
    let cursor = random() * normalTotal;
    for (let i = 0; i < normalWeights.length; i++) {
        cursor -= normalWeights[i];
        if (cursor < 0)
            return i - 100;
    }
    return 100;
};
const luckWeight = (luck) => 1 + .2 * clamp(luck / 100, -1, 1);
const teamLuckMultiplier = (values) => {
    if (values.length > 4)
        throw new Error('交涉奖励最多支持四名玩家。');
    return values.reduce((multiplier, luck) => multiplier * luckWeight(luck), 1);
};
const weightedRecipient = (members, luck, random = secureRandom) => {
    if (!members.length)
        throw new Error('没有可获得奖励的玩家。');
    let cursor = random() * members.reduce((sum, member) => sum + luckWeight(luck(member)), 0);
    for (const member of members) {
        cursor -= luckWeight(luck(member));
        if (cursor < 0)
            return member;
    }
    return members[members.length - 1];
};
const dropBatches = (baseProbability, multiplier, random = secureRandom) => {
    const expected = clamp(baseProbability, 0, 1) * Math.max(0, multiplier);
    return Math.floor(expected) + (random() < expected % 1 ? 1 : 0);
};
const scaledDropEntries = (entries, probability, multiplier, random = secureRandom) => {
    const result = [];
    const groups = new Map();
    for (const entry of entries) {
        if (entry.group)
            groups.set(entry.group, [...(groups.get(entry.group) ?? []), entry]);
        else
            for (let i = 0, count = dropBatches(probability(entry), multiplier, random); i < count; i++)
                result.push(entry);
    }
    for (const group of groups.values()) {
        let remaining = 1;
        const weights = group.map(entry => {
            const selection = Math.min(remaining, Math.max(0, Number(entry.chance ?? 0)));
            remaining -= selection;
            return { entry, expected: selection * clamp(probability({ ...entry, chance: 1 }), 0, 1) * Math.max(0, multiplier) };
        });
        const total = weights.reduce((sum, row) => sum + row.expected, 0);
        const count = Math.floor(total) + (random() < total % 1 ? 1 : 0);
        for (let i = 0; i < count; i++) {
            let roll = random() * total;
            for (const row of weights) {
                roll -= row.expected;
                if (roll < 0) {
                    result.push(row.entry);
                    break;
                }
            }
        }
    }
    return result;
};
const initialNegotiationState = (mood = 0) => ({ mood: clamp(Math.round(mood), -moodScale, moodScale), remainder: 0, failures: 0, neutralCount: 0, dislikeCount: 0, goodwill: 0, protection: 0 });
const resolveNegotiationMove = (before, move, random = secureRandom) => {
    const state = { ...before };
    let aggression = 0;
    if (move.type === 'talk') {
        const probability = negotiationProbability(before.mood, move.charm);
        if (probability === 1 || random() < probability)
            return { state, result: 'success', protected: false, earned: false, refused: false };
        state.failures++;
        state.mood = Math.max(-moodScale, state.mood - 20_000);
        aggression = talkAggression(state.mood, state.failures);
    }
    else {
        if (!Number.isFinite(move.value) || move.value <= 0 || !Number.isFinite(move.capacity) || move.capacity <= 0)
            throw new Error('物品参考价值尚未准备好。');
        if (move.preference === 'like' && state.mood === moodScale)
            return { state, result: 'ongoing', protected: false, earned: false, refused: true };
        if (move.preference === 'like') {
            const gain = Math.min(250_000, move.value / move.capacity * moodScale) + state.remainder;
            const integral = Math.floor(gain);
            state.remainder = gain - integral;
            state.mood = Math.min(moodScale, state.mood + integral);
            if (state.mood === moodScale)
                state.remainder = 0;
        }
        else if (move.preference === 'dislike') {
            state.dislikeCount++;
            state.mood = Math.max(-moodScale, state.mood - Math.min(350_000, Math.max(1, Math.round(1.5 * move.value / move.capacity * moodScale))));
        }
        else
            state.neutralCount++;
        aggression = giftAggression(state.mood, move.preference);
    }
    let earned = false;
    if (state.mood > before.mood) {
        state.goodwill++;
        aggression = 0;
        if (state.goodwill >= 3) {
            state.goodwill = 0;
            state.protection++;
            earned = true;
        }
    }
    else if (state.mood < before.mood) {
        state.goodwill = 0;
        state.remainder = 0;
    }
    if (aggression > 0 && random() < aggression) {
        if (state.protection > 0) {
            state.protection--;
            return { state, result: 'ongoing', protected: true, earned, refused: false };
        }
        return { state, result: 'combat', protected: false, earned, refused: false };
    }
    return { state, result: 'ongoing', protected: false, earned, refused: false };
};
const synchronizeNegotiation = (shared, memories) => {
    const mood = Math.min(shared.mood, ...memories.map(m => m.mood));
    return { ...shared, mood, goodwill: mood < shared.mood ? 0 : shared.goodwill, remainder: mood < shared.mood ? 0 : shared.remainder,
        failures: Math.max(shared.failures, ...memories.map(m => m.failures)), neutralCount: Math.max(shared.neutralCount, ...memories.map(m => m.neutralCount)), dislikeCount: Math.max(shared.dislikeCount, ...memories.map(m => m.dislikeCount)) };
};

export { clamp, drawHiddenAttribute, dropBatches, giftAggression, initialNegotiationState, luckWeight, moodBand, moodBands, moodDropMultiplier, moodScale, negotiationProbability, negotiationVersion, normalWeights, resolveNegotiationMove, scaledDropEntries, secureRandom, synchronizeNegotiation, talkAggression, teamLuckMultiplier, weightedRecipient };
