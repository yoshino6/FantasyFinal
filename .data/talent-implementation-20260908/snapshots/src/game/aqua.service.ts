import type { RowDataPacket, PoolConnection } from 'mysql2/promise';
import type { CombatRules, RuleUnit } from './combat-rule-registry';
import { getPool, withTransaction } from '../database/pool';
import { openingCharacter } from './opening.service';
import { openingWorldFor } from './opening-state';
import { requireGuildService } from './guild-context';
import { serveBasicOpeningMeal } from './opening-keepsakes.service';
import { openingReplay, saveOpeningReplay } from './opening-replay';
import { staminaMaxForRealm } from './constants';

export type AquaView = { title: string; text: string; revision: number; choices: { code: string; label: string }[] };
const chapters: { title: string; text: string; choices: { code: string; label: string }[] }[] = [
  { title: '能写两次神明吗', text: '阿库娅把表格推给维萝，姓名和职业两栏赫然都写着“女神”。\n\n维萝把笔放回她手边：“姓名只写名字，下面填您愿意承担的工作。”\n\n“净化、赐福、拯救世界——这些格子根本不够！”\n\n维萝指向安全水台上的玻璃杯：“那先从这杯水开始。”杯底沉着细沙，杯旁贴着请勿饮用的纸条。阿库娅卷起袖口，又偷偷看你一眼，显然在等一个足够郑重的开场。', choices: [{ code: 'purify', label: '陪她净化教具杯并登记能力' }] },
  { title: '今晚住哪里', text: '维萝交来初居登记纸：“房间、热餐和办事桌都安排好了。先安顿下来，不收押金。”\n\n阿库娅沿木梯走进小屋，先嫌床不像神座，又被晒过的被子吸引。她刚坐下便绷直背：“这是为了考察当地的休息条件！”\n\n窗外传来餐铃。她看向枕头，又看向楼梯，最后把决定推给你：“带路吧。本女神对这种小事一向很宽容。”', choices: [{ code: 'room', label: '先把房间整理好' }, { code: 'meal', label: '去领一份普通热餐' }, { code: 'file', label: '先到办事桌归档' }] },
  { title: '第一次被要求按单结算', text: '一张净水委托压在桌角：世界树公会安全水台，三桶生活用水，检查合格后结算。\n\n阿库娅刚读到“净水”，就兴冲冲望向窗外的河流。你把单子转回她面前，指住“三桶”。\n\n“可那条河也在那里呀！”她一脸不解。委托官默默把第四只空桶搬远，给你留出处理这件事的时间。', choices: [{ code: 'scope', label: '先核对三桶水的位置与验收要求' }] },
  { title: '神迹也要量清楚', text: '桶边标好了水量，取样杯也逐个贴上编号。阿库娅举起手，地上的水光却不太安分地朝门外延伸。\n\n“顺便把旁边的——”\n\n你想起委托单上没有“顺便”这一栏。现在需要在神迹越过安全水台之前，把范围说清楚。', choices: [{ code: 'limit', label: '按单提醒她只处理这三桶' }, { code: 'commissioner', label: '请委托官当面说明范围' }] }
];
const parse = (v: unknown): Record<string, any> => typeof v === 'string' ? JSON.parse(v) : (v ?? {}) as Record<string, any>;
export const aquaPermitLevel=(battles:number)=>Math.min(3,1+Math.floor(Math.max(0,battles)/10));
export const aquaSupport=async(c:PoolConnection,rules:CombatRules,owner:RuleUnit,actionKey:string)=>{
  if(owner.hp<=0||owner.companion||owner.opening?.pve===false||owner.state.memory.opening_aqua_action===actionKey)return;
  const[rows]=await c.execute<RowDataPacket[]>(`SELECT r.flags_json FROM opening_world w JOIN player_opening_relations r ON r.character_id=w.aqua_character_id AND r.npc_code='aqua' WHERE w.id=1 AND w.aqua_character_id=? AND w.aqua_location='follow' AND w.aqua_stage>=3`,[Number(owner.key.split(':')[1])]);
  if(!rows[0])return;owner.state.memory.opening_aqua_action=actionKey;
  const count=Number(owner.state.memory.opening_aqua_actions??0)+1;owner.state.memory.opening_aqua_actions=count;if(count%3)return;
  const level=aquaPermitLevel(Number(parse(rows[0].flags_json).permitBattles??0));
  if(owner.hp<owner.hpMax*.6&&rules.once(owner,'opening_aqua_heal',true)){
    const heal=Math.min(owner.hpMax-owner.hp,Math.floor(owner.hpMax*(.04+level*.01)));owner.hp+=heal;
    rules.log.push(`　&阿库娅·在地恩惠&“这时候就该依靠本女神啦！”恢复 ${heal} HP。`);return;
  }
  const removable=(e:ReturnType<CombatRules['effects']>[number])=>!e.mechanism&&['poison','burn','bleed','bleeding','slow','blind'].includes(e.code);
  if(rules.effects(owner).some(removable)&&rules.once(owner,'opening_aqua_cleanse',true)){await rules.dispel(owner,owner,true,1,removable);rules.log.push('　&阿库娅·净水涤尘&“小小的污秽，还想挡住女神？”一类普通减益被净化。');}
};
export const advanceAquaPermit=async(c:PoolConnection,id:number)=>{
  await c.execute(`UPDATE player_opening_relations r JOIN opening_world w ON w.aqua_character_id=r.character_id SET r.flags_json=JSON_SET(r.flags_json,'$.permitBattles',LEAST(20,COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(r.flags_json,'$.permitBattles')) AS UNSIGNED),0)+1)) WHERE r.character_id=? AND r.npc_code='aqua' AND w.aqua_location='follow' AND w.aqua_stage>=3`,[id]);
};
const ownerView = (world: RowDataPacket, flags: Record<string, any>): AquaView => {
  const stage = Number(world.aqua_stage);
  if (stage >= 3) return { title: '地上的女神办事桌', text: `阿库娅把已经签好的协作表摊在桌上：“现在总算知道该怎么付报酬了吧？下次记得夸奖也要写进去！”\n\n三章登记已经完成，协作身份与这段同行关系保存在案。\n\n在地许可 Lv.${aquaPermitLevel(Number(flags.permitBattles??0))}｜有效同行冒险 ${Math.min(20,Number(flags.permitBattles??0))}/20。每三次主人行动最多支援一次；每场一次低血治疗（${4+aquaPermitLevel(Number(flags.permitBattles??0))}%生命）与一次普通净化。完成10／20次有收益的同行冒险后，治疗许可逐级提高。\n\n${world.aqua_location === 'follow' ? '她正在随你出行，占用唯一出行支援位。' : '她暂驻世界树公会，办事桌仍照常收件。'}`, revision: Number(world.revision), choices: [{ code: world.aqua_location === 'follow' ? 'stay' : 'follow', label: world.aqua_location === 'follow' ? '约好暂驻世界树公会' : '邀请阿库娅继续同行' }] };
  return { ...chapters[stage === 2 && flags.scopeRead ? 3 : stage], revision: Number(world.revision) };
};
export const aquaView = async (user: string): Promise<AquaView> => {
  const c = await getPool(), character = await openingCharacter(c, user), world = await openingWorldFor(c);
  if (!world.aqua_character_id) return { title: '世界树接引联络桌', text: '桌边的信匣暂时空着。维萝把接引记录放回柜中：“阿库娅仍在神界，地上的普通事务由我们办理。”', revision: Number(world.revision), choices: [] };
  if (Number(world.aqua_character_id) !== Number(character.id)) {
    const [owners] = await c.execute<RowDataPacket[]>('SELECT r.name FROM characters c JOIN map_regions r ON r.id=c.current_region_id WHERE c.id=?', [world.aqua_character_id]);
    const away = world.aqua_location === 'follow' && owners.length > 0;
    return { title: '女神临时办事桌', text: away ? `桌上的留言压着一枚蓝色发夹：“本女神外出调查中！”\n\n收件员绫页核对行程：“她正随同行者在${owners[0].name}。信件可以交给我，不用等她回来。”` : '阿库娅在世界树的驻点翻着一叠文件，试图把“休息”写成外勤。绫页把收件簿翻到空白处：“交接照常办理。原同行关系保存在记录里，不会另行转赠。”', revision: Number(world.revision), choices: [] };
  }
  const [records] = await c.execute<RowDataPacket[]>("SELECT flags_json FROM player_opening_relations WHERE character_id=? AND npc_code='aqua'", [character.id]);
  return ownerView(world, parse(records[0]?.flags_json));
};
export const aquaAction = async (user: string, revision: number, action: string): Promise<AquaView> => withTransaction(async c => {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('请重新打开女神办事桌。');
  const character = await openingCharacter(c, user, true), id = Number(character.id);
  const replay = await openingReplay<AquaView>(c, id, 'aqua', revision);
  if (replay?.action === action) return replay.result;
  const context = await requireGuildService(c, id);
  const world = await openingWorldFor(c, true);
  if (Number(world.aqua_character_id) !== id) throw new Error('这份同行约定属于另一位旅人。你仍可在办事桌交信、查阅自己的回执。');
  await c.execute("INSERT IGNORE INTO player_opening_relations (character_id,npc_code,flags_json) VALUES (?,'aqua','{}')", [id]);
  const [records] = await c.execute<RowDataPacket[]>("SELECT flags_json FROM player_opening_relations WHERE character_id=? AND npc_code='aqua' FOR UPDATE", [id]);
  const flags = parse(records[0].flags_json);
  const current = ownerView(world, flags);
  if (Number(world.revision) !== revision || replay) return current;
  if (!current.choices.some(choice => choice.code === action)) throw new Error('请从当前章节选择。');
  if (context.code !== 'world_tree') throw new Error('阿库娅的落地登记与同行安排在世界树公会办理。');
  let result = '';
  if (action === 'purify') {
    flags.identity = '净水特殊协作员'; world.aqua_stage = 1;
    result = '杯中的泥沙沉了下去，水面亮得像藏着一小片天。阿库娅抱起手臂，等维萝写下“净水”，又等了好一会儿。\n\n“后面怎么没有举世无双？”\n\n“这里只填工作项目。”维萝吹干墨迹，把特殊协作登记交还给她。你的主职业仍由你自己选择。';
  } else if (['room', 'meal', 'file'].includes(action)) {
    flags.firstHome = action; world.aqua_stage = 2;
    if (action === 'meal') result = '餐盘刚落桌，阿库娅便把登记纸挪到不会沾汤的位置：“神明也得体察当地饮食！”\n\n' + await serveBasicOpeningMeal(c, id);
    else if (action === 'room') {
      await c.execute('UPDATE characters SET current_hp=hp_max,current_mp=mp_max,stamina=?,stamina_updated_at=NOW() WHERE id=?', [staminaMaxForRealm(Number(character.realm_stage)), id]);
      result = '你整理行李时，她已经把脸埋进枕头，只露出一只不肯承认舒服的耳朵。你也在安全床位休息片刻，生命、魔力与体力都恢复了。';
    } else result = '你把同行凭据交给绫页归档。阿库娅要求把签名放大一点，绫页认真另附了一张签名纸。她捧着回执，终于肯承认这里办事还算周到。';
  } else if (action === 'scope') {
    flags.scopeRead = true;
    result = '你逐条读完委托：只处理编号一至三的三桶生活用水，不出安全水台，完成后逐桶验收。阿库娅跟着点头，在“三桶”下面画了一道长得过分的蓝线。';
  } else if (action === 'limit' || action === 'commissioner') {
    result = action === 'limit' ? '你按住委托单：“只有三桶，多的得另接委托。”阿库娅把涌向门外的水光收了回来。' : '委托官举起验收杯，耐心说明三桶水的用途。阿库娅看了看空下来的门口，终于把注意力留在标好的范围里。';
    result += '\n\n取样检查全部通过。阿库娅看着结算单上的数字，半晌没说话：“神迹按桶算？”\n\n“您这次接的，确实是三桶。”\n\n【委托结算】铜币 ×40。她把签好的调查约定交给你：“下次的工作，总得有点新鲜的吧。”';
    await c.execute('UPDATE characters SET copper_coins=copper_coins+40 WHERE id=?', [id]);
    flags.jobSettled = true; world.aqua_stage = 3;
  } else if (action === 'follow') {
    await c.execute('UPDATE player_companions SET is_out=0 WHERE character_id=?', [id]);
    world.aqua_location = 'follow'; result = '你们约好继续调查。阿库娅收好文件来到身旁，普通随从回到休整处，出行支援位由她占用。';
  } else { world.aqua_location = 'world_tree'; result = '阿库娅同意暂驻世界树：“先说好，是我主动留下来帮忙的！”绫页将她的行程牌翻回在岗一面。同行关系保留，你可以安排普通随从出行。'; }
  await c.execute("UPDATE player_opening_relations SET flags_json=? WHERE character_id=? AND npc_code='aqua'", [JSON.stringify(flags), id]);
  await c.execute('UPDATE opening_world SET aqua_stage=?,aqua_location=?,revision=revision+1 WHERE id=1', [world.aqua_stage, world.aqua_location]);
  world.revision = Number(world.revision) + 1;
  const next = ownerView(world, flags), response = { ...next, text: result + '\n\n' + next.text };
  await saveOpeningReplay(c, id, 'aqua', revision, action, response);
  return response;
});
