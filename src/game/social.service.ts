import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '../database/pool';
import {
  AFFINITY_REQUEST_TTL_MINUTES, BOUQUET_DAILY_LIMIT, FRIEND_GIFT_DAILY_LIMIT,
  FRIEND_INTERACTION_DAILY_LIMIT, FRUIT_DAILY_LIMIT, OATH_MEMORY_DAILY_LIMIT,
  OATH_MIN_AFFINITY, OATH_REQUEST_TTL_MINUTES, pairOf, relationshipDisplayStage, relationshipStage
} from './social.constants';

type CharacterRow = RowDataPacket & {
  id: number; player_id: number; game_id: number; name: string; current_region_id: number;
  pos_x: number; pos_y: number; pos_z: number; activity_status: string; npc_code: string | null;
};
type RelationshipRow = RowDataPacket & {
  character_low_id: number; character_high_id: number; status: 'friend' | 'oath' | 'ended';
  affinity: number; daily_date: string | Date; daily_interactions: number; daily_gifts: number;
  daily_bouquet_count: number; daily_fruit_count: number; daily_ceremony_count: number;
};

const businessDate = () => {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const characterFor = async (connection: PoolConnection, qqUserId: string, lock = false) => {
  const [rows] = await connection.execute<CharacterRow[]>(`SELECT c.id,c.player_id,c.game_id,c.name,c.current_region_id,c.pos_x,c.pos_y,c.pos_z,c.activity_status,c.npc_code
    FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
  const character = rows[0];
  if (!character) throw new Error('请先完成角色注册。');
  return character;
};

const targetFor = async (connection: PoolConnection, gameId: number, lock = false) => {
  const [rows] = await connection.execute<CharacterRow[]>(`SELECT id,player_id,game_id,name,current_region_id,pos_x,pos_y,pos_z,activity_status,npc_code
    FROM characters WHERE game_id=? AND npc_code IS NULL LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [gameId]);
  return rows[0];
};

const characterById = async (connection: PoolConnection, characterId: number, lock = false) => {
  const [rows] = await connection.execute<CharacterRow[]>(`SELECT id,player_id,game_id,name,current_region_id,pos_x,pos_y,pos_z,activity_status,npc_code FROM characters WHERE id=? AND npc_code IS NULL LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [characterId]);
  return rows[0];
};

const assertActive = (character: CharacterRow) => {
  if (character.activity_status !== 'active') throw new Error(`【${character.name}】当前无法参与互动。`);
};

const assertSamePlace = (left: CharacterRow, right: CharacterRow) => {
  if (Number(left.current_region_id) !== Number(right.current_region_id) || Number(left.pos_x) !== Number(right.pos_x) || Number(left.pos_y) !== Number(right.pos_y) || Number(left.pos_z) !== Number(right.pos_z)) {
    throw new Error('对方不在你当前的位置，无法进行互动。');
  }
};

const churchAt = async (connection: PoolConnection, character: CharacterRow) => {
  const [rows] = await connection.execute<(RowDataPacket & { region_id: number; pos_x: number; pos_y: number; pos_z: number })[]>(`SELECT region_id,pos_x,pos_y,pos_z FROM map_npcs WHERE code='saint_church' LIMIT 1`);
  const church = rows[0];
  if (!church || Number(character.current_region_id) !== Number(church.region_id) || Number(character.pos_x) !== Number(church.pos_x) || Number(character.pos_y) !== Number(church.pos_y) || Number(character.pos_z) !== Number(church.pos_z)) throw new Error('请先与好友一同来到圣恩教堂。');
};

const relationshipFor = async (connection: PoolConnection, leftId: number, rightId: number, lock = false) => {
  const pair = pairOf(leftId, rightId);
  const [rows] = await connection.execute<RelationshipRow[]>(`SELECT * FROM player_relationships WHERE character_low_id=? AND character_high_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [pair.low, pair.high]);
  const relationship = rows[0];
  if (!relationship) return null;
  if (String(relationship.daily_date).slice(0, 10) !== businessDate()) {
    await connection.execute(`UPDATE player_relationships SET daily_date=?,daily_interactions=0,daily_gifts=0,daily_bouquet_count=0,daily_fruit_count=0,daily_ceremony_count=0 WHERE character_low_id=? AND character_high_id=?`, [businessDate(), pair.low, pair.high]);
    relationship.daily_date = businessDate(); relationship.daily_interactions = 0; relationship.daily_gifts = 0; relationship.daily_bouquet_count = 0; relationship.daily_fruit_count = 0; relationship.daily_ceremony_count = 0;
  }
  return relationship;
};

const eventFor = async (connection: PoolConnection, actor: CharacterRow, eventType: string, payload: Record<string, unknown>, target?: CharacterRow) => {
  await connection.execute('INSERT INTO player_events (player_id,event_type,payload) VALUES (?, ?, ?)', [actor.player_id, eventType, JSON.stringify({ ...payload, targetCharacterId: target?.id ?? null })]);
  if (target) await connection.execute('INSERT INTO player_events (player_id,event_type,payload) VALUES (?, ?, ?)', [target.player_id, eventType, JSON.stringify({ ...payload, actorCharacterId: actor.id })]);
};

const ensureFriend = (relationship: RelationshipRow | null) => {
  if (!relationship || (relationship.status !== 'friend' && relationship.status !== 'oath')) throw new Error('你们还不是游戏内好友。');
};

const socialPair = async (connection: PoolConnection, qqUserId: string, targetGameId: number, lockTarget = true) => {
  const actor = await characterFor(connection, qqUserId, true); const target = await targetFor(connection, targetGameId, lockTarget);
  if (!target) throw new Error('未找到这位玩家。');
  if (Number(actor.id) === Number(target.id)) throw new Error('不能对自己发起这项互动。');
  assertActive(actor); assertActive(target); assertSamePlace(actor, target);
  return { actor, target };
};

export const sendFriendRequest = (qqUserId: string, targetGameId: number) => withTransaction(async connection => {
  const { actor, target } = await socialPair(connection, qqUserId, targetGameId);
  const relationship = await relationshipFor(connection, actor.id, target.id);
  if (relationship && relationship.status !== 'ended') throw new Error('你们已经是好友，或已有进行中的星誓关系。');
  const [pending] = await connection.execute<RowDataPacket[]>(`SELECT id FROM player_friend_requests WHERE status='pending' AND expires_at>NOW()
    AND ((requester_character_id=? AND target_character_id=?) OR (requester_character_id=? AND target_character_id=?)) LIMIT 1`, [actor.id, target.id, target.id, actor.id]);
  if (pending[0]) throw new Error('你们之间已经有一条待处理的好友申请。');
  await connection.execute(`INSERT INTO player_friend_requests (requester_character_id,target_character_id,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL ? MINUTE))`, [actor.id, target.id, AFFINITY_REQUEST_TTL_MINUTES]);
  await eventFor(connection, actor, 'social.friend_request.created', { requestTarget: target.id }, target);
  return { targetName: target.name };
});

export const friendRequests = (qqUserId: string) => withTransaction(async connection => {
  const actor = await characterFor(connection, qqUserId, true);
  await connection.execute(`UPDATE player_friend_requests SET status='expired',responded_at=NOW() WHERE target_character_id=? AND status='pending' AND expires_at<=NOW()`, [actor.id]);
  const [rows] = await connection.execute<(RowDataPacket & { id: number; requester_character_id: number; name: string; game_id: number; created_at: Date; expires_at: Date })[]>(`SELECT r.id,r.requester_character_id,c.name,c.game_id,r.created_at,r.expires_at FROM player_friend_requests r JOIN characters c ON c.id=r.requester_character_id WHERE r.target_character_id=? AND r.status='pending' ORDER BY r.created_at DESC`, [actor.id]);
  return rows;
});

export const acceptFriendRequest = (qqUserId: string, requestId: number) => withTransaction(async connection => {
  const actor = await characterFor(connection, qqUserId, true);
  const [requests] = await connection.execute<(RowDataPacket & { id: number; requester_character_id: number; target_character_id: number; expires_at: Date })[]>(`SELECT id,requester_character_id,target_character_id,expires_at FROM player_friend_requests WHERE id=? AND target_character_id=? AND status='pending' FOR UPDATE`, [requestId, actor.id]);
  const request = requests[0]; if (!request) throw new Error('好友申请不存在或已处理。');
  if (new Date(request.expires_at).getTime() <= Date.now()) { await connection.execute(`UPDATE player_friend_requests SET status='expired',responded_at=NOW() WHERE id=?`, [requestId]); throw new Error('这条好友申请已经过期。'); }
  const requester = await characterById(connection, Number(request.requester_character_id), true); if (!requester) throw new Error('申请人角色已不存在。');
  assertActive(actor); assertActive(requester); assertSamePlace(actor, requester);
  const pair = pairOf(actor.id, requester.id); const existing = await relationshipFor(connection, actor.id, requester.id, true);
  if (!existing) await connection.execute(`INSERT INTO player_relationships (character_low_id,character_high_id,status,affinity,daily_date) VALUES (?,?, 'friend',0,?)`, [pair.low, pair.high, businessDate()]);
  else await connection.execute(`UPDATE player_relationships SET status='friend' WHERE character_low_id=? AND character_high_id=?`, [pair.low, pair.high]);
  await connection.execute(`UPDATE player_friend_requests SET status='accepted',responded_at=NOW() WHERE id=?`, [requestId]);
  await eventFor(connection, actor, 'social.friend.accepted', { requestId }, requester);
  return { name: requester.name };
});

export const rejectFriendRequest = (qqUserId: string, requestId: number) => withTransaction(async connection => {
  const actor = await characterFor(connection, qqUserId, true);
  const [result] = await connection.execute<any>(`UPDATE player_friend_requests SET status='rejected',responded_at=NOW() WHERE id=? AND target_character_id=? AND status='pending'`, [requestId, actor.id]);
  if (!Number(result.affectedRows)) throw new Error('好友申请不存在或已处理。');
  return true;
});

export const friendList = (qqUserId: string) => withTransaction(async connection => {
  const actor = await characterFor(connection, qqUserId);
  const [rows] = await connection.execute<(RowDataPacket & { status: 'friend' | 'oath'; affinity: number; daily_interactions: number; daily_gifts: number; name: string; game_id: number; other_id: number })[]>(`SELECT r.status,r.affinity,r.daily_interactions,r.daily_gifts,IF(r.character_low_id=?,ch.name,cl.name) AS name,IF(r.character_low_id=?,ch.game_id,cl.game_id) AS game_id,IF(r.character_low_id=?,r.character_high_id,r.character_low_id) AS other_id
    FROM player_relationships r JOIN characters cl ON cl.id=r.character_low_id JOIN characters ch ON ch.id=r.character_high_id WHERE (r.character_low_id=? OR r.character_high_id=?) AND r.status IN ('friend','oath') ORDER BY (r.status='oath') DESC,r.affinity DESC`, [actor.id, actor.id, actor.id, actor.id, actor.id]);
  return rows.map(row => ({ ...row, stage: relationshipDisplayStage(row.status, Number(row.affinity)) }));
});

const secondaryProfessionNames: Record<string, string> = { blacksmith: '锻造师', alchemist: '炼金师', deconstructor: '解构师', omniscient: '全知者' };

export const friendDetail = (qqUserId: string, targetGameId: number) => withTransaction(async connection => {
  const actor = await characterFor(connection, qqUserId, true); const target = await targetFor(connection, targetGameId);
  if (!target) throw new Error('未找到这位玩家。'); assertActive(actor); assertActive(target);
  const relationship = await relationshipFor(connection, actor.id, target.id); ensureFriend(relationship);
  const [profiles] = await connection.execute<(RowDataPacket & { level: number; adventurer_rank: string; profession_name: string | null; secondary_profession_code: string | null; secondary_level: number | null })[]>(`SELECT c.level,c.adventurer_rank,p.name AS profession_name,c.secondary_profession_code,sp.level AS secondary_level FROM characters c LEFT JOIN profession_definitions p ON p.code=c.profession_code LEFT JOIN player_secondary_professions sp ON sp.character_id=c.id AND sp.profession_code=c.secondary_profession_code WHERE c.id=? LIMIT 1`, [target.id]);
  const profile = profiles[0];
  const [skills] = await connection.execute<(RowDataPacket & { name: string; level: number; category: string })[]>(`SELECT s.name,ps.level,s.category FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? ORDER BY ps.quick_slot IS NULL,ps.quick_slot,ps.learned_at,s.id LIMIT 8`, [target.id]);
  const secondaryCode = profile?.secondary_profession_code ?? null;
  return { name: target.name, gameId: target.game_id, level: Number(profile?.level ?? 1), rank: profile?.adventurer_rank ?? 'F', profession: profile?.profession_name ?? '未选择', secondaryProfession: secondaryCode ? (secondaryProfessionNames[secondaryCode] ?? secondaryCode) : '未选择', secondaryLevel: secondaryCode ? Math.max(1, Number(profile?.secondary_level ?? 1)) : null, skills: skills.map(skill => ({ name: skill.name, level: Number(skill.level), category: skill.category })) };
});

export const recordFriendInteraction = async (connection: PoolConnection, actorId: number, targetId: number) => {
  const relationship = await relationshipFor(connection, actorId, targetId, true);
  if (!relationship || (relationship.status !== 'friend' && relationship.status !== 'oath')) return null;
  if (Number(relationship!.daily_interactions) >= FRIEND_INTERACTION_DAILY_LIMIT) return { changed: false, affinity: Number(relationship!.affinity), dailyInteractions: FRIEND_INTERACTION_DAILY_LIMIT, stage: relationshipStage(Number(relationship!.affinity)) };
  const pair = pairOf(actorId, targetId); await connection.execute(`UPDATE player_relationships SET affinity=affinity+5,daily_interactions=daily_interactions+1 WHERE character_low_id=? AND character_high_id=?`, [pair.low, pair.high]);
  return { changed: true, affinity: Number(relationship!.affinity) + 5, dailyInteractions: Number(relationship!.daily_interactions) + 1, stage: relationshipStage(Number(relationship!.affinity) + 5) };
};

export const interactFriend = (qqUserId: string, targetGameId: number) => withTransaction(async connection => {
  const { actor, target } = await socialPair(connection, qqUserId, targetGameId); const result = await recordFriendInteraction(connection, actor.id, target.id);
  if (!result) throw new Error('你们还不是游戏内好友。');
  if (result.changed) await eventFor(connection, actor, 'social.friend_interaction', { affinity: 5 }, target);
  return { ...result, targetName: target.name };
});

const giftCodeFor = async (connection: PoolConnection, item: string | number) => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; quantity: number; playerAffinity: number })[]>(`SELECT i.id,i.code,i.name,pi.quantity,CAST(JSON_UNQUOTE(JSON_EXTRACT(i.effect_json,'$.playerAffinity')) AS UNSIGNED) AS playerAffinity FROM item_definitions i JOIN player_inventory pi ON pi.item_id=i.id WHERE ${typeof item === 'number' ? 'i.id=?' : 'i.code=?'} AND i.code IN ('heart_bouquet','resonance_fruit') LIMIT 1 FOR UPDATE`, [item]);
  return rows[0];
};

export const giveAffinityGift = (qqUserId: string, targetGameId: number, item: string | number) => withTransaction(async connection => {
  const { actor, target } = await socialPair(connection, qqUserId, targetGameId); const relationship = await relationshipFor(connection, actor.id, target.id, true); ensureFriend(relationship);
  const gift = await giftCodeFor(connection, item); if (!gift || Number(gift.quantity) < 1) throw new Error('背包中没有这件可赠礼道具。');
  const isBouquet = gift.code === 'heart_bouquet'; const count = Number(isBouquet ? relationship!.daily_bouquet_count : relationship!.daily_fruit_count);
  if (Number(relationship!.daily_gifts) >= FRIEND_GIFT_DAILY_LIMIT) throw new Error('今天的赠礼次数已用完。');
  if (isBouquet && count >= BOUQUET_DAILY_LIMIT) throw new Error('今天的心意花束赠礼次数已用完。');
  if (!isBouquet && count >= FRUIT_DAILY_LIMIT) throw new Error('今天的共鸣果实赠礼次数已用完。');
  await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id=? AND quantity>0', [actor.id, gift.id]);
  const pair = pairOf(actor.id, target.id); await connection.execute(`UPDATE player_relationships SET affinity=affinity+?,daily_gifts=daily_gifts+1,${isBouquet ? 'daily_bouquet_count' : 'daily_fruit_count'}=${isBouquet ? 'daily_bouquet_count' : 'daily_fruit_count'}+1 WHERE character_low_id=? AND character_high_id=?`, [Number(gift.playerAffinity), pair.low, pair.high]);
  const affinity = Number(relationship!.affinity) + Number(gift.playerAffinity); await eventFor(connection, actor, 'social.affinity_gift', { itemCode: gift.code, affinity: Number(gift.playerAffinity) }, target);
  return { targetName: target.name, itemName: gift.name, affinity, gain: Number(gift.playerAffinity), stage: relationshipStage(affinity), dailyGifts: Number(relationship!.daily_gifts) + 1 };
});

const oathRequestFor = async (connection: PoolConnection, id: number, targetId: number) => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number; proposer_character_id: number; target_character_id: number; expires_at: Date })[]>(`SELECT id,proposer_character_id,target_character_id,expires_at FROM player_oath_requests WHERE id=? AND target_character_id=? AND status='pending' FOR UPDATE`, [id, targetId]);
  return rows[0];
};

export const oathStatus = (qqUserId: string) => withTransaction(async connection => {
  const actor = await characterFor(connection, qqUserId);
  const [rows] = await connection.execute<(RowDataPacket & { id: number; status: string; affinity: number; name: string; game_id: number; ceremony_at: Date | null })[]>(`SELECT o.id,o.status,r.affinity,IF(r.character_low_id=?,ch.name,cl.name) AS name,IF(r.character_low_id=?,ch.game_id,cl.game_id) AS game_id,o.ceremony_at FROM player_oaths o JOIN player_relationships r ON r.character_low_id=o.character_low_id AND r.character_high_id=o.character_high_id JOIN characters cl ON cl.id=r.character_low_id JOIN characters ch ON ch.id=r.character_high_id WHERE (o.character_low_id=? OR o.character_high_id=?) AND o.status IN ('ceremony_pending','active','release_pending') LIMIT 1`, [actor.id, actor.id, actor.id, actor.id]);
  const relation = rows[0]; return relation ? { ...relation, affinity: Number(relation.affinity), stage: relationshipStage(Number(relation.affinity)) } : null;
});

export const requestOath = (qqUserId: string, targetGameId: number) => withTransaction(async connection => {
  const { actor, target } = await socialPair(connection, qqUserId, targetGameId); await churchAt(connection, actor); await churchAt(connection, target);
  const relationship = await relationshipFor(connection, actor.id, target.id, true); ensureFriend(relationship);
  if (Number(relationship!.affinity) < OATH_MIN_AFFINITY) throw new Error(`好感还需要 ${OATH_MIN_AFFINITY - Number(relationship!.affinity)} 点，才能在教堂开启星誓。`);
  const [active] = await connection.execute<RowDataPacket[]>(`SELECT id FROM player_oaths WHERE (character_low_id IN (?,?) OR character_high_id IN (?,?)) AND status IN ('ceremony_pending','active','release_pending') LIMIT 1`, [actor.id, target.id, actor.id, target.id]);
  if (active[0]) throw new Error('你或好友已经处于星誓关系中。');
  const [pending] = await connection.execute<RowDataPacket[]>(`SELECT id FROM player_oath_requests WHERE status='pending' AND expires_at>NOW() AND ((proposer_character_id=? AND target_character_id=?) OR (proposer_character_id=? AND target_character_id=?)) LIMIT 1`, [actor.id, target.id, target.id, actor.id]);
  if (pending[0]) throw new Error('你们之间已经有一条待处理的星誓申请。');
  await connection.execute(`INSERT INTO player_oath_requests (proposer_character_id,target_character_id,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL ? MINUTE))`, [actor.id, target.id, OATH_REQUEST_TTL_MINUTES]);
  return { targetName: target.name };
});

export const oathRequests = (qqUserId: string) => withTransaction(async connection => {
  const actor = await characterFor(connection, qqUserId, true); await connection.execute(`UPDATE player_oath_requests SET status='expired',responded_at=NOW() WHERE target_character_id=? AND status='pending' AND expires_at<=NOW()`, [actor.id]);
  const [rows] = await connection.execute<(RowDataPacket & { id: number; name: string; game_id: number; affinity: number; expires_at: Date })[]>(`SELECT q.id,c.name,c.game_id,r.affinity,q.expires_at FROM player_oath_requests q JOIN characters c ON c.id=q.proposer_character_id JOIN player_relationships r ON r.character_low_id=LEAST(q.proposer_character_id,q.target_character_id) AND r.character_high_id=GREATEST(q.proposer_character_id,q.target_character_id) WHERE q.target_character_id=? AND q.status='pending'`, [actor.id]);
  return rows.map(row => ({ ...row, affinity: Number(row.affinity), stage: relationshipStage(Number(row.affinity)) }));
});

export const rejectOath = (qqUserId: string, requestId: number) => withTransaction(async connection => {
  const actor = await characterFor(connection, qqUserId, true); const [result] = await connection.execute<any>(`UPDATE player_oath_requests SET status='rejected',responded_at=NOW() WHERE id=? AND target_character_id=? AND status='pending'`, [requestId, actor.id]);
  if (!Number(result.affectedRows)) throw new Error('星誓申请不存在或已处理。'); return true;
});

export const acceptOath = (qqUserId: string, requestId: number) => withTransaction(async connection => {
  const actor = await characterFor(connection, qqUserId, true); const request = await oathRequestFor(connection, requestId, actor.id);
  if (!request) throw new Error('星誓申请不存在或已处理。'); if (new Date(request.expires_at).getTime() <= Date.now()) { await connection.execute(`UPDATE player_oath_requests SET status='expired',responded_at=NOW() WHERE id=?`, [requestId]); throw new Error('这条星誓申请已经过期。'); }
  const proposer = await characterById(connection, Number(request.proposer_character_id), true); if (!proposer) throw new Error('申请人角色已不存在。'); assertActive(actor); assertActive(proposer);
  const relationship = await relationshipFor(connection, actor.id, proposer.id, true); ensureFriend(relationship); if (Number(relationship!.affinity) < OATH_MIN_AFFINITY) throw new Error('当前好感不足以开启星誓。');
  const [active] = await connection.execute<RowDataPacket[]>(`SELECT id FROM player_oaths WHERE (character_low_id IN (?,?) OR character_high_id IN (?,?)) AND status IN ('ceremony_pending','active','release_pending') LIMIT 1`, [actor.id, proposer.id, actor.id, proposer.id]); if (active[0]) throw new Error('你或好友已经处于星誓关系中。');
  const pair = pairOf(actor.id, proposer.id); await connection.execute(`INSERT INTO player_oaths (character_low_id,character_high_id,initiator_character_id,status,ceremony_at) VALUES (?,?,?,'ceremony_pending',NULL) ON DUPLICATE KEY UPDATE initiator_character_id=VALUES(initiator_character_id),status='ceremony_pending',ceremony_at=NULL,released_at=NULL`, [pair.low, pair.high, proposer.id]);
  await connection.execute(`UPDATE player_oath_requests SET status='accepted',responded_at=NOW() WHERE id=?`, [requestId]);
  await eventFor(connection, actor, 'social.oath.ceremony_pending', { requestId }, proposer); return { partnerName: proposer.name, affinity: Number(relationship!.affinity), stage: relationshipStage(Number(relationship!.affinity)) };
});

export const startOathCeremony = (qqUserId: string) => withTransaction(async connection => {
  const actor = await characterFor(connection, qqUserId, true);
  const [rows] = await connection.execute<(RowDataPacket & { id: number; character_low_id: number; character_high_id: number })[]>(`SELECT id,character_low_id,character_high_id FROM player_oaths WHERE (character_low_id=? OR character_high_id=?) AND status='ceremony_pending' LIMIT 1 FOR UPDATE`, [actor.id, actor.id]);
  const oath = rows[0]; if (!oath) throw new Error('当前没有等待举行的星誓仪式。');
  const partnerId = Number(oath.character_low_id) === Number(actor.id) ? Number(oath.character_high_id) : Number(oath.character_low_id);
  const partner = await characterById(connection, partnerId, true); if (!partner) throw new Error('同行者角色已不存在。');
  assertActive(actor); assertActive(partner); assertSamePlace(actor, partner); await churchAt(connection, actor); await churchAt(connection, partner);
  const relationship = await relationshipFor(connection, actor.id, partner.id, true); ensureFriend(relationship);
  if (Number(relationship!.affinity) < OATH_MIN_AFFINITY) throw new Error('当前好感不足以举行星誓仪式。');
  const [rings] = await connection.execute<(RowDataPacket & { character_id: number; quantity: number })[]>(`SELECT pi.character_id,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id IN (?,?) AND i.code='star_oath_ring' FOR UPDATE`, [actor.id, partner.id]);
  const ringOwners = new Set(rings.filter(row => Number(row.quantity) > 0).map(row => Number(row.character_id)));
  if (!ringOwners.has(Number(actor.id)) || !ringOwners.has(Number(partner.id))) throw new Error('你们各自都需要准备一枚星誓之环。');
  for (const id of [actor.id, partner.id]) await connection.execute(`UPDATE player_inventory pi JOIN item_definitions i ON i.id=pi.item_id SET pi.quantity=pi.quantity-1 WHERE pi.character_id=? AND i.code='star_oath_ring' AND pi.quantity>0`, [id]);
  const pair = pairOf(actor.id, partner.id); await connection.execute(`UPDATE player_oaths SET status='active',ceremony_at=NOW(),released_at=NULL WHERE id=? AND status='ceremony_pending'`, [oath.id]);
  await connection.execute(`UPDATE player_relationships SET status='oath' WHERE character_low_id=? AND character_high_id=?`, [pair.low, pair.high]);
  await eventFor(connection, actor, 'social.oath.started', { oathId: oath.id }, partner);
  return { actorName: actor.name, partnerName: partner.name, affinity: Number(relationship!.affinity), stage: relationshipStage(Number(relationship!.affinity)) };
});

export const recordOathMemory = (qqUserId: string) => withTransaction(async connection => {
  const actor = await characterFor(connection, qqUserId, true); const status = await oathStatusFor(connection, actor.id, true); if (!status) throw new Error('你当前没有有效的星誓关系。');
  const partner = await characterById(connection, status.partnerId, true); if (!partner) throw new Error('好友角色已不存在。'); assertActive(actor); assertActive(partner); assertSamePlace(actor, partner); await churchAt(connection, actor); await churchAt(connection, partner);
  const relationship = await relationshipFor(connection, actor.id, partner.id, true); ensureFriend(relationship); if (Number(relationship!.daily_ceremony_count) >= OATH_MEMORY_DAILY_LIMIT) throw new Error('今天已经记录过教堂纪念。');
  const pair = pairOf(actor.id, partner.id); await connection.execute(`UPDATE player_relationships SET affinity=affinity+10,daily_ceremony_count=daily_ceremony_count+1 WHERE character_low_id=? AND character_high_id=?`, [pair.low, pair.high]);
  const affinity = Number(relationship!.affinity) + 10; await eventFor(connection, actor, 'social.oath.memory', { affinity: 10 }, partner); return { partnerName: partner.name, affinity, stage: relationshipStage(affinity) };
});

const oathStatusFor = async (connection: PoolConnection, characterId: number, lock = false) => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number; character_low_id: number; character_high_id: number; status: string })[]>(`SELECT id,character_low_id,character_high_id,status FROM player_oaths WHERE (character_low_id=? OR character_high_id=?) AND status IN ('active','release_pending') LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [characterId, characterId]);
  const row = rows[0]; if (!row) return null; return { ...row, partnerId: Number(row.character_low_id) === characterId ? Number(row.character_high_id) : Number(row.character_low_id) };
};

export const requestOathRelease = (qqUserId: string) => withTransaction(async connection => {
  const actor = await characterFor(connection, qqUserId, true); const oath = await oathStatusFor(connection, actor.id, true); if (!oath) throw new Error('你当前没有有效的星誓关系。');
  const partner = await characterById(connection, oath.partnerId, true); if (!partner) throw new Error('好友角色已不存在。');
  const [pending] = await connection.execute<RowDataPacket[]>(`SELECT id FROM player_oath_release_requests WHERE oath_id=? AND status='pending' AND expires_at>NOW() LIMIT 1`, [oath.id]); if (pending[0]) throw new Error('已经有一条待处理的解除申请。');
  await connection.execute(`INSERT INTO player_oath_release_requests (oath_id,requester_character_id,target_character_id,expires_at) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL ? MINUTE))`, [oath.id, actor.id, partner.id, OATH_REQUEST_TTL_MINUTES]);
  await connection.execute(`UPDATE player_oaths SET status='release_pending' WHERE id=? AND status='active'`, [oath.id]);
  await eventFor(connection, actor, 'social.oath.release_requested', {}, partner); return { partnerName: partner.name };
});

export const acceptOathRelease = (qqUserId: string, requestId: number) => withTransaction(async connection => {
  const actor = await characterFor(connection, qqUserId, true);
  const [requests] = await connection.execute<(RowDataPacket & { id: number; oath_id: number; requester_character_id: number; target_character_id: number; expires_at: Date })[]>(`SELECT id,oath_id,requester_character_id,target_character_id,expires_at FROM player_oath_release_requests WHERE id=? AND target_character_id=? AND status='pending' FOR UPDATE`, [requestId, actor.id]);
  const request = requests[0]; if (!request) throw new Error('解除申请不存在或已处理。'); if (new Date(request.expires_at).getTime() <= Date.now()) { await connection.execute(`UPDATE player_oath_release_requests SET status='expired',responded_at=NOW() WHERE id=?`, [requestId]); throw new Error('这条解除申请已经过期。'); }
  const proposer = await characterById(connection, Number(request.requester_character_id), true); if (!proposer) throw new Error('申请人角色已不存在。'); const oath = await oathStatusFor(connection, actor.id, true); if (!oath || Number(oath.id) !== Number(request.oath_id)) throw new Error('当前星誓状态已经发生变化。');
  const pair = pairOf(actor.id, proposer.id); await connection.execute(`UPDATE player_oaths SET status='released',released_at=NOW() WHERE id=? AND status IN ('active','release_pending')`, [request.oath_id]); await connection.execute(`UPDATE player_relationships SET status='friend' WHERE character_low_id=? AND character_high_id=?`, [pair.low, pair.high]); await connection.execute(`UPDATE player_oath_release_requests SET status='accepted',responded_at=NOW() WHERE id=?`, [requestId]); await eventFor(connection, actor, 'social.oath.released', {}, proposer);
  return { partnerName: proposer.name };
});

export const rejectOathRelease = (qqUserId: string, requestId: number) => withTransaction(async connection => {
  const actor = await characterFor(connection, qqUserId, true);
  const [rows] = await connection.execute<(RowDataPacket & { id: number; oath_id: number; requester_character_id: number; expires_at: Date })[]>(`SELECT id,oath_id,requester_character_id,expires_at FROM player_oath_release_requests WHERE id=? AND target_character_id=? AND status='pending' FOR UPDATE`, [requestId, actor.id]);
  const request = rows[0]; if (!request) throw new Error('解除申请不存在或已处理。');
  if (new Date(request.expires_at).getTime() <= Date.now()) { await connection.execute(`UPDATE player_oath_release_requests SET status='expired',responded_at=NOW() WHERE id=?`, [requestId]); await connection.execute(`UPDATE player_oaths SET status='active' WHERE id=? AND status='release_pending'`, [request.oath_id]); throw new Error('这条解除申请已经过期。'); }
  const proposer = await characterById(connection, Number(request.requester_character_id), true); if (!proposer) throw new Error('申请人角色已不存在。');
  await connection.execute(`UPDATE player_oath_release_requests SET status='rejected',responded_at=NOW() WHERE id=?`, [requestId]);
  await connection.execute(`UPDATE player_oaths SET status='active' WHERE id=? AND status='release_pending'`, [request.oath_id]);
  await eventFor(connection, actor, 'social.oath.release_rejected', {}, proposer);
  return { partnerName: proposer.name };
});

export const oathReleaseRequests = (qqUserId: string) => withTransaction(async connection => {
  const actor = await characterFor(connection, qqUserId, true);
  await connection.execute(`UPDATE player_oath_release_requests SET status='expired',responded_at=NOW() WHERE target_character_id=? AND status='pending' AND expires_at<=NOW()`, [actor.id]);
  const [rows] = await connection.execute<(RowDataPacket & { id: number; name: string; game_id: number; expires_at: Date })[]>(`SELECT q.id,c.name,c.game_id,q.expires_at FROM player_oath_release_requests q JOIN characters c ON c.id=q.requester_character_id WHERE q.target_character_id=? AND q.status='pending' ORDER BY q.created_at DESC`, [actor.id]);
  return rows;
});
