import { automatonCorpus as corpus } from './automaton-corpus';
import { automatonRandom, automatonThemes as themes, mixVectors, type AutomatonVector } from './automaton-growth';
import { automatonSkills } from './automaton-skill-catalog';

export type AutomatonPersonality = ReturnType<typeof createAutomatonPersonality>;
const neutral: AutomatonVector = [1,0,0,0,0];
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const compatibleAutomatonTraits = (ids: string[]) => !corpus.crossRules.some(rule => rule.ifAll.every(id => ids.includes(id)) && rule.forbid.some(id => ids.includes(id)));
export const createAutomatonPersonality = (seed: string) => {
  const core = corpus.personas[Math.floor(automatonRandom(seed, 'core') * corpus.personas.length)]!;
  const axes = [...corpus.traitAxes];
  for (let i = axes.length - 1; i > 0; i--) { const j = Math.floor(automatonRandom(seed, 'axes', i) * (i + 1)); [axes[i],axes[j]] = [axes[j]!,axes[i]!]; }
  const ranges = (corpus.compatibleRanges as Record<string, Record<string, number[]>>)[core.id]!;
  const candidates = axes.slice(0,4).map(axis => axis.traits.filter(t => !ranges[axis.id] || (t.ordinal >= ranges[axis.id]![0]! && t.ordinal <= ranges[axis.id]![1]!)));
  // 枚举合法笛卡尔积后等概率选择，不以重试上限改变分布或塞入冲突词条。
  const combinations: typeof candidates = [];
  const visit = (selected: typeof candidates[number], depth: number) => {
    if (depth === 4) { combinations.push(selected); return; }
    for (const trait of candidates[depth]!) if (compatibleAutomatonTraits([...selected,trait].map(t => t.id))) visit([...selected,trait],depth+1);
  };
  visit([],0);
  if (!combinations.length) throw new Error('人格兼容矩阵没有合法组合。');
  const traits = combinations[Math.floor(automatonRandom(seed,'traits') * combinations.length)]!;
  const ordinal = (axis: string) => traits.find(t => t.id.startsWith(axis + '_'))?.ordinal;
  const r = ordinal('risk'), c = ordinal('care'), t = ordinal('tactics');
  const facets: AutomatonVector[] = [];
  if (r) facets.push(mixVectors([1-(r-1)/9,themes.守御!],[(r-1)/9,themes.战锋!]));
  if (c) facets.push(mixVectors([1-(c-1)/9,neutral],[(c-1)/9,themes.守御!]));
  const boosts = t ? corpus.skillDomains.tacticsTraitBoost[t-1]! : [];
  if (t) facets.push(mixVectors(...boosts.map(theme => [1/boosts.length,themes[theme]!] as [number,AutomatonVector])));
  const coreVector = mixVectors([2/3,themes[core.primary]!],[1/3,themes[core.secondary]!]);
  const vector = facets.length ? mixVectors([.7,coreVector],[.3,mixVectors(...facets.map(v => [1/facets.length,v] as [number,AutomatonVector]))]) : coreVector;
  const scores = Object.fromEntries(Object.keys(themes).map(theme => [theme,0]));
  scores[core.primary]! += 4; scores[core.secondary]! += 2;
  for (const theme of boosts) scores[theme]! += boosts.length === 1 ? 3 : 2;
  if (r && r >= 7) scores.战锋!++; if (r && r <= 3) scores.守御!++;
  if (c && c >= 6) scores.支援!++; if (c && c >= 8) scores.守御!++;
  const aligned = ['战锋','灵术','守御','支援','灵巧','干扰','持续','应变'].sort((a,b) => scores[b]! - scores[a]!).slice(0,2);
  const address = (corpus.addressing.profiles as Record<string,{ownerDefault:string;selfDefault:string}>)[core.id]!;
  return { version: 1, coreId: core.id, coreName: core.name, traits, scores, aligned, vector,
    ownerAddress: address.ownerDefault, selfAddress: address.selfDefault,
    selfCareHp: clamp(core.selfCareHp + (r ? 18-4*(r-1) : 0),15,75),
    ownerCareHp: clamp(core.ownerCareHp + (c ? -12+3*(c-1) : 0),20,75),
    interceptChance: clamp(core.interceptChance + (c ? -.12+.03*(c-1) : 0),0,.95), sacrifice: c === 10 };
};
const weights: Record<string,number> = { C:100,U:40,R:10,E:60,L:20,M:5 };
export const drawAutomatonSkill = (seed: string, key: string, personality: AutomatonPersonality, learned: string[], special = false, first = false) => {
  let pool = automatonSkills.filter(s => s.id.startsWith(special ? 'S' : 'N') && !learned.includes(s.id));
  if (first) pool = pool.filter(s => ['N001','N002','N003','N004','N013','N014','N015','N016','N049','N050','N073','N074'].includes(s.id));
  const aligned = pool.filter(s => s.domains.some(d => personality.aligned.includes(d)));
  if (aligned.length && automatonRandom(seed,key + ':branch') < .75) pool = aligned;
  if (!pool.length) return null;
  let roll = automatonRandom(seed,key + ':draw') * pool.reduce((sum,s) => sum + weights[s.rarity]!,0);
  for (const skill of pool) { roll -= weights[skill.rarity]!; if (roll < 0) return skill.id; }
  return pool.at(-1)!.id;
};
export const automatonSkillSlots = (level: number) => ({ A:level < 10 ? 2 : level < 20 ? 3 : 4, Psv:level < 20 ? 1 : 2, SP:level < 10 ? 0 : 1, ULT:level < 10 ? 0 : 1 });
export const validateAutomatonLoadout = (level: number, learned: string[], equipped: string[]) => {
  if (new Set(equipped).size !== equipped.length || equipped.some(id => !learned.includes(id))) throw new Error('只能装配已领悟且不重复的技能。');
  const limits = automatonSkillSlots(level);
  for (const [kind,count] of Object.entries(limits)) if (equipped.filter(id => automatonSkills.find(s => s.id === id)?.kind === kind).length > count) throw new Error('该类技能槽位不足。');
};
