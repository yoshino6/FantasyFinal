import { createHash } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { AchievementDefinition } from './achievement.config';
import { achievementById } from './achievement-rules';
import { bossAchievementFlavours } from './achievement-boss-flavour';
import { bossAchievementAttributes } from './achievement-boss-attributes';
export const excludedBossAchievementCode=(code:string)=>['dungeon_warden','scholar_ga','habadragon','goblin_royal_guard','goblin_royal_spearman'].includes(code)||code.startsWith('mentor_trial_')||code.startsWith('city_');
// 这层筛选与胜利结算的奖励筛选并列：即使后续有新入口直接调用首领成就服务，
// 测试、导师试炼、召唤物、部位和城镇追捕也不能被当成正式首通。
const excludedBossAchievementTraitCodes=new Set(['advanced_profession_trial','boss_component','boss_test','city_pursuit','npc_sparring','summoned']);
const bossTargetTraits=(target:Record<string,any>)=>{
  const value=target.traits_json;
  if(Array.isArray(value))return value;
  if(typeof value!=='string'||!value)return [] as Record<string,any>[];
  try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[];}catch{return [] as Record<string,any>[];}
};
export const isEligibleBossAchievementTarget=(target:Record<string,any>)=>
  target.monster_class==='boss'&&!bossTargetTraits(target).some(trait=>excludedBossAchievementTraitCodes.has(String(trait?.code)));
export const achievementBossTargets=async(c:PoolConnection,targets:Record<string,any>[])=>{
  const candidates=targets.filter(isEligibleBossAchievementTarget);if(!candidates.length)return [] as Record<string,any>[];
  const [templates]=await c.query<RowDataPacket[]>('SELECT id,code FROM monster_templates WHERE id IN (?)',[candidates.map(t=>t.template_id)]);
  const allowed=new Set(templates.filter(t=>!excludedBossAchievementCode(String(t.code))).map(t=>Number(t.id)));
  return candidates.filter(t=>allowed.has(Number(t.template_id)));
};

export const bossAchievementDifficulties = [
  ['ordinary','普通','普通',1,'巨影倒下以后，路重新有了远方。'],
  ['powerful','强大','优秀',2,'力量压过山野，你让它停在这里。'],
  ['heroic','英雄','优秀',2,'英雄的影子，也会落在凡人的脚边。'],
  ['infernal','深渊','精良',3,'你听见深渊的回声，也让深渊听见你。'],
  ['abyssal','地狱','精良',3,'归来时，身后的火没有吞掉你的名字。'],
  ['crimson','猩红','稀有',3,'猩红退去，剑上还留着黎明。'],
  ['corrupted','腐化','稀有',5,'腐败攀满王座，你为它留下了终点。'],
  ['holy','神圣','稀有',5,'光环熄灭之后，你看见了自己的影子。'],
  ['golden','黄金','传说',8,'黄金也有裂纹，而你找到了那一道。'],
  ['brilliant','璀璨','传说',8,'万丈光芒散去，站立者仍是你。'],
  ['dreamlike','梦幻','史诗',12,'梦境承认了醒着的人。'],
  ['fixed','固定','普通',1,'故事里的巨影，终于有了落幕的一页。']
] as const;
export const bossAchievementReward=(code:string,difficulty:string)=>{
  const tier=bossAchievementDifficulties.find(d=>d[0]===difficulty);if(!tier)throw new Error('未知首领成就难度。');
  // 新增模板尚未编入平衡目录时，按稳定模板与难度散列分散属性；不随重启改变。
  const attributes=['力量','敏捷','体质','智力','精神','感知'];
  const attribute=bossAchievementAttributes[code]?.[difficulty]??attributes[createHash('sha256').update(code+'\0'+difficulty).digest()[0]%attributes.length];
  return {rarity:tier[2],attribute:`${attribute}+${tier[3]}`};
};
export const bossAchievementDefinition=(code:string,name:string,difficulty:string):AchievementDefinition=>{
  const tier=bossAchievementDifficulties.find(d=>d[0]===difficulty);if(!tier)throw new Error('未知首领成就难度。');
  const id='ACH_BOSS_'+createHash('sha256').update(code+'\0'+difficulty).digest('hex').slice(0,14);
  const flavour=bossAchievementFlavours[code]?.[difficulty];
  return{id,name:flavour?.name??`${name}·${tier[1]}首杀`,category:'首领',...bossAchievementReward(code,difficulty),description:flavour?.description??`「${name}」——${tier[4]}`,condition:`首次在正式PVE中击败${name}，结算难度为${tier[1]}；单人需本人有效贡献，组队时同场所有玩家成员共享；测试、导师试炼、召唤物、首领部位与降服不计。`,scope:'场',dependency:'现'};
};
export const loadBossAchievementDefinitions=async(db:Pool|PoolConnection)=>{
  const [rows]=await db.query<RowDataPacket[]>('SELECT boss_code,difficulty,definition_json FROM achievement_boss_definitions');
  for(const row of rows){
    const d=typeof row.definition_json==='string'?JSON.parse(row.definition_json):row.definition_json;
    if(!d?.id?.startsWith('ACH_BOSS_'))continue;
    if(excludedBossAchievementCode(String(row.boss_code))){achievementById.delete(d.id);continue;}
    const flavour=bossAchievementFlavours[String(row.boss_code)]?.[String(row.difficulty)];
    const updated={name:flavour?.name??d.name,description:flavour?.description??d.description,...bossAchievementReward(String(row.boss_code),String(row.difficulty))};
    if(d.name!==updated.name||d.description!==updated.description||d.rarity!==updated.rarity||d.attribute!==updated.attribute){
      await db.execute("UPDATE achievement_boss_definitions SET definition_json=JSON_SET(definition_json,'$.name',?,'$.description',?,'$.rarity',?,'$.attribute',?) WHERE id=?",[updated.name,updated.description,updated.rarity,updated.attribute,d.id]);
      Object.assign(d,updated);
    }
    achievementById.set(d.id,d);
  }
};
export const ensureBossAchievement=async(c:PoolConnection,target:Record<string,any>)=>{
  if(!isEligibleBossAchievementTarget(target))return null;
  const [templates]=await c.execute<RowDataPacket[]>('SELECT code,name FROM monster_templates WHERE id=?',[target.template_id]);const template=templates[0];if(!template)return null;
  if(excludedBossAchievementCode(String(template.code)))return null;
  const traits=typeof target.traits_json==='string'?JSON.parse(target.traits_json):target.traits_json??[];
  const tier=bossAchievementDifficulties.find(d=>d[0]!=='fixed'&&traits.some((t:any)=>t.code===d[0]));
  const difficulty=tier?.[0]??'fixed';
  const d=bossAchievementDefinition(String(template.code),String(template.name),difficulty);
  await c.execute('INSERT IGNORE INTO achievement_boss_definitions(id,boss_code,difficulty,definition_json) VALUES (?,?,?,?)',[d.id,template.code,difficulty,JSON.stringify(d)]);
  achievementById.set(d.id,d);return d.id;
};
