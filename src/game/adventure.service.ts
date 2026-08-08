import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';

type CharacterRow = RowDataPacket & { id: number; name: string; level: number; experience: number; hp_max: number; mp_max: number; physical_attack: number; magic_attack: number; physical_defense: number; magic_defense: number; speed: number; perception: number; spirit: number; intelligence: number; current_region_id: number; pos_x: number; pos_y: number; pos_z: number; region_name: string };
type SpawnRow = RowDataPacket & { id: number; name: string; monster_class: string; level: number; current_hp: number; hp_max: number; attack: number; defense: number; speed: number; perception: number; charisma: number; experience: number; drops_json: string | null; skill_sequence?: string | null };
const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const random = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const characterFor = async (qqUserId: string): Promise<CharacterRow> => {
  const [rows] = await (await getPool()).execute<CharacterRow[]>(`SELECT c.*, r.name AS region_name FROM characters c JOIN players p ON p.id=c.player_id JOIN map_regions r ON r.id=c.current_region_id WHERE p.qq_user_id=? LIMIT 1`, [qqUserId]);
  if (!rows[0]) throw new Error('请先发送“注册”创建角色。');
  return rows[0];
};

export const spawnMonsters = async () => {
  const pool = await getPool();
  const [regions] = await pool.execute<(RowDataPacket & { id: number; min_x: number; max_x: number; min_y: number; max_y: number; min_z: number; max_z: number })[]>('SELECT id,min_x,max_x,min_y,max_y,min_z,max_z FROM map_regions WHERE is_spawn_enabled=1');
  const [templates] = await pool.execute<(RowDataPacket & { id: number; hp_max: number; monster_class: string })[]>('SELECT id,hp_max,monster_class FROM monster_templates');
  for (const region of regions) {
    const [countRows] = await pool.execute<(RowDataPacket & { total: number })[]>('SELECT COUNT(*) AS total FROM monster_spawns WHERE region_id=? AND defeated_at IS NULL', [region.id]);
    for (let i = Number(countRows[0].total); i < 6; i++) {
      const template = Math.random() < 0.16 ? templates.find(item => item.monster_class === 'elite') ?? templates[0] : pick(templates.filter(item => item.monster_class === 'normal'));
      await pool.execute('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,current_hp) VALUES (?,?,?,?,?,?)', [template.id, region.id, random(region.min_x, region.max_x), random(region.min_y, region.max_y), random(region.min_z, region.max_z), template.hp_max]);
    }
  }
};

export const inventory = async (qqUserId: string) => {
  const character = await characterFor(qqUserId);
  const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { name: string; quantity: number; weight: number; quick_slot: number | null })[]>(`SELECT i.name, pi.quantity, i.weight, qi.quick_slot FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id LEFT JOIN player_quick_items qi ON qi.character_id=pi.character_id AND qi.item_id=pi.item_id WHERE pi.character_id=? ORDER BY i.name`, [character.id]);
  const weight = rows.reduce((sum, item) => sum + Number(item.quantity) * Number(item.weight), 0);
  const speedPenalty = Math.floor(weight / 5) * 2;
  return { items: rows, weight, capacity: 30, speed: Math.max(1, Number(character.speed) - speedPenalty), speedPenalty };
};

export const explore = async (qqUserId: string) => {
  const character = await characterFor(qqUserId);
  const pool = await getPool();
  const [spawns] = await pool.execute<SpawnRow[]>(`SELECT s.id,t.name,t.monster_class,t.level,s.current_hp,t.hp_max,t.attack,t.defense,t.speed,t.perception,t.charisma,t.experience,t.drops_json FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? AND s.defeated_at IS NULL`, [character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  if (!spawns.length) return { character, spawns, text: '四周只有风吹树叶的声音。这里暂时没有敌对生物。' };
  const charm = Math.floor((Number(character.spirit) + Number(character.intelligence)) / 2);
  const text = `你发现 ${spawns.map(s => `#${s.id} ${s.name} Lv.${s.level}`).join('、')}。\n\n感知 ${character.perception}｜负重后速度 ${character.speed}｜魅力 ${charm}\n感知与速度高于敌人时可偷袭；感知较高可尝试躲避；魅力较高可交涉。`;
  return { character, spawns, text };
};

export const move = async (qqUserId: string, direction: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [partyRows] = await connection.execute<(RowDataPacket & { leader_character_id: number })[]>('SELECT p.leader_character_id FROM party_members pm JOIN parties p ON p.id=pm.party_id WHERE pm.character_id=?', [character.id]);
  if (partyRows[0] && Number(partyRows[0].leader_character_id) !== character.id) throw new Error('组队状态下仅队长可以移动。');
  const delta: Record<string, [number, number]> = { 上: [0, 1], 下: [0, -1], 左: [-1, 0], 右: [1, 0] };
  if (!delta[direction]) throw new Error('方向只能是 上、下、左、右。');
  const x = Number(character.pos_x) + delta[direction][0]; const y = Number(character.pos_y) + delta[direction][1];
  const [regionRows] = await connection.execute<(RowDataPacket & { min_x: number; max_x: number; min_y: number; max_y: number })[]>('SELECT min_x,max_x,min_y,max_y FROM map_regions WHERE id=?', [character.current_region_id]);
  const region = regionRows[0]; if (x < region.min_x || x > region.max_x || y < region.min_y || y > region.max_y) throw new Error('前方超出当前地图区域边界。');
  if (partyRows[0]) await connection.execute('UPDATE characters c JOIN party_members pm ON pm.character_id=c.id SET c.pos_x=?,c.pos_y=? WHERE pm.party_id=(SELECT party_id FROM party_members WHERE character_id=? LIMIT 1)', [x, y, character.id]);
  else await connection.execute('UPDATE characters SET pos_x=?,pos_y=? WHERE id=?', [x, y, character.id]);
  return { ...character, pos_x: x, pos_y: y };
});

export const chooseTarget = async (qqUserId: string, spawnId: number) => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [spawns] = await connection.execute<SpawnRow[]>(`SELECT s.id,t.name,t.monster_class,t.level,s.current_hp,t.hp_max,t.attack,t.defense,t.speed,t.perception,t.charisma,t.experience,t.drops_json FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id WHERE s.id=? AND s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.pos_z=? AND s.defeated_at IS NULL FOR UPDATE`, [spawnId, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  const spawn = spawns[0]; if (!spawn) throw new Error('目标已离开当前位置或已被击败。');
  const [old] = await connection.execute<RowDataPacket[]>('SELECT id FROM combat_sessions WHERE character_id=? AND state=\'active\' FOR UPDATE', [character.id]);
  if (old.length) throw new Error('你正在战斗中，请先结束当前战斗。');
  const id = randomUUID();
  await connection.execute('INSERT INTO combat_sessions (id,character_id,spawn_id,player_hp,player_mp,cooldowns) VALUES (?,?,?,?,?,JSON_OBJECT())', [id, character.id, spawn.id, character.hp_max, character.mp_max]);
  return { character, spawn, playerHp: Number(character.hp_max), playerMp: Number(character.mp_max) };
});

export const encounterAction = async (qqUserId: string, spawnId: number, action: 'sneak' | 'avoid' | 'persuade') => {
  const found = await explore(qqUserId);
  const spawn = found.spawns.find(item => item.id === spawnId);
  if (!spawn) throw new Error('该目标不在当前位置。');
  const carry = await inventory(qqUserId);
  const charm = Math.floor((Number(found.character.spirit) + Number(found.character.intelligence)) / 2);
  if (action === 'avoid') {
    if (Number(found.character.perception) + random(1, 20) >= Number(spawn.perception)) return '你借助感知绕开了敌人，没有进入战斗。';
    const started = await chooseTarget(qqUserId, spawnId); return `躲避失败！\n目标：${started.spawn.name}\n进入战斗：/攻击｜/技能 1-4｜/道具 1-4｜/逃跑`;
  }
  if (action === 'persuade') {
    if (charm + random(1, 20) >= Number(spawn.charisma) + 12) return `你以诚意打动了 ${spawn.name}。它暂时退去，未发生战斗。`;
    const started = await chooseTarget(qqUserId, spawnId); return `交涉失败！${started.spawn.name} 露出敌意。\n进入战斗：/攻击｜/技能 1-4｜/道具 1-4｜/逃跑`;
  }
  const started = await chooseTarget(qqUserId, spawnId);
  if (Number(found.character.perception) + carry.speed >= Number(spawn.perception) + Number(spawn.speed)) {
    const pool = await getPool(); const damage = Math.max(1, Number(found.character.physical_attack) - Number(spawn.defense));
    await pool.execute('UPDATE monster_spawns SET current_hp=GREATEST(1,current_hp-?) WHERE id=?', [damage, spawnId]);
    return `偷袭成功！你率先造成 ${damage} 点伤害。\n进入战斗：/攻击｜/技能 1-4｜/道具 1-4｜/逃跑`;
  }
  return `偷袭失败，${started.spawn.name} 已察觉你。\n进入战斗：/攻击｜/技能 1-4｜/道具 1-4｜/逃跑`;
};

const combatRow = async (qqUserId: string) => {
  const character = await characterFor(qqUserId);
  const [rows] = await (await getPool()).execute<(RowDataPacket & SpawnRow & { combat_id: string; player_hp: number; player_mp: number; cooldowns: string; turn_no: number })[]>(`SELECT cs.id AS combat_id,cs.player_hp,cs.player_mp,cs.cooldowns,cs.turn_no,s.id,t.name,t.monster_class,t.level,s.current_hp,t.hp_max,t.attack,t.defense,t.speed,t.perception,t.charisma,t.experience,t.drops_json,t.skill_sequence FROM combat_sessions cs JOIN monster_spawns s ON s.id=cs.spawn_id JOIN monster_templates t ON t.id=s.template_id WHERE cs.character_id=? AND cs.state='active'`, [character.id]);
  if (!rows[0]) throw new Error('当前不在战斗中。请先使用 /探索 发现敌人。');
  return { character, combat: rows[0] };
};

const finishVictory = async (connection: PoolConnection, character: CharacterRow, combat: any) => {
  await connection.execute('UPDATE monster_spawns SET defeated_at=NOW(),current_hp=0 WHERE id=?', [combat.id]);
  await connection.execute('UPDATE combat_sessions SET state=\'victory\' WHERE combat_sessions.id=?', [combat.combat_id]);
  await connection.execute('UPDATE characters SET experience=experience+? WHERE id=?', [combat.experience, character.id]);
  const drops = combat.drops_json ? JSON.parse(combat.drops_json) : [];
  const rewards: string[] = [];
  for (const drop of drops) if (Math.random() <= Number(drop.chance ?? 1)) {
    const [items] = await connection.execute<(RowDataPacket & { id: number; name: string })[]>('SELECT id,name FROM item_definitions WHERE code=?', [drop.code]);
    if (items[0]) { await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)', [character.id, items[0].id, drop.quantity ?? 1]); rewards.push(`${items[0].name}×${drop.quantity ?? 1}`); }
  }
  return `胜利！获得经验 ${combat.experience}${rewards.length ? `，掉落 ${rewards.join('、')}` : ''}。`;
};

export const combatAction = async (qqUserId: string, action: 'attack' | 'skill' | 'item' | 'escape', slot?: number) => withTransaction(async connection => {
  const { character, combat } = await combatRow(qqUserId);
  const [locked] = await connection.execute<(RowDataPacket & { player_hp: number; player_mp: number; current_hp: number; cooldowns: string })[]>('SELECT cs.player_hp,cs.player_mp,s.current_hp,cs.cooldowns FROM combat_sessions cs JOIN monster_spawns s ON s.id=cs.spawn_id WHERE cs.id=? FOR UPDATE', [combat.combat_id]);
  if (!locked[0]) throw new Error('战斗状态已失效。');
  combat.player_hp = Number(locked[0].player_hp); combat.player_mp = Number(locked[0].player_mp); combat.current_hp = Number(locked[0].current_hp);
  let log = ''; let damage = 0;
  const carry = await inventory(qqUserId); const playerSpeed = carry.speed;
  if (action === 'escape') {
    if (playerSpeed + Number(character.perception) >= Number(combat.speed) + Number(combat.perception) + random(0, 30)) { await connection.execute('UPDATE combat_sessions SET state=\'escaped\' WHERE id=?', [combat.combat_id]); return { log: '你抓住空隙撤离了战斗。', ended: true }; }
    log = '撤离失败，敌人堵住了去路！';
  } else if (action === 'item') {
    if (!slot) throw new Error('请选择道具快捷栏。');
    const [items] = await connection.execute<(RowDataPacket & { item_id: number; quantity: number; name: string; effect_json: string })[]>('SELECT pi.item_id,pi.quantity,i.name,i.effect_json FROM player_quick_items qi JOIN player_inventory pi ON pi.character_id=qi.character_id AND pi.item_id=qi.item_id JOIN item_definitions i ON i.id=pi.item_id WHERE qi.character_id=? AND qi.quick_slot=?', [character.id, slot]);
    if (!items[0] || !items[0].quantity) throw new Error('该道具快捷栏为空。');
    const effect = JSON.parse(items[0].effect_json ?? '{}'); combat.player_hp = Math.min(Number(character.hp_max), combat.player_hp + Number(effect.heal ?? 0));
    await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id=?', [character.id, items[0].item_id]); log = `使用 ${items[0].name}，恢复 ${effect.heal ?? 0} 点生命。`;
  } else {
    if (action === 'skill') {
      if (!slot) throw new Error('请选择技能快捷栏。');
      const [skills] = await connection.execute<(RowDataPacket & { name: string; category: string; mana_cost: number; power: number; cooldown_turns: number })[]>('SELECT s.name,s.category,s.mana_cost,s.power,s.cooldown_turns FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.quick_slot=?', [character.id, slot]);
      const skill = skills[0]; if (!skill) throw new Error('该技能快捷栏为空。'); if (combat.player_mp < skill.mana_cost) throw new Error('魔力不足。');
      combat.player_mp -= Number(skill.mana_cost); damage = Math.max(1, Math.floor(((skill.category === 'magic' ? Number(character.magic_attack) : Number(character.physical_attack)) * Number(skill.power) / 100) - Number(combat.defense))); log = `施放 ${skill.name}，造成 ${damage} 点伤害。`;
    } else { damage = Math.max(1, Number(character.physical_attack) - Number(combat.defense)); log = `发动普攻，造成 ${damage} 点伤害。`; }
    combat.current_hp -= damage;
  }
  if (combat.current_hp <= 0) { const victory = await finishVictory(connection, character, combat); return { log: `${log}\n${victory}`, ended: true }; }
  const sequence = combat.skill_sequence ? JSON.parse(combat.skill_sequence) : [];
  const monsterSkill = sequence.length ? String(sequence[(Number(combat.turn_no) - 1) % sequence.length]) : '攻击';
  const multiplier = monsterSkill === 'howl' ? 0.7 : monsterSkill === 'bite' ? 1.25 : 1;
  const monsterDamage = Math.max(1, Math.floor((Number(combat.attack) - Number(character.physical_defense)) * multiplier)); combat.player_hp -= monsterDamage; log += `\n${combat.name} 使用「${monsterSkill}」，造成 ${monsterDamage} 点伤害。`;
  if (combat.player_hp <= 0) { await connection.execute('UPDATE combat_sessions SET state=\'defeat\' WHERE id=?', [combat.combat_id]); await connection.execute('UPDATE characters SET experience=GREATEST(0,experience-10) WHERE id=?', [character.id]); return { log: `${log}\n你战败了，损失 10 点经验并被送回区域边缘。`, ended: true }; }
  await connection.execute('UPDATE monster_spawns SET current_hp=? WHERE id=?', [combat.current_hp, combat.id]);
  await connection.execute('UPDATE combat_sessions SET player_hp=?,player_mp=?,turn_no=turn_no+1 WHERE id=?', [combat.player_hp, combat.player_mp, combat.combat_id]);
  return { log: `${log}\n\n你 HP ${combat.player_hp}/${character.hp_max}｜MP ${combat.player_mp}/${character.mp_max}\n敌方 HP ${combat.current_hp}/${combat.hp_max}`, ended: false };
});

export const createParty = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [existing] = await connection.execute<RowDataPacket[]>('SELECT party_id FROM party_members WHERE character_id=? FOR UPDATE', [character.id]);
  if (existing.length) throw new Error('你已经在一个队伍中。');
  const id = randomUUID();
  await connection.execute('INSERT INTO parties (id,leader_character_id) VALUES (?,?)', [id, character.id]);
  await connection.execute('INSERT INTO party_members (party_id,character_id) VALUES (?,?)', [id, character.id]);
  return id;
});

export const joinParty = async (qqUserId: string, leaderQqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(qqUserId);
  const [own] = await connection.execute<RowDataPacket[]>('SELECT party_id FROM party_members WHERE character_id=? FOR UPDATE', [character.id]);
  if (own.length) throw new Error('你已经在一个队伍中。');
  const [leaders] = await connection.execute<(RowDataPacket & { party_id: string; pos_x: number; pos_y: number; pos_z: number })[]>(`SELECT pm.party_id,c.pos_x,c.pos_y,c.pos_z FROM players p JOIN characters c ON c.player_id=p.id JOIN party_members pm ON pm.character_id=c.id JOIN parties pt ON pt.id=pm.party_id AND pt.leader_character_id=c.id WHERE p.qq_user_id=? FOR UPDATE`, [leaderQqUserId]);
  if (!leaders[0]) throw new Error('未找到该队长的队伍。');
  const [count] = await connection.execute<(RowDataPacket & { total: number })[]>('SELECT COUNT(*) AS total FROM party_members WHERE party_id=?', [leaders[0].party_id]);
  if (Number(count[0].total) >= 4) throw new Error('队伍已满（最多 4 人）。');
  await connection.execute('INSERT INTO party_members (party_id,character_id) VALUES (?,?)', [leaders[0].party_id, character.id]);
  await connection.execute('UPDATE characters SET pos_x=?,pos_y=?,pos_z=? WHERE id=?', [leaders[0].pos_x, leaders[0].pos_y, leaders[0].pos_z, character.id]);
  return Number(count[0].total) + 1;
});
