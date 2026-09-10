import { recordAchievement } from './achievement-events';
import { readTalentData, saveTalentData, ownedTalent } from './talent-data';
import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { monsterNegotiationProfile, monsterItemPreference } from '../config/monster-negotiation';
import { negotiationDialogue } from '../config/monster-negotiation-dialogues';
import { classifyNegotiationItem, negotiationInventoryPage, type NegotiationItem } from './negotiation-item-policy';
import { initialNegotiationState, moodBand, resolveNegotiationMove, synchronizeNegotiation, negotiationVersion, type NegotiationState } from './negotiation-rules';
import { consumeBinding, consumeInventory } from './inventory-binding';
import { hiddenAttributesFor } from './hidden-attributes.service';

export type NegotiationCommand = { type: 'view' | 'talk' | 'gift' | 'leave' | 'fight'; sessionId?: string; revision?: number; itemId?: number; quantity?: number; page?: number; keyword?: string };
export class NegotiationCombatError extends Error {
  constructor() { super('战斗已经开始，不能继续交涉。请回到战斗面板继续行动。'); this.name = 'NegotiationCombatError'; }
}
export type NegotiationDrop = { code: string; chance: number; min: number; max: number; value: number; fixed?: boolean; group?: string; traitBonus?: number };
export type NegotiationContext = { actorId: number; leaderId: number; memberIds: number[]; target: { id: number; code: string; name: string }; battleId?: string; drops: NegotiationDrop[]; capacity: number; completionText?: string };
type Session = RowDataPacket & { id: string; spawn_id: number; owner_id: number; battle_id: string | null; state: string; revision: number; members_json: unknown; stamina_json: unknown; last_text: string; last_key: string; expires_at: Date };
type Life = RowDataPacket & { spawn_id: number; state_json: unknown; profile_json: unknown; drops_json: unknown; capacity: number; resolved: number };
export type NegotiationView = { kind: 'ongoing'; actorId: number; sessionId: string; revision: number; spawnId: number; name: string; mood: string; goodwill: number; protection: number; text: string; completionText?: string; inventory: ReturnType<typeof negotiationInventoryPage> };
export type NegotiationResult = NegotiationView | { kind: 'success' | 'combat_started' | 'combat_resumed' | 'closed'; spawnId: number; text: string };
export type NegotiationHooks = {
  random?: () => number;
  activate: (sessionId: string) => Promise<Record<string, boolean>>;
  fight: (eligibility: Record<string, boolean>, sessionId: string, failed: boolean) => Promise<string>;
  settle: (state: NegotiationState, eligibility: Record<string, boolean>, drops: NegotiationDrop[], sessionId: string) => Promise<string>;
};
const parse = <T>(raw: unknown): T => (typeof raw === 'string' ? JSON.parse(raw) : raw) as T;
const requestKey = (actorId: number, command: NegotiationCommand) => `${command.revision}:${actorId}:${command.type}:${command.itemId ?? 0}:${command.quantity ?? 0}`;
export const readNegotiationReplay = async (connection: PoolConnection, actorId: number, command: NegotiationCommand): Promise<NegotiationResult | undefined> => {
  if (!command.sessionId || command.revision === undefined || command.type === 'view') return;
  const [rows] = await connection.execute<RowDataPacket[]>('SELECT actor_id,request_key,result_json FROM negotiation_actions WHERE session_id=? AND revision=?', [command.sessionId, command.revision]);
  if (!rows.length) return;
  if (Number(rows[0].actor_id) !== actorId || rows[0].request_key !== requestKey(actorId, command)) throw new Error('交涉状态已改变，请刷新页面后重试。');
  return parse<NegotiationResult>(rows[0].result_json);
};
export const assertNoNegotiation = async (connection: Pick<PoolConnection, 'execute'>, characterId: number) => {
  await (await import('./opening-state')).assertOpeningFree(connection, characterId);
  const [rows] = await connection.execute<RowDataPacket[]>("SELECT n.id FROM negotiation_participants p JOIN negotiation_sessions n ON n.id=p.session_id WHERE p.character_id=? AND n.state='active' LIMIT 1 FOR UPDATE", [characterId]);
  if (rows.length) throw new Error('你正在交涉中，请先回到交涉页面结束交涉。');
};
export const assertMonsterNotNegotiating = async (connection: PoolConnection, spawnIds: number[]) => {
  if (!spawnIds.length) return;
  const [rows] = await connection.execute<RowDataPacket[]>(`SELECT id FROM negotiation_sessions WHERE spawn_id IN (${spawnIds.map(() => '?').join(',')}) AND state='active' LIMIT 1 FOR UPDATE`, spawnIds);
  if (rows.length) throw new Error('该怪物正在与另一支队伍交涉，请稍后再试。');
};
export const closeNegotiationSession = async (connection: PoolConnection, sessionId: string, state = 'closed') => {
  await connection.execute('UPDATE negotiation_sessions SET state=? WHERE id=?', [state, sessionId]);
  await connection.execute('DELETE FROM negotiation_participants WHERE session_id=?', [sessionId]);
};
export const readNegotiationView = async (connection: PoolConnection, ctx: NegotiationContext, session: Session, state: NegotiationState, command: NegotiationCommand): Promise<NegotiationView> => {
  const [items] = await connection.execute<(RowDataPacket & NegotiationItem & { quantity: number; trade_bound_quantity: number; personal_bound_quantity: number })[]>(`SELECT i.id,i.code,i.name,i.item_type,i.item_category,i.stackable,i.trade_price,i.effect_json,p.quantity,p.trade_bound_quantity,p.personal_bound_quantity
    FROM player_inventory p JOIN item_definitions i ON i.id=p.item_id WHERE p.character_id=? AND p.quantity>0`, [ctx.actorId]);
  return { kind: 'ongoing', actorId: ctx.actorId, sessionId: session.id, revision: Number(session.revision), spawnId: ctx.target.id, name: ctx.target.name,
    mood: moodBand(state.mood).name, goodwill: state.goodwill, protection: state.protection, text: session.last_text, ...(ctx.completionText ? { completionText: ctx.completionText } : {}),
    inventory: negotiationInventoryPage(items, command.page, command.keyword) };
};

/** 调用方已按稳定顺序锁定角色、队伍、战斗与怪物行；所有状态、库存、开战/发奖同事务。 */
export const runNegotiation = async (connection: PoolConnection, ctx: NegotiationContext, command: NegotiationCommand, hooks: NegotiationHooks): Promise<NegotiationResult> => {
  if (ctx.battleId) throw new NegotiationCombatError();
  const replay = await readNegotiationReplay(connection, ctx.actorId, command); if (replay) return replay;
  const profile = monsterNegotiationProfile(ctx.target.code, ctx.target.name);
  await connection.execute('INSERT IGNORE INTO monster_negotiation_lives (spawn_id,state_json,profile_json,drops_json,capacity,version) VALUES (?,?,?,?,?,?)', [ctx.target.id, JSON.stringify(initialNegotiationState(profile.initialMood)), JSON.stringify(profile), JSON.stringify(ctx.drops), Math.max(1, ctx.capacity), negotiationVersion]);
  const [lives] = await connection.execute<Life[]>('SELECT * FROM monster_negotiation_lives WHERE spawn_id=? FOR UPDATE', [ctx.target.id]);
  const life = lives[0]; if (life.resolved) throw new Error('该怪物已经结束遭遇，不能重复交涉。');
  const frozenProfile = parse<ReturnType<typeof monsterNegotiationProfile>>(life.profile_json);
  const shared = parse<NegotiationState>(life.state_json);
  const placeholders = ctx.memberIds.map(() => '?').join(',');
  const [memories] = await connection.execute<RowDataPacket[]>(`SELECT character_id,state_json,combat_failed FROM monster_negotiation_memories WHERE spawn_id=? AND character_id IN (${placeholders}) ORDER BY character_id FOR UPDATE`, [ctx.target.id, ...ctx.memberIds]);
  let state = synchronizeNegotiation(shared, memories.map(m => parse<NegotiationState>(m.state_json)));
  const blocked = memories.some(m => Boolean(m.combat_failed));
  const [sessions] = await connection.execute<Session[]>("SELECT * FROM negotiation_sessions WHERE spawn_id=? AND state IN ('active','preview') ORDER BY state ASC,created_at DESC FOR UPDATE", [ctx.target.id]);
  const active = sessions.find(s => s.state === 'active');
  if (active && !parse<number[]>(active.members_json).includes(ctx.actorId)) throw new Error('对方正在应付另一队人，请稍后再试。');
  let session = command.sessionId ? sessions.find(s => s.id === command.sessionId) : active ?? sessions.find(s => Number(s.owner_id) === ctx.actorId && new Date(s.expires_at).getTime() > Date.now());
  if (session && (session.battle_id ?? null) !== (ctx.battleId ?? null)) {
    if (session.state === 'active' || command.sessionId) throw new Error('遭遇已进入另一场战斗，请重新打开交涉页面。');
    await closeNegotiationSession(connection, session.id); session = undefined;
  }
  if (command.sessionId && !session) throw new Error('这张交涉页面已经失效，请重新打开交涉。');
  if (session && active && active.id !== session.id) throw new Error('队友已开始交涉，请刷新到当前会话。');
  if (!session) {
    if (command.type !== 'view') throw new Error('请先打开交涉页面。');
    const intro = negotiationDialogue(frozenProfile.family, state.mood, 'approach');
    if(await(await import('./divine-effects')).hasDivine(connection,ctx.actorId,'talent_social_01'))intro.text+=`\n\n&万语聆听&它似乎更愿意留意${frozenProfile.likes.slice(0,2).join('、')||'与自身习性相合的礼物'}。`;
    const id = randomUUID();
    await connection.execute("INSERT INTO negotiation_sessions (id,spawn_id,owner_id,battle_id,state,members_json,stamina_json,last_text,last_key,expires_at) VALUES (?,?,?,?,'preview',?,'{}',?,?,DATE_ADD(NOW(),INTERVAL 120 SECOND))", [id, ctx.target.id, ctx.actorId, ctx.battleId ?? null, JSON.stringify(ctx.memberIds), intro.text, intro.key]);
    const [created] = await connection.execute<Session[]>('SELECT * FROM negotiation_sessions WHERE id=?', [id]); session = created[0];
  }
  if (!parse<number[]>(session.members_json).includes(ctx.actorId)) throw new Error('请打开你自己的交涉页面。');
  if (session.state === 'active' && JSON.stringify(parse<number[]>(session.members_json)) !== JSON.stringify(ctx.memberIds)) throw new Error('参与队伍已改变，请先结束原交涉。');
  const expired = new Date(session.expires_at).getTime() <= Date.now();
  if (expired) {
    await closeNegotiationSession(connection, session.id);
    const text = session.battle_id && session.state === 'active' ? await hooks.fight(parse(session.stamina_json), session.id, false) : '交涉暂时结束，怪物保留了上次的心情与记忆。';
    return { kind: session.battle_id && session.state === 'active' ? 'combat_resumed' : 'closed', spawnId: ctx.target.id, text };
  }
  if (command.type === 'view' && !blocked) return readNegotiationView(connection, ctx, session, state, command);
  if (command.type !== 'view' && Number(command.revision) !== Number(session.revision)) throw new Error('交涉状态已改变，请刷新后重试。');
  if (['leave', 'fight'].includes(command.type) && ctx.actorId !== ctx.leaderId) throw new Error('只有队长可以结束交涉或主动开战。');
  if (session.state === 'preview' && ctx.actorId !== ctx.leaderId && !blocked) throw new Error('请先由队长发起第一项交涉动作。');
  if (!blocked && command.type === 'gift' && state.mood === 1_000_000) {
    const [items] = await connection.execute<(RowDataPacket & NegotiationItem)[]>('SELECT * FROM item_definitions WHERE id=?', [Number(command.itemId)]);
    const policy = items[0] && classifyNegotiationItem(items[0]);
    if (policy?.usable && monsterItemPreference(frozenProfile, policy.subtype, items[0].code) === 'like') throw new Error('对方已充分接受你们的诚意，不再收取这份礼物。请点击「交谈」说定协议。');
  }
  if (session.state === 'preview' && command.type === 'leave' && !blocked) {
    await closeNegotiationSession(connection, session.id);
    const result: NegotiationResult = { kind: 'closed', spawnId: ctx.target.id, text: '你们暂时收起提议，对方仍保留先前的心情。' };
    await connection.execute('INSERT INTO negotiation_actions (session_id,revision,actor_id,request_key,result_json) VALUES (?,?,?,?,?)', [session.id, Number(command.revision), ctx.actorId, requestKey(ctx.actorId, command), JSON.stringify(result)]);
    return result;
  }
  let eligibility = parse<Record<string, boolean>>(session.stamina_json);
  if (session.state === 'preview' && !['leave'].includes(command.type)) {
    for (const id of ctx.memberIds) await assertNoNegotiation(connection, id);
    eligibility = await hooks.activate(session.id);
    await connection.execute("UPDATE negotiation_sessions SET state='active',members_json=?,stamina_json=? WHERE id=?", [JSON.stringify(ctx.memberIds), JSON.stringify(eligibility), session.id]);
    for (const id of ctx.memberIds) await connection.execute('INSERT INTO negotiation_participants (character_id,session_id) VALUES (?,?)', [id, session.id]);
    session.state = 'active'; session.members_json = ctx.memberIds; session.stamina_json = eligibility;
  }
  let result: NegotiationResult; let kind: 'ongoing' | 'success' | 'combat' | 'closed' = 'ongoing'; let key = session.last_key;
  const openingTalent=await ownedTalent(connection,ctx.actorId),talentData=await readTalentData(connection,ctx.actorId),peaceKey=`peace:${ctx.target.id}`;
  if(openingTalent?.number==='D07'&&!Object.hasOwn(talentData.flags,peaceKey)&&!blocked){
    const [goods]=await connection.execute<RowDataPacket[]>("SELECT i.effect_json FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.quantity>0 AND i.item_type='consumable'",[ctx.actorId]);
    const offensive=goods.some(row=>{const effect=typeof row.effect_json==='string'?JSON.parse(row.effect_json):row.effect_json??{};return Boolean(effect.throwable||effect.damage||effect.damagePct||effect.aoeDamage||effect.alchemyOutput&&/damage|poison|burn/.test(JSON.stringify(effect)));});
    talentData.flags[peaceKey]=talentData.settings.peaceOpening===true&&!offensive&&memories.length===0;await saveTalentData(connection,ctx.actorId,talentData);
  }
  let text = session.last_text; let failed = false;
  if (blocked) {
    const quote = negotiationDialogue(frozenProfile.family, state.mood, 'blocked', '', '', key); text = quote.text; key = quote.key; kind = 'combat'; failed = true;
  } else if (command.type === 'leave' || command.type === 'fight') {
    const quote = negotiationDialogue(frozenProfile.family, state.mood, 'left', '', '', key); text = quote.text; key = quote.key;
    kind = command.type === 'fight' || Boolean(ctx.battleId && session.state === 'active') ? 'combat' : 'closed';
  } else {
    let move: Parameters<typeof resolveNegotiationMove>[1]; let itemName = ''; let subtype = ''; let preference: 'like' | 'neutral' | 'dislike' = 'neutral';
    if (command.type === 'gift') {
      if (!Number.isSafeInteger(command.itemId) || !Number.isSafeInteger(command.quantity) || Number(command.quantity) < 1 || Number(command.quantity) > 999999) throw new Error('交付数量必须是 1～999999 的整数。');
      const [rows] = await connection.execute<(RowDataPacket & NegotiationItem)[]>('SELECT * FROM item_definitions WHERE id=?', [Number(command.itemId)]);
      const item = rows[0]; if (!item) throw new Error('物品不存在。');
      const policy = classifyNegotiationItem(item); if (!policy.usable) throw new Error(policy.reason);
      itemName = item.name; subtype = policy.subtype; preference = monsterItemPreference(frozenProfile, subtype, item.code);
      move = { type: 'gift', preference, value: policy.value * Number(command.quantity), capacity: Number(life.capacity) };
      if(preference==='like'&&state.mood<1_000_000){
        const talent=await (await import('./talent-data')).ownedTalent(connection,ctx.actorId);
        let bonus=talent?.number==='D01'?2:talent?.number==='F08'?1:talent?.number==='D07'&&talentData.flags[peaceKey]?3:0;
        const[classes]=await connection.execute<RowDataPacket[]>('SELECT t.monster_class FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.id=?',[ctx.target.id]);
        if(classes[0]?.monster_class!=='boss'&&!state.companionGiftUsed&&await(await import('./companion.service')).activeCompanionSpecialty(connection,ctx.actorId,'negotiate')){bonus+=.05;state.companionGiftUsed=true;}
        move.value*=1+bonus;
      }
      if (preference === 'like' && state.mood < 1_000_000) await consumeInventory(connection, ctx.actorId, Number(command.itemId), Number(command.quantity), true);
      else {
        // 拒收不扣物品，但必须实际持有足量未绑定物品，不能伪造试探。
        const [stock] = await connection.execute<RowDataPacket[]>('SELECT quantity,trade_bound_quantity,personal_bound_quantity FROM player_inventory WHERE character_id=? AND item_id=? FOR UPDATE', [ctx.actorId, Number(command.itemId)]);
        const trade = Number(stock[0]?.trade_bound_quantity ?? 0); const personal = Number(stock[0]?.personal_bound_quantity ?? 0);
        consumeBinding({ trade, personal, unbound: Number(stock[0]?.quantity ?? 0) - trade - personal }, Number(command.quantity), true);
      }
    } else move = { type: 'talk', charm: (await hiddenAttributesFor(connection, ctx.actorId)).charm };
    const before = state; const outcome = resolveNegotiationMove(before, move, hooks.random); state = outcome.state; kind = outcome.result;
    if(command.type==='gift'&&(outcome.refused||preference!=='like')){const refused=state.achievementGiftRefusedBy??=[];if(!refused.includes(ctx.actorId))refused.push(ctx.actorId);}
    const quote = negotiationDialogue(frozenProfile.family, before.mood, outcome.refused ? 'refused' : command.type === 'gift' ? preference : kind === 'success' ? 'success' : 'talk_failed', subtype, itemName, key);
    text = quote.text; key = quote.key;
    if (command.type === 'gift' && !outcome.refused) text += preference === 'like' ? `\n已交付：${itemName} ×${command.quantity}` : `\n对方未收下：${itemName} ×${command.quantity}（仍在背包）`;
    if (outcome.earned) text += '\n它记住了接连的善意，你们获得了 1 次开战保护。';
    if (outcome.protected) text += `\n开战保护生效。${negotiationDialogue(frozenProfile.family, state.mood, 'protected', '', '', key).text}`;
    failed = kind === 'combat';
    if(openingTalent?.number==='F08'&&command.type==='gift'){const data=await readTalentData(connection,ctx.actorId);data.flags[`preference:${ctx.target.code}:${subtype}`]=preference;await saveTalentData(connection,ctx.actorId,data);}
  }
  if(failed&&openingTalent?.number==='D07'&&talentData.flags[peaceKey]){const data=await readTalentData(connection,ctx.actorId);data.flags[`peaceFailure:${ctx.target.id}`]=true;await saveTalentData(connection,ctx.actorId,data);}
  await connection.execute('UPDATE monster_negotiation_lives SET state_json=?,revision=revision+1,updated_at=NOW() WHERE spawn_id=?', [JSON.stringify(state), ctx.target.id]);
  for (const id of ctx.memberIds) await connection.execute(`INSERT INTO monster_negotiation_memories (spawn_id,character_id,state_json,combat_failed,first_failure_at) VALUES (?,?,?,?,${failed ? 'NOW()' : 'NULL'})
    ON DUPLICATE KEY UPDATE state_json=VALUES(state_json),combat_failed=GREATEST(combat_failed,VALUES(combat_failed)),first_failure_at=COALESCE(first_failure_at,VALUES(first_failure_at))`, [ctx.target.id, id, JSON.stringify(state), failed ? 1 : 0]);
  if (kind === 'success') {
    if(state.achievementGiftRefusedBy?.includes(ctx.actorId))recordAchievement(connection,ctx.actorId,['ACH_F06'],'negotiation-refused:'+session.id);
    text += await (await import('./companion.service')).offerNegotiatedCompanion(connection, Number(session.owner_id), ctx.target.id, state.mood, Number(life.capacity), hooks.random);
    text += '\n' + await hooks.settle(state, eligibility, parse(life.drops_json), session.id);
    await connection.execute('UPDATE monster_negotiation_lives SET resolved=1 WHERE spawn_id=?', [ctx.target.id]);
    recordAchievement(connection,ctx.actorId,[{metric:'ACH_EGG10',distinct:ctx.target.code},{metric:'ACH_EGG45',distinct:String(ctx.target.id)},{metric:'ACH_EGG46',distinct:ctx.target.code},{metric:'ACH_F02'},{metric:'ACH_F03',distinct:ctx.target.code},{metric:'ACH_F04',distinct:String(ctx.target.id)}], 'negotiation:'+session.id);
    await closeNegotiationSession(connection, session.id, 'settled'); result = { kind: 'success', spawnId: ctx.target.id, text };
  } else if (kind === 'combat') {
    await closeNegotiationSession(connection, session.id, 'combat');
    text += '\n' + await hooks.fight(eligibility, session.id, failed);
    result = { kind: ctx.battleId ? 'combat_resumed' : 'combat_started', spawnId: ctx.target.id, text };
  } else if (kind === 'closed') {
    await closeNegotiationSession(connection, session.id); result = { kind: 'closed', spawnId: ctx.target.id, text };
  } else {
    session.revision = Number(session.revision) + 1; session.last_text = text; session.last_key = key;
    await connection.execute('UPDATE negotiation_sessions SET revision=?,last_text=?,last_key=?,expires_at=DATE_ADD(NOW(),INTERVAL 120 SECOND) WHERE id=?', [session.revision, text, key, session.id]);
    result = await readNegotiationView(connection, ctx, session, state, command);
  }
  if(['talk','gift'].includes(command.type))recordAchievement(connection,ctx.actorId,['ACH_F01']);
  if (command.type !== 'view') await connection.execute('INSERT INTO negotiation_actions (session_id,revision,actor_id,request_key,result_json) VALUES (?,?,?,?,?)', [session.id, Number(command.revision), ctx.actorId, requestKey(ctx.actorId, command), JSON.stringify(result)]);
  return result;
};
