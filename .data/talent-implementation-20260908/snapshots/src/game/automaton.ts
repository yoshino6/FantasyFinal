import { automatonFeeds } from './automaton-feeds';
import { allocateAutomatonGrowth, automatonBirthStats, automatonRandom, cultivationRequired, keys, type AutomatonVector } from './automaton-growth';
import { createAutomatonPersonality, drawAutomatonSkill, validateAutomatonLoadout, automatonSkillSlots, type AutomatonPersonality } from './automaton-personality';
import { automatonSkills } from './automaton-skill-catalog';

export type AutomatonFeedChunk = { code: string; xp: number };
export type AutomatonLevel = { level: number; contributions: AutomatonFeedChunk[]; vector: AutomatonVector; gain: number[]; counts: number[]; skills: string[] };
export type AutomatonState = {
  version: 3; growthBalanceVersion?: number; seed: string; name: string; personality: AutomatonPersonality; level: number;
  stats: number[]; hp: number; mp: number; levels: AutomatonLevel[]; progress: AutomatonFeedChunk[]; reserve: AutomatonFeedChunk[];
  learned: string[]; equipped: string[]; pendingSpecial: number; intimacy: number;
  ownerAddress: string; selfAddress: string; publicQuotes: boolean; greeting: boolean; guard: boolean;
  participation?: '参战' | '陪伴'; appearance?: string;
  archived?: boolean; named?: boolean; renameDay?: string; renameCount?: number;
  lastInteractionAt?: string;
  portrait?: {key:string;width:number;height:number;url?:string};
  strategy: '性格' | '进攻' | '守护' | '节能'; customQuotes: Record<string,string[]>; preferences: Record<string,number>;
};
export const createAutomaton = (seed: string): AutomatonState => {
  const personality = createAutomatonPersonality(seed), stats = automatonBirthStats(personality.vector);
  const learned: string[] = [];
  const count = automatonRandom(seed,'birth-count') < .6 ? 1 : 2;
  for (let i = 0; i < count; i++) { const skill = drawAutomatonSkill(seed,`birth-skill:${i}`,personality,learned,false,i === 0); if (skill) learned.push(skill); }
  const state: AutomatonState = {version:3,growthBalanceVersion:3,seed,name:'机巧人偶',personality,level:1,stats,hp:stats[0]!,mp:stats[1]!,levels:[],progress:[],reserve:[],learned,equipped:[],pendingSpecial:0,intimacy:0,
    ownerAddress:personality.ownerAddress,selfAddress:personality.selfAddress,publicQuotes:false,greeting:true,guard:true,participation:'参战',strategy:'性格',customQuotes:{},preferences:{}};
  autoEquipAutomaton(state);
  return state;
};
export const autoEquipAutomaton = (state: AutomatonState) => {
  const limits = automatonSkillSlots(state.level);
  for (const id of state.learned) {
    if (state.equipped.includes(id)) continue;
    const skill = automatonSkills.find(s => s.id === id)!;
    const capacity = limits[skill.kind as keyof typeof limits] ?? 0;
    if (state.equipped.filter(e => automatonSkills.find(s => s.id === e)?.kind === skill.kind).length < capacity) state.equipped.push(id);
  }
  validateAutomatonLoadout(state.level,state.learned,state.equipped);
};
export const feedDefinition = (code: string) => {
  const feed = automatonFeeds.find(f => f.code === code || `automaton_feed_${f.code}` === code);
  if (!feed) throw new Error('请选择十二种机巧育成原液之一。');
  return feed;
};
export const materialVector = (chunks: AutomatonFeedChunk[]): AutomatonVector => {
  const total = chunks.reduce((sum,c) => sum+c.xp,0);
  if (total <= 0) throw new Error('没有可结算的材料贡献。');
  return [0,1,2,3,4].map(i => chunks.reduce((sum,c) => sum + c.xp * Math.round(feedDefinition(c.code).vector[i]! * 10000),0) / total / 10000) as AutomatonVector;
};
const append = (chunks: AutomatonFeedChunk[], next: AutomatonFeedChunk) => {
  if (next.xp <= 0) return;
  const last = chunks.at(-1);
  if (last?.code === next.code) last.xp += next.xp; else chunks.push({...next});
};
const preserveRatio = (state: AutomatonState, oldStats: number[], oldHp: number, oldMp: number) => {
  state.hp = oldHp > 0 ? Math.max(1,Math.floor(oldHp / Math.floor(oldStats[0]!) * Math.floor(state.stats[0]!))) : 0;
  state.mp = Math.floor(oldMp / Math.floor(oldStats[1]!) * Math.floor(state.stats[1]!));
};

/** 复用每级培养向量和原随机种子，仅重放数值；技能、性格及材料记录保持原样。 */
export const migrateAutomatonGrowth = (original: AutomatonState): AutomatonState => {
  if (Number(original.growthBalanceVersion ?? 0) >= 3) return original;
  if (original.levels.length !== original.level - 1 || original.levels.some((entry, i) => entry.level !== i + 2)) throw new Error('机巧成长历史不完整，不能自动迁移。');
  const state = structuredClone(original);
  // 从旧面板减去历史升级贡献以保留出生值及其他永久增量。
  state.stats = original.stats.map((value, i) => value - original.levels.reduce((sum, entry) => sum + entry.gain[i]!, 0));
  for (const history of state.levels) {
    const growth = allocateAutomatonGrowth(history.level, state.personality.vector, history.vector, state.seed);
    history.gain = growth.values; history.counts = growth.counts;
    growth.values.forEach((value, i) => { state.stats[i]! += value; });
  }
  preserveRatio(state, original.stats, original.hp, original.mp);
  state.growthBalanceVersion = 3;
  return state;
};
/** 仅处理已扣除的材料流；封顶时保留带类型的余额，不制造无类型经验。 */
export const cultivateAutomaton = (original: AutomatonState, bottles: {code:string;count:number}[], cap: number, stopAt = cap) => {
  const state: AutomatonState = structuredClone(original);
  if (!Number.isInteger(cap) || !Number.isInteger(stopAt) || cap < 1 || stopAt < 1) throw new Error('培养等级上限无效。');
  const maximum = Math.min(50,cap,stopAt);
  if (state.level >= maximum) throw new Error('已达到本次培养等级上限，不消耗原液。');
  if (bottles.some(b => !Number.isInteger(b.count) || b.count < 1) || bottles.reduce((s,b) => s+b.count,0) > 100) throw new Error('每次最多投入 100 瓶原液。');
  const queue = [...state.reserve.map(c => ({...c})),...bottles.map(b => ({code:feedDefinition(b.code).code,xp:b.count*100}))];
  if (!queue.length) throw new Error('没有可用原液或培养余额。');
  state.reserve = [];

  for (const chunk of queue) {
    let remaining = chunk.xp;
    while (remaining > 0 && state.level < maximum) {
      const required = cultivationRequired(state.level), used = state.progress.reduce((s,c) => s+c.xp,0);
      const take = Math.min(remaining,required-used); append(state.progress,{code:chunk.code,xp:take}); remaining -= take;
      if (used + take === required) {
        const level = state.level + 1, vector = materialVector(state.progress);
        const growth = allocateAutomatonGrowth(level,state.personality.vector,vector,state.seed), learned: string[] = [];
        if (automatonRandom(state.seed,`learn-normal:${level}`) < .3) { const id = drawAutomatonSkill(state.seed,`normal:${level}`,state.personality,state.learned); if(id) {state.learned.push(id); learned.push(id);} }
        if (level % 10 === 0) { const id = drawAutomatonSkill(state.seed,`special:${level}`,state.personality,state.learned,true); if(id) {state.learned.push(id); learned.push(id);} else state.pendingSpecial++; }
        state.levels.push({level,contributions:state.progress,vector,gain:growth.values,counts:growth.counts,skills:learned});
        state.progress = []; state.level = level;
        const oldStats=[...state.stats],oldHp=state.hp,oldMp=state.mp;
        growth.values.forEach((v,i) => {state.stats[i]! += v;});
        preserveRatio(state,oldStats,oldHp,oldMp);
      }
    }
    append(state.reserve,{code:chunk.code,xp:remaining});
  }
  autoEquipAutomaton(state);
  return state;
};
export const respecAutomaton = (original: AutomatonState, levels: number[], replacement: AutomatonFeedChunk[]) => {
  const state: AutomatonState = structuredClone(original);
  if (!levels.length || new Set(levels).size !== levels.length || levels.some(level => !state.levels.some(l => l.level === level))) throw new Error('请选择已完成且不重复的成长等级。');
  const required = levels.reduce((sum,level) => sum + cultivationRequired(level-1),0);
  if (replacement.some(c => !Number.isInteger(c.xp) || c.xp <= 0) || replacement.reduce((s,c) => s+c.xp,0) !== required) throw new Error('重调贡献必须恰好覆盖所选等级的原始经验。');
  const queue = replacement.map(c => ({...c})); let changed = false;
  for (const level of [...levels].sort((a,b) => a-b)) {
    const history = state.levels.find(l => l.level === level)!, contributions: AutomatonFeedChunk[] = [];
    let remaining = cultivationRequired(level-1);
    while (remaining > 0) { const chunk = queue[0]!; const take = Math.min(remaining,chunk.xp); append(contributions,{code:chunk.code,xp:take}); remaining-=take;chunk.xp-=take;if(!chunk.xp)queue.shift(); }
    const vector = materialVector(contributions);
    changed ||= vector.some((v,i) => Math.abs(v-history.vector[i]!) > 1e-10);
    const growth = allocateAutomatonGrowth(level,state.personality.vector,vector,state.seed);
    Object.assign(history,{contributions,vector,gain:growth.values,counts:growth.counts});
  }
  if (!changed) throw new Error('材料贡献比例相同，无需重调，不扣费。');
  state.stats = automatonBirthStats(state.personality.vector);
  for(const history of state.levels) history.gain.forEach((v,i) => {state.stats[i]! += v;});
  preserveRatio(state,original.stats,original.hp,original.mp);
  return {state,required,fee:Math.max(100,Math.ceil(required*.1))};
};
export const automatonPanel = (state: AutomatonState) => Object.fromEntries(keys.map((key,i) => [key,Math.floor(state.stats[i]!+1e-9)]));

/** 主人等级回退仅限制当场面板，保留实例的原始成长与随机结果。 */
export const effectiveAutomatonState = (original: AutomatonState, ownerCap: number) => {
  const state = structuredClone(original);
  const cap = Math.max(1,Math.min(50,Math.floor(ownerCap),state.level));
  if (cap === state.level) return state;
  const unavailable = state.levels.filter(l => l.level > cap);
  for (const level of unavailable) level.gain.forEach((v,i) => {state.stats[i]! -= v;});
  const unavailableSkills = new Set(unavailable.flatMap(l => l.skills));
  state.learned = state.learned.filter(id => !unavailableSkills.has(id));
  state.levels = state.levels.filter(l => l.level <= cap); state.level = cap;
  const limits = automatonSkillSlots(cap), counts: Record<string,number> = {};
  state.equipped = state.equipped.filter(id => {
    const kind = automatonSkills.find(s => s.id === id)!.kind;
    if(!state.learned.includes(id))return false;
    counts[kind] = (counts[kind] ?? 0) + 1;
    return counts[kind]! <= limits[kind as keyof typeof limits];
  });
  preserveRatio(state,original.stats,original.hp,original.mp);
  return state;
};
