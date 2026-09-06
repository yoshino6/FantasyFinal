import { automatonFeeds } from './automaton-feeds';
import { allocateAutomatonGrowth, automatonBirthStats, automatonRandom, cultivationRequired, keys, type AutomatonVector } from './automaton-growth';
import { createAutomatonPersonality, drawAutomatonSkill, validateAutomatonLoadout, automatonSkillSlots, type AutomatonPersonality } from './automaton-personality';
import { automatonSkills } from './automaton-skill-catalog';

export type AutomatonFeedChunk = { code: string; xp: number };
export type AutomatonLevel = { level: number; contributions: AutomatonFeedChunk[]; vector: AutomatonVector; gain: number[]; counts: number[]; skills: string[] };
export type AutomatonState = {
  version: 3; seed: string; name: string; personality: AutomatonPersonality; level: number;
  stats: number[]; hp: number; mp: number; levels: AutomatonLevel[]; progress: AutomatonFeedChunk[]; reserve: AutomatonFeedChunk[];
  learned: string[]; equipped: string[]; pendingSpecial: number; intimacy: number;
  ownerAddress: string; selfAddress: string; publicQuotes: boolean; greeting: boolean; guard: boolean;
  strategy: '性格' | '进攻' | '守护' | '节能'; customQuotes: Record<string,string[]>; preferences: Record<string,number>;
};
export const createAutomaton = (seed: string): AutomatonState => {
  const personality = createAutomatonPersonality(seed), stats = automatonBirthStats(personality.vector);
  const learned: string[] = [];
  const count = automatonRandom(seed,'birth-count') < .6 ? 1 : 2;
  for (let i = 0; i < count; i++) { const skill = drawAutomatonSkill(seed,`birth-skill:${i}`,personality,learned,false,i === 0); if (skill) learned.push(skill); }
  const state: AutomatonState = {version:3,seed,name:'机巧人偶',personality,level:1,stats,hp:stats[0]!,mp:stats[1]!,levels:[],progress:[],reserve:[],learned,equipped:[],pendingSpecial:0,intimacy:0,
    ownerAddress:personality.ownerAddress,selfAddress:personality.selfAddress,publicQuotes:false,greeting:true,guard:true,strategy:'性格',customQuotes:{},preferences:{}};
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
  state.hp = oldHp > 0 ? Math.max(1,Math.floor(oldHp / oldStats[0]! * Math.floor(state.stats[0]!))) : 0;
  state.mp = Math.floor(oldMp / oldStats[1]! * Math.floor(state.stats[1]!));
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
  const oldStats = [...state.stats], oldHp = state.hp, oldMp = state.mp;
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
        growth.values.forEach((v,i) => {state.stats[i]! += v;});
      }
    }
    append(state.reserve,{code:chunk.code,xp:remaining});
  }
  preserveRatio(state,oldStats,oldHp,oldMp); autoEquipAutomaton(state);
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
