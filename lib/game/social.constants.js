const AFFINITY_STAGES = [
    { min: 0, max: 49, title: '初识', description: '已经成为游戏内好友，但还只是偶尔照面的同伴。' },
    { min: 50, max: 199, title: '相知', description: '开始记得彼此的习惯与冒险路线。' },
    { min: 200, max: 499, title: '交心', description: '可以互相赠礼，教堂会提示星誓还差多少。' },
    { min: 500, max: 999, title: '莫逆', description: '达到星誓最低好感要求。' },
    { min: 1000, max: 1999, title: '同行', description: '星誓后可显示特殊关系称号。' },
    { min: 2000, max: 2999, title: '同频', description: '形成稳定的配合节奏，可解锁更丰富的互动文案。' },
    { min: 3000, max: 4999, title: '知己', description: '熟悉彼此的习惯与选择，好友资料显示专属称号。' },
    { min: 5000, max: 7999, title: '灵犀', description: '交流与赠礼剧情进入高阶文案池。' },
    { min: 8000, max: 11999, title: '星伴', description: '星誓关系可展示长期同行称号。' },
    { min: 12000, max: 19999, title: '共鸣', description: '可作为纪念剧情与后续双人内容的高阶前置。' },
    { min: 20000, max: null, title: '星誓共鸣', description: '关系阶段的最高展示级别，不提供直接战斗数值加成。' }
];
const AFFINITY_REQUEST_TTL_MINUTES = 7 * 24 * 60;
const OATH_REQUEST_TTL_MINUTES = 10;
const FRIEND_INTERACTION_DAILY_LIMIT = 3;
const FRIEND_GIFT_DAILY_LIMIT = 3;
const BOUQUET_DAILY_LIMIT = 3;
const FRUIT_DAILY_LIMIT = 1;
const OATH_MEMORY_DAILY_LIMIT = 1;
const OATH_MIN_AFFINITY = 500;
const relationshipStage = (affinity) => {
    const value = Math.max(0, Math.floor(Number(affinity) || 0));
    const index = Math.max(0, AFFINITY_STAGES.findIndex(stage => stage.max === null || value <= stage.max));
    const stage = AFFINITY_STAGES[index];
    const next = AFFINITY_STAGES[index + 1];
    return { ...stage, value, nextMin: next?.min ?? null, toNext: next ? Math.max(0, next.min - value) : 0 };
};
const relationshipDisplayStage = (status, affinity) => {
    if (status === 'oath')
        return relationshipStage(affinity);
    const stage = relationshipStage(affinity);
    const cap = AFFINITY_STAGES.find(entry => entry.title === '知己');
    return affinity > Number(cap.max) ? { ...cap, value: Math.max(0, Math.floor(Number(affinity) || 0)), nextMin: null, toNext: 0 } : stage;
};
const pairOf = (left, right) => left < right
    ? { low: left, high: right }
    : { low: right, high: left };

export { AFFINITY_REQUEST_TTL_MINUTES, AFFINITY_STAGES, BOUQUET_DAILY_LIMIT, FRIEND_GIFT_DAILY_LIMIT, FRIEND_INTERACTION_DAILY_LIMIT, FRUIT_DAILY_LIMIT, OATH_MEMORY_DAILY_LIMIT, OATH_MIN_AFFINITY, OATH_REQUEST_TTL_MINUTES, pairOf, relationshipDisplayStage, relationshipStage };
