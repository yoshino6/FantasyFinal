import type { RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { experienceRequiredForLevel } from './constants';

export type MainQuest = {
  title: string;
  description: string;
  action?: { label: string; command: string };
};

const barrierQuestCode = 'realm_barrier';
type BarrierStage = 0 | 1 | 2 | 3 | 4;
const barrierStage = (value: unknown): BarrierStage => Math.min(4, Math.max(0, Number(value) || 0)) as BarrierStage;

/** 主线只保留当前阶段，由角色等级、剧情进度与地图持有状态自动推导。 */
export const currentMainQuest = async (qqUserId: string): Promise<MainQuest> => {
  const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { level: number; experience: number; realm_stage: number; forest_status: string | null; owns_forest_map: number; owns_sky_dust: number; has_appraisal: number; barrier_stage: number })[]>(`
    SELECT c.level,c.experience,c.realm_stage,
      (SELECT sp.status FROM player_story_progress sp WHERE sp.character_id=c.id AND sp.story_code='forest_guide' LIMIT 1) AS forest_status,
      EXISTS(SELECT 1 FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=c.id AND i.code='map_dark_forest' AND pi.quantity>0) AS owns_forest_map,
      EXISTS(SELECT 1 FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=c.id AND i.code='sky_dust' AND pi.quantity>0) AS owns_sky_dust,
      EXISTS(SELECT 1 FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=c.id AND s.code='appraisal') AS has_appraisal,
      COALESCE((SELECT qp.stage FROM player_main_quest_progress qp WHERE qp.character_id=c.id AND qp.quest_code='realm_barrier' LIMIT 1),0) AS barrier_stage
    FROM characters c JOIN players p ON p.id=c.player_id
    WHERE p.qq_user_id=? LIMIT 1`, [qqUserId]);
  const character = rows[0];
  if (!character) throw new Error('请先注册角色。');
  const level = Number(character.level);
  const experience = Number(character.experience);

  if (!Number(character.has_appraisal)) return {
    title: '【主线·初识鉴识】',
    description: '未知往往比锋刃更致命。现在的你无法辨认敌人的名称、生命、技能与危险程度，贸然交战很容易陷入不利局面。\n\n打开“技能列表”，切换到“未学习”页，找到【鉴识】并消耗 1 点技能点学习。学会后，你可以在战斗中点击“鉴识”查看敌我状态；这也是在异世界活下去的第一课。\n\n目标：学习绑定技能【鉴识】。',
    action: { label: '[打开 技能·未学习]', command: '/技能列表 未学习' }
  };
  if (level < 5) return {
    title: '【主线·初入异界】',
    description: `提升至Lv.5\n当前等级：Lv.${level}/5`
  };
  if (character.forest_status !== 'completed') return {
    title: '【主线·寻找出路】',
    description: '在森林里多转转吧，寻找出路。'
  };
  if (!Number(character.owns_forest_map)) return {
    title: '【主线·探索的准备】',
    description: '前往冒险者公会商店，购买【地图·幽暗密林】。',
    action: { label: '[前往 冒险者公会]', command: '/前往 -2 -111' }
  };
  if (Number(character.realm_stage) === 1 && level >= 10 && experience >= experienceRequiredForLevel(10)) {
    const stage = barrierStage(character.barrier_stage);
    if (stage === 0) return { title: '【主线·无形的禁锢】', description: '你决定去找专业的人来请教这件事情。\n先去冒险者公会里面问问吧。', action: { label: '[前往 冒险者公会]', command: '/前往 -2 -111' } };
    if (stage === 1) return { title: '【主线·寻访晴儿】', description: '前台小姐姐建议你去找炼金师晴儿。\n前往糖水屋，询问这道无形的禁锢。', action: { label: '[前往 糖水屋]', command: '/前往 -12 -128' } };
    if (stage === 2 && !Number(character.owns_sky_dust)) return { title: '【主线·追寻天空粉尘】', description: '击败幽影狼王，收集一份【天空粉尘】。\n它或许能帮助你感悟这方世界。' };
    if (stage === 2 || stage === 3) return { title: '【主线·归还天空粉尘】', description: '你已获得【天空粉尘】。\n回到糖水屋，把它交给晴儿看看。', action: { label: '[前往 糖水屋]', command: '/前往 -12 -128' } };
    return { title: '【主线·窥探世间】', description: '天空粉尘在背包中微微发亮，似乎正在等待你的感悟。', action: { label: '[打开背包]', command: '/背包 材料' } };
  }
  if (level < 11) return {
    title: '【主线·更进一步】',
    description: `提升至Lv.11\n当前等级：Lv.${level}/11`
  };
  return {
    title: '【主线·新的旅途】',
    description: '你已跨越初心境界。新的旅途将在前方展开。'
  };
};

/** 天空粉尘只作为感悟媒介保留在背包中；突破本身由角色境界记录。 */
export const contemplateSkyDust = async (qqUserId: string) => withTransaction(async connection => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number; name: string; level: number; experience: number; realm_stage: number; owns_sky_dust: number; barrier_stage: number })[]>(`
    SELECT c.id,c.name,c.level,c.experience,c.realm_stage,
      EXISTS(SELECT 1 FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=c.id AND i.code='sky_dust' AND pi.quantity>0) AS owns_sky_dust,
      COALESCE((SELECT qp.stage FROM player_main_quest_progress qp WHERE qp.character_id=c.id AND qp.quest_code='realm_barrier' LIMIT 1),0) AS barrier_stage
    FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? FOR UPDATE`, [qqUserId]);
  const character = rows[0];
  if (!character) throw new Error('请先注册角色。');
  if (Number(character.realm_stage) !== 1) throw new Error('你已经完成初心境界的突破。');
  if (Number(character.level) < 10 || Number(character.experience) < experienceRequiredForLevel(10)) throw new Error('你的积累尚未触及初心境界的枷锁。');
  if (!Number(character.owns_sky_dust)) throw new Error('背包中没有可供感悟的天空粉尘。');
  if (barrierStage(character.barrier_stage) !== 4) throw new Error('先带着天空粉尘回去向晴儿请教，再开始窥探吧。');
  await connection.execute('UPDATE characters SET realm_stage=2 WHERE id=?', [character.id]);
  return { name: character.name };
});

export const advanceRealmBarrier = async (qqUserId: string, source: 'guild' | 'alchemist') => withTransaction(async connection => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number; level: number; experience: number; realm_stage: number; owns_sky_dust: number; barrier_stage: number })[]>(`
    SELECT c.id,c.level,c.experience,c.realm_stage,
      EXISTS(SELECT 1 FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=c.id AND i.code='sky_dust' AND pi.quantity>0) AS owns_sky_dust,
      COALESCE((SELECT qp.stage FROM player_main_quest_progress qp WHERE qp.character_id=c.id AND qp.quest_code='realm_barrier' LIMIT 1),0) AS barrier_stage
    FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? FOR UPDATE`, [qqUserId]);
  const character = rows[0];
  if (!character || Number(character.realm_stage) !== 1 || Number(character.level) < 10 || Number(character.experience) < experienceRequiredForLevel(10)) throw new Error('你暂时还没有遇到这道境界的阻碍。');
  const current = barrierStage(character.barrier_stage);
  const next = source === 'guild'
    ? current === 0 ? 1 : current
    : current === 1 ? Number(character.owns_sky_dust) ? 4 : 2 : current === 2 && Number(character.owns_sky_dust) ? 4 : current;
  await connection.execute('INSERT INTO player_main_quest_progress (character_id,quest_code,stage) VALUES (?,?,?) ON DUPLICATE KEY UPDATE stage=VALUES(stage)', [character.id, barrierQuestCode, next]);
  return { previous: current, stage: next as BarrierStage };
});
