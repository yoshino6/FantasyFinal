import { recordAchievement } from './achievement-events';
import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

export type SkillPointChangeKind =
  | 'initial_grant'
  | 'level_up'
  | 'learn_skill'
  | 'upgrade_skill'
  | 'upgrade_specialization'
  | 'upgrade_appraisal'
  | 'legacy_opening_balance'
  | 'legacy_level_reset'
  | 'allocation_reconcile'
  | 'allocation_refund';

export const recordSkillPointChange = async (
  connection: PoolConnection,
  characterId: number,
  amount: number,
  kind: SkillPointChangeKind,
  skillId: number | null = null,
  detail: string | null = null
) => {
  const metric: Record<string,string> = { learn_skill:'ACH_A06',upgrade_skill:'ACH_A07',upgrade_specialization:'ACH_A08',upgrade_appraisal:'ACH_A21' };
  if(amount<0 && metric[kind]) recordAchievement(connection,characterId,[metric[kind]]);
  if (!amount && !['legacy_opening_balance','legacy_level_reset'].includes(kind)) return;
  await connection.execute(
    'INSERT INTO player_skill_point_ledger (character_id,amount,change_kind,skill_id,detail) VALUES (?,?,?,?,?)',
    [characterId, Math.trunc(amount), kind, skillId, detail]
  );
};

export const ensureSkillPointLedger = async (connection: PoolConnection, characterId: number, currentPoints: number) => {
  const [rows] = await connection.execute<(RowDataPacket & { total: number })[]>(
    'SELECT COUNT(*) AS total FROM player_skill_point_ledger WHERE character_id=?',
    [characterId]
  );
  if (Number(rows[0]?.total ?? 0) > 0) return false;
  await recordSkillPointChange(connection, characterId, Math.max(0, Math.trunc(currentPoints)), 'legacy_opening_balance', null, '技能点账本启用时的旧存档可用余额');
  return true;
};

export const skillPointLedgerSummary = async (connection: PoolConnection, characterId: number) => {
  const [rows] = await connection.execute<(RowDataPacket & { earned: number; spent: number; balance: number })[]>(
    `SELECT
      COALESCE(SUM(CASE WHEN amount > 0 AND change_kind NOT IN ('allocation_refund','legacy_level_reset','allocation_reconcile') THEN amount ELSE 0 END),0) AS earned,
      COALESCE(SUM(CASE WHEN amount < 0 AND refund_token IS NULL AND change_kind IN ('learn_skill','upgrade_skill','upgrade_specialization','upgrade_appraisal') THEN -amount ELSE 0 END),0) AS spent,
      COALESCE(SUM(amount),0) AS balance
    FROM player_skill_point_ledger
    WHERE character_id=?`,
    [characterId]
  );
  const row = rows[0];
  return { earned: Number(row?.earned ?? 0), spent: Number(row?.spent ?? 0), balance: Number(row?.balance ?? 0) };
};

export const skillAllocationPlan = async (connection: PoolConnection, characterId: number) => {
  const [characters] = await connection.execute<RowDataPacket[]>('SELECT level,skill_points FROM characters WHERE id=? FOR UPDATE', [characterId]);
  if (!characters[0]) throw new Error('角色不存在。');
  const [skills] = await connection.execute<RowDataPacket[]>('SELECT ps.*,s.name,s.code,s.category,s.learn_cost FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? ORDER BY ps.skill_id FOR UPDATE', [characterId]);
  const [history] = await connection.execute<RowDataPacket[]>('SELECT * FROM player_skill_point_ledger WHERE character_id=? ORDER BY id FOR UPDATE', [characterId]);
  const entries=history.filter(row=>Number(row.amount)<0&&!row.refund_token);
  // 仅有管理员补录的旧可用余额，不代表存在历史收支明细。
  const mode=history.some(row=>row.change_kind!=='legacy_opening_balance')?'ledger' as const:'level' as const;
  const level=Math.max(1,Math.trunc(Number(characters[0].level)));
  const available=Number(characters[0].skill_points);
  const [specializations] = await connection.execute<RowDataPacket[]>('SELECT * FROM player_skill_specializations WHERE character_id=? ORDER BY skill_id,specialization FOR UPDATE', [characterId]);
  const [appraisal] = await connection.execute<RowDataPacket[]>('SELECT * FROM player_appraisal_progress WHERE character_id=? FOR UPDATE', [characterId]);
  const changes: { skillId: number; name: string; remove: boolean; nextLevel: number; rows: number[]; amount: number; specialization: Record<string, number>; range: number; information: number }[] = [];
  const preserved: string[] = [];
  const [professionGifts]=await connection.execute<RowDataPacket[]>(`SELECT s.id FROM characters c JOIN profession_definitions p ON p.code=c.profession_code JOIN skill_definitions s ON JSON_CONTAINS(p.skill_codes_json,JSON_QUOTE(s.code)) WHERE c.id=?`,[characterId]);
  for (const skill of skills) {
    const rows = entries.filter(row => Number(row.skill_id) === Number(skill.skill_id));
    const paidLearning=rows.some(row=>row.change_kind==='learn_skill')||(Number(skill.learn_cost)>0&&Number(skill.learn_cost)<99);
    const remove=paidLearning&&skill.category!=='bound'&&!professionGifts.some(gift=>Number(gift.id)===Number(skill.skill_id));
    // 遗忘与退款分开：旧升级明细不齐也撤销付费学习，但只退已记录的投入。
    if(remove){
      const refundable=rows.filter(row=>['learn_skill','upgrade_skill','upgrade_specialization','upgrade_appraisal'].includes(row.change_kind));
      const range=skill.code==='appraisal'?Math.max(0,Number(appraisal[0]?.range_level??1)-1):0;
      const information=skill.code==='appraisal'?Math.max(0,Number(appraisal[0]?.information_level??1)-1):0;
      changes.push({skillId:Number(skill.skill_id),name:String(skill.name),remove:true,nextLevel:1,rows:refundable.map(row=>Number(row.id)),amount:refundable.reduce((sum,row)=>sum-Number(row.amount),0),specialization:{},range,information});
      continue;
    }
    if(mode==='level'){
      const specialization=Object.fromEntries(specializations.filter(row=>Number(row.skill_id)===Number(skill.skill_id)&&Number(row.level)>1).map(row=>[String(row.specialization),Number(row.level)-1]));
      const range=skill.code==='appraisal'?Math.max(0,Number(appraisal[0]?.range_level??1)-1):0;
      const information=skill.code==='appraisal'?Math.max(0,Number(appraisal[0]?.information_level??1)-1):0;
      if(remove||Number(skill.level)>1||Object.keys(specialization).length||range||information)changes.push({skillId:Number(skill.skill_id),name:String(skill.name),remove,nextLevel:1,rows:[],amount:0,specialization,range,information});
      if(!remove)preserved.push(`${skill.name}的基础能力`);
      continue;
    }
    const upgrades = rows.filter(row => ['upgrade_skill','upgrade_specialization','upgrade_appraisal'].includes(row.change_kind));
    const counts: Record<string, number> = {}; let range = 0; let information = 0; let invalid = false;
    for (const row of upgrades) {
      if (row.change_kind === 'upgrade_specialization') { const type = /(?:overcharge|instant|efficient|potent)$/.exec(String(row.detail))?.[0]; if (!type) invalid = true; else counts[type] = (counts[type] ?? 0) + 1; }
      if (row.change_kind === 'upgrade_appraisal') { if (String(row.detail).endsWith('慧眼')) range++; else if (String(row.detail).endsWith('识珠')) information++; else invalid = true; }
    }
    for (const [type, count] of Object.entries(counts)) if (count > Number(specializations.find(row => Number(row.skill_id) === Number(skill.skill_id) && row.specialization === type)?.level ?? 1) - 1) invalid = true;
    if (range > Number(appraisal[0]?.range_level ?? 1) - 1 || information > Number(appraisal[0]?.information_level ?? 1) - 1 || upgrades.length > Number(skill.level) - 1) invalid = true;
    if (invalid) { preserved.push(String(skill.name)); continue; }
    const refundable = upgrades;
    if (!refundable.length) { preserved.push(String(skill.name)); continue; }
    if (!remove && Number(skill.level) - upgrades.length > 1) preserved.push(`${skill.name}的旧进度`);
    changes.push({ skillId: Number(skill.skill_id), name: String(skill.name), remove, nextLevel: Number(skill.level) - upgrades.length, rows: refundable.map(row => Number(row.id)), amount: refundable.reduce((sum,row) => sum - Number(row.amount),0), specialization: counts, range, information });
  }
  const [automatic]=await connection.execute<RowDataPacket[]>('SELECT * FROM player_auto_battle_actions WHERE character_id=? ORDER BY sequence_no',[characterId]);
  const [pvpAutomatic]=await connection.execute<RowDataPacket[]>('SELECT * FROM player_pvp_auto_battle_actions WHERE character_id=? ORDER BY sequence_no',[characterId]);
  const recordedRefund=changes.reduce((sum,change)=>sum+change.amount,0);
  const targetPoints=mode==='level'?level:Math.min(level,available+recordedRefund);
  const resetLegacyProgress=mode==='level'&&(specializations.some(row=>Number(row.level)>1)||appraisal.some(row=>Number(row.range_level)>1||Number(row.information_level)>1));
  return {configuration:{skills,specializations,appraisal,automatic,pvpAutomatic,history},mode,level,available,targetPoints,recordedRefund,refund:Math.max(0,targetPoints-available),canReset:changes.length>0||resetLegacyProgress||targetPoints!==available,changes,preserved};
};

/** 道具与转职共用：有明细按账退款，无明细按等级重置；余额不超过等级。 */
export const resetSkillPointAllocation = async (connection: PoolConnection, characterId: number, token: string = randomUUID()) => {
  const plan = await skillAllocationPlan(connection, characterId);
  if(!plan.canReset)return {restoredPoints:0,availablePoints:plan.targetPoints,removedSkills:0,mode:plan.mode};
  for (const change of plan.changes) {
    if (change.remove) {
      await connection.execute('INSERT IGNORE INTO player_skill_discoveries (character_id,skill_id) VALUES (?,?)', [characterId, change.skillId]);
      await connection.execute('DELETE FROM player_skill_specializations WHERE character_id=? AND skill_id=?', [characterId, change.skillId]);
      await connection.execute('DELETE FROM player_skills WHERE character_id=? AND skill_id=?', [characterId, change.skillId]);
    } else {
      await connection.execute('UPDATE player_skills SET level=?,quick_slot=NULL,passive_linked=0 WHERE character_id=? AND skill_id=?', [change.nextLevel, characterId, change.skillId]);
      for (const [type,count] of Object.entries(change.specialization)) await connection.execute('UPDATE player_skill_specializations SET level=level-? WHERE character_id=? AND skill_id=? AND specialization=?', [count,characterId,change.skillId,type]);
    }
    if (change.range || change.information) await connection.execute('UPDATE player_appraisal_progress SET range_level=range_level-?,information_level=information_level-? WHERE character_id=?', [change.range,change.information,characterId]);
    for (const table of ['player_auto_battle_actions','player_pvp_auto_battle_actions']) await connection.execute(`UPDATE ${table} SET skill_id=NULL WHERE character_id=? AND skill_id=?`, [characterId,change.skillId]);
    if(change.rows.length)await connection.execute(`UPDATE player_skill_point_ledger SET refund_token=? WHERE character_id=? AND id IN (${change.rows.map(() => '?').join(',')}) AND refund_token IS NULL`, [token,characterId,...change.rows]);
  }
  if(plan.mode==='level'){
    await connection.execute('UPDATE player_skill_specializations SET level=1 WHERE character_id=?',[characterId]);
    await connection.execute('UPDATE player_appraisal_progress SET range_level=1,information_level=1 WHERE character_id=?',[characterId]);
  }
  // 补齐缺失余额只为使账本与当前余额一致，不伪造学习/升级支出。
  const ledgerBalance=plan.configuration.history.reduce((sum,row)=>sum+Number(row.amount),0);
  await recordSkillPointChange(connection,characterId,plan.available-ledgerBalance,'allocation_reconcile',null,`洗练前余额对齐 ${token}`);
  if(plan.mode==='level')await recordSkillPointChange(connection,characterId,plan.targetPoints-plan.available,'legacy_level_reset',null,`无明细按 Lv.${plan.level} 重置 ${token}`);
  else if(plan.targetPoints<plan.available)await recordSkillPointChange(connection,characterId,plan.targetPoints-plan.available,'allocation_reconcile',null,`洗练余额限制为 Lv.${plan.level} ${token}`);
  else if (plan.refund) {
    await recordSkillPointChange(connection,characterId,plan.refund,'allocation_refund',null,`技能点重置 ${token}`);
  }
  await connection.execute('UPDATE characters SET skill_points=? WHERE id=?',[plan.targetPoints,characterId]);
  return { restoredPoints: plan.refund, availablePoints: plan.targetPoints, removedSkills: plan.changes.filter(change => change.remove).length,mode:plan.mode };
};
