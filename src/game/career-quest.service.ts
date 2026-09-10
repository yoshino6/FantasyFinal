import type { Pool, RowDataPacket } from 'mysql2/promise';
import { getPool } from '../database/pool';
import { advancedProfessionByCode, worldTreeAdvancedProfessions, type AdvancedProfession } from './advanced-profession.config';
import type { MainQuest } from './main-quest.service';
import { openingHubs, type OpeningHubCode } from './opening-world.config';

type CareerCharacter = RowDataPacket & {
  id: number; level: number; adventurer_registered: number; profession_code: string | null;
  current_region_id: number; region_code: string; pos_x: number; pos_y: number; pos_z: number;
};
type CareerTrial = RowDataPacket & { profession_code: string; stage: number; story_kills: number; proof_kills: number };

const careerCharacterFor = async (pool: Pool, qqUserId: string) => {
  const [rows] = await pool.execute<CareerCharacter[]>(`SELECT c.id,c.level,c.adventurer_registered,c.profession_code,c.current_region_id,
    r.code AS region_code,c.pos_x,c.pos_y,c.pos_z FROM characters c JOIN players p ON p.id=c.player_id
    JOIN map_regions r ON r.id=c.current_region_id WHERE p.qq_user_id=? AND c.npc_id IS NULL LIMIT 1`, [qqUserId]);
  if (!rows[0]) throw new Error('请先注册角色。');
  return rows[0];
};

/** 公会登记和主职业沿用已有角色状态；任务栏只读取进度，不补写或重复发奖。 */
const guildCareerQuestFor = async (pool: Pool, character: CareerCharacter): Promise<MainQuest | null> => {
  if (Number(character.adventurer_registered) && character.profession_code) return null;
  const local=openingHubs[character.region_code as OpeningHubCode];
  if(local&&character.region_code!=='baina_town')return{
    title:Number(character.adventurer_registered)?'【主线·选择主职业】':'【主线·成为冒险者】',
    description:Number(character.adventurer_registered)?`${local.host}把四份职业介绍摆到你面前：“要怎么往前走，由你自己决定。”\n\n在${local.guildName}查看战士、法师、盗贼与牧师的介绍，再确认一个主职业。登记后领取普通适配武器。`:`${local.description}\n\n${local.host}替你翻开登记簿。到${local.guildName}登记姓名，领取冒险者卡，让这段旅途有一个正式的开始。`,
    action:{label:'[当地公会]',command:'/初行公会'}
  };
  const [guilds] = await pool.execute<(RowDataPacket & { region_id: number; pos_x: number; pos_y: number; pos_z: number })[]>(`
    SELECT n.region_id,n.pos_x,n.pos_y,n.pos_z FROM map_npcs n JOIN map_regions r ON r.id=n.region_id
    WHERE n.code='guild_counter' AND r.code='baina_town' LIMIT 1`);
  const guild = guilds[0];
  const atGuild = guild && Number(character.current_region_id) === Number(guild.region_id)
    && Number(character.pos_x) === Number(guild.pos_x) && Number(character.pos_y) === Number(guild.pos_y)
    && Number(character.pos_z) === Number(guild.pos_z);
  const action = atGuild
    ? { label: '[前往 公会前台]', command: '/建筑区域 guild_counter 前台' }
    : guild ? { label: '[前往 冒险者公会]', command: `/前往 ${guild.pos_x} ${guild.pos_y}` } : undefined;
  if (!Number(character.adventurer_registered)) return {
    title: '【主线·成为冒险者】',
    description: '梨子喵已经带你认识了百纳镇，也将你领到了冒险者公会。接下来，该让这段冒险有一个正式的开始。\n\n前往冒险者公会的前台，与莫妮卡交谈，选择【冒险者 注册】，完成登记并领取冒险者卡。',
    action
  };
  return {
    title: '【主线·选择主职业】',
    description: '冒险者卡上已经写下你的名字。莫妮卡将四份职业介绍摆到面前，等待你决定今后以怎样的方式面对这片世界。\n\n在冒险者公会前台打开【职业选择】，查看战士、法师、盗贼与牧师的介绍，再确认一个主职业。\n\n目标：完成主职业选择。',
    action: atGuild ? { label: '[选择 主职业]', command: '/职业选择' } : action
  };
};

export const guildCareerMainQuest = async (qqUserId: string): Promise<MainQuest | null> => {
  const pool = await getPool();
  return guildCareerQuestFor(pool, await careerCharacterFor(pool, qqUserId));
};

/** 二转是 Lv.25 起独立展示的主线，不受开化、生长结或其他剧情的当前阶段覆盖。 */
export const advancedProfessionMainQuest = async (qqUserId: string): Promise<MainQuest | null> => {
  const pool = await getPool(); const character = await careerCharacterFor(pool, qqUserId);
  if (Number(character.level) < 25) return null;
  const [[quests], [completed], [cores]] = await Promise.all([
    pool.execute<CareerTrial[]>('SELECT profession_code,stage,story_kills,proof_kills FROM player_advanced_profession_quests WHERE character_id=? AND stage IN (1,2,3) ORDER BY stage DESC,profession_code ASC LIMIT 1', [character.id]),
    pool.execute<(RowDataPacket & { profession_code: string })[]>('SELECT profession_code FROM player_advanced_professions WHERE character_id=? LIMIT 1', [character.id]),
    pool.execute<(RowDataPacket & { quantity: number })[]>(`SELECT pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code='ridge_core' LIMIT 1`, [character.id])
  ]);
  const active = quests[0];
  if (!active && completed[0]) return null;
  const profession = active ? advancedProfessionByCode(active.profession_code) : undefined;
  const mentorAction = (route: AdvancedProfession) => character.region_code === 'world_tree'
    && Number(character.pos_x) === route.mentor.x && Number(character.pos_y) === route.mentor.y && Number(character.pos_z) === 0
    ? { label: `[关于 ${route.name}]`, command: `/二转职业 ${route.mentor.code}` }
    : { label: `[前往 ${route.mentor.name}·${route.name}]`, command: `/前往 ${route.mentor.x} ${route.mentor.y}` };
  if (!active) {
    const prerequisite = await guildCareerQuestFor(pool, character);
    if (prerequisite) return { ...prerequisite, title: '【主线·二转之路】', description: '你已达到 Lv.25，可以开始寻找二转导师。先完成冒险者注册与主职业选择，再决定要深入哪一条道路。\n\n' + prerequisite.description };
    const routes = worldTreeAdvancedProfessions;
    return {
      title: '【主线·二转之路】',
      description: '一路积累的经验让你开始理解自己的长处。世界树上的导师们各自守着一份传承，或许有人能引你走向更深的道路。\n\n前往世界树，自由选择任意二转导师，不受一转职业限制。打开【关于 职业】了解传承，再接受试炼任务。\n\n' + routes.map(route => `${route.name}：${route.mentor.title}·${route.mentor.name}（${route.mentor.x}, ${route.mentor.y}）`).join('\n'),
      actions: routes.map(mentorAction)
    };
  }
  if (!profession) throw new Error('当前二转试炼的职业配置不存在。');
  const huntAction = character.region_code === 'ridge_foothills'
    ? { label: '[寻找 试炼目标]', command: '/寻怪' }
    : { label: '[前往 岩脊山麓]', command: '/前往 -221 0' };
  const title = `【主线·二转·${profession.name}】`;
  const mentor = `世界树·${profession.mentor.title}·${profession.mentor.name}（${profession.mentor.x}, ${profession.mentor.y}）`;
  const retraining = completed[0] ? '你正在重新二转，击败新导师前仍保留当前二转职业。\n\n' : '';
  if (Number(active.stage) === 1) {
    const ready = Number(active.story_kills) >= profession.first.requiredKills;
    return { title, description: `${retraining}当前试炼：${profession.first.title}\n${profession.first.story}\n\n目标：在岩脊山麓击败【${profession.first.targetText}】 ${Number(active.story_kills)}/${profession.first.requiredKills} 次。${ready ? `\n\n见闻已收集完毕，返回${mentor}，提交第一段见闻。` : ''}`, action: ready ? mentorAction(profession) : huntAction };
  }
  if (Number(active.stage) === 2) {
    const quantity = Number(cores[0]?.quantity ?? 0);
    const ready = Number(active.proof_kills) >= profession.second.requiredKills && quantity >= profession.second.materialCount;
    return { title, description: `${retraining}当前试炼：${profession.second.title}\n${profession.second.story}\n\n目标：在岩脊山麓击败【${profession.second.targetText}】 ${Number(active.proof_kills)}/${profession.second.requiredKills} 次。\n收集岩脊核心：${quantity}/${profession.second.materialCount}。${ready ? `\n\n凭证已齐备，返回${mentor}，提交第二段凭证。` : ''}`, action: ready ? mentorAction(profession) : huntAction };
  }
  return { title, description: `${retraining}当前试炼：导师试炼\n${profession.trial.description}\n\n前往${mentor}，挑战 Lv.30【${profession.trial.name}】。击败导师后完成二转；战败可以再次挑战。`, action: mentorAction(profession) };
};
