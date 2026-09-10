import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { talentByCode } from './talent.config';

export type TalentData = { settings: Record<string, any>; counters: Record<string, number>; flags: Record<string, any>; remainders: Record<string, number>; jobs: TalentJob[] };
export type TalentJob = { id: string; kind: string; created: number; ready: number; payload: Record<string, any> };
export const emptyTalentData = (): TalentData => ({ settings:{}, counters:{}, flags:{}, remainders:{}, jobs:[] });
export const talentSchema = [
  `CREATE TABLE IF NOT EXISTS talent_material_costs(owner_type ENUM('stock','market') NOT NULL,owner_id BIGINT UNSIGNED NOT NULL,item_id BIGINT UNSIGNED NOT NULL,material_code VARCHAR(128) NOT NULL,quantity DECIMAL(20,8) NOT NULL,paid DECIMAL(20,8) NOT NULL,children_json JSON NULL,children_scale DECIMAL(20,8) NOT NULL DEFAULT 1,PRIMARY KEY(owner_type,owner_id,item_id,material_code)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_talent_products(character_id BIGINT UNSIGNED NOT NULL,item_id BIGINT UNSIGNED NOT NULL,quantity INT UNSIGNED NOT NULL,PRIMARY KEY(character_id,item_id),CONSTRAINT fk_talent_product_character FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_talent_state(character_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,data_json JSON NOT NULL,revision INT UNSIGNED NOT NULL DEFAULT 0,CONSTRAINT fk_talent_state_character FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_talent_events(character_id BIGINT UNSIGNED NOT NULL,event_key VARCHAR(160) NOT NULL,result_json JSON NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(character_id,event_key),CONSTRAINT fk_talent_event_character FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`
];
export const ownedTalent = async (connection: Pool | PoolConnection, id: number) => {
  const [rows] = await connection.execute<RowDataPacket[]>('SELECT code FROM player_blessings WHERE character_id=? ORDER BY code',[id]);
  return rows.map(row=>talentByCode.get(String(row.code))).find(Boolean);
};
export const readTalentData = async (connection: Pool | PoolConnection, id: number): Promise<TalentData> => {
  const [rows] = await connection.execute<RowDataPacket[]>('SELECT data_json FROM player_talent_state WHERE character_id=?',[id]);
  const raw = typeof rows[0]?.data_json==='string' ? JSON.parse(rows[0].data_json) : rows[0]?.data_json;
  return {...emptyTalentData(),...raw};
};
/** Callers lock the character first. The state and the originating reward commit together. */
export const saveTalentData = async (connection: Pool | PoolConnection, id: number, data: TalentData) => {
  await connection.execute('INSERT INTO player_talent_state(character_id,data_json) VALUES (?,?) ON DUPLICATE KEY UPDATE data_json=VALUES(data_json),revision=revision+1',[id,JSON.stringify(data)]);
};
export const talentWhole = (data: TalentData, key: string, base: number, multiplier: number) => {
  const exact=Math.max(0,base)*multiplier+Number(data.remainders[key]??0);
  const whole=Math.floor(exact+1e-9); data.remainders[key]=Math.max(0,exact-whole); return whole;
};
export const talentDay = (now=new Date()) => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export const talentPanel = (number: string | undefined) => ({
  hp: number==='G03'?1.2:number==='G05'?1.5:number==='F03'?1.5:number==='H01'?.6:1,
  mastery: number==='F01'?'火':number==='F02'?'雷':number==='F10'?'风':number==='G06'?'冰':'',
  resistance: ''
});
export const applyTalentPanel = async (connection: Pool | PoolConnection,id:number,stats:{hpMax:number},elements:{mastery:Record<string,number>;resistance:Record<string,number>},neutralStats:Record<string,any>=stats) => {
  const talent=await ownedTalent(connection,id); if(!talent&&neutralStats===stats)return;
  const modifier=talentPanel(talent?.number),data=emptyTalentData();
  data.flags.neutralPanel={stats:{...neutralStats},hpMax:neutralStats.hpMax,mastery:{...elements.mastery},resistance:{...elements.resistance}};
  stats.hpMax=Math.max(1,Math.floor(stats.hpMax*modifier.hp));
  if(modifier.mastery)elements.mastery[modifier.mastery]=Number(elements.mastery[modifier.mastery]??0)+50;
  if(modifier.resistance)elements.resistance[modifier.resistance]=Number(elements.resistance[modifier.resistance]??0)+50;
  await connection.execute("INSERT INTO player_talent_state(character_id,data_json) VALUES (?,?) ON DUPLICATE KEY UPDATE data_json=JSON_SET(data_json,'$.flags.neutralPanel',JSON_EXTRACT(?,'$'))",[id,JSON.stringify(data),JSON.stringify(data.flags.neutralPanel)]);
};
export const neutralTalentSnapshot = async (connection: PoolConnection, row: Record<string,any>, scaleCurrent = false) => {
  const data=await readTalentData(connection,Number(row.id)),base=data.flags.neutralPanel;
  if(!base)return;
  const ratio=Number(row.current_hp)/Math.max(1,Number(row.hp_max)),mpRatio=Number(row.current_mp)/Math.max(1,Number(row.mp_max));
  const fields:Record<string,string>={mpMax:'mp_max',physicalAttack:'physical_attack',magicAttack:'magic_attack',physicalDefense:'physical_defense',magicDefense:'magic_defense',accuracy:'accuracy',evasion:'evasion',speed:'speed',critRateBp:'crit_rate_bp',critDamageBp:'crit_damage_bp',critResistBp:'crit_resist_bp',critDamageReductionBp:'crit_damage_reduction_bp',tenacity:'tenacity',tenacityPierce:'tenacity_pierce'};
  for(const[key,field]of Object.entries(fields))if(base.stats?.[key]!==undefined)row[field]=Number(base.stats[key]);
  if(scaleCurrent)row.current_mp=Math.min(Number(row.mp_max),Math.max(0,Math.floor(Number(row.mp_max)*mpRatio)));
  row.hp_max=Number(base.hpMax); if(scaleCurrent)row.current_hp=ratio<=0?0:Math.max(1,Math.floor(row.hp_max*Math.min(1,ratio)));
  row.element_mastery_json={...base.mastery}; row.element_resistance_json={...base.resistance};
};

export const initializeTalentPersistence=async(pool:Pool)=>{
  const [affinityColumns]=await pool.query<RowDataPacket[]>("SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='player_npc_affinity' AND COLUMN_NAME='affinity'");
  // Signed BIGINT preserves the entire old unsigned INT range and permits agreed breach penalties.
  if(affinityColumns.some(column=>/unsigned/i.test(String(column.COLUMN_TYPE))))await pool.query('ALTER TABLE player_npc_affinity MODIFY COLUMN affinity BIGINT NOT NULL DEFAULT 0');
  for(const sql of talentSchema)await pool.query(sql);
  for(const column of ['children_json JSON NULL','children_scale DECIMAL(20,8) NOT NULL DEFAULT 1'])try{await pool.query(`ALTER TABLE talent_material_costs ADD COLUMN ${column}`);}catch(error:any){if(error?.code!=='ER_DUP_FIELDNAME')throw error;}
  const [rows]=await pool.query<RowDataPacket[]>("SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME IN ('talent_product_consume_v2','talent_product_delete','talent_cost_clamp_v2','talent_cost_delete')");
  const names=new Set(rows.map(row=>String(row.TRIGGER_NAME)));
  // Raw legacy inventory writes can only reduce the recoverable budget, never recreate a full recipe.
  await pool.query('DROP TRIGGER IF EXISTS talent_cost_clamp');
  await pool.query('DROP TRIGGER IF EXISTS talent_product_consume');
  if(!names.has('talent_cost_clamp_v2'))await pool.query(`CREATE TRIGGER talent_cost_clamp_v2 AFTER UPDATE ON player_inventory FOR EACH ROW UPDATE talent_material_costs SET paid=paid*NEW.quantity/quantity,children_scale=children_scale*NEW.quantity/quantity,quantity=NEW.quantity WHERE owner_type='stock' AND owner_id=OLD.character_id AND item_id=OLD.item_id AND quantity>NEW.quantity`);
  if(!names.has('talent_cost_delete'))await pool.query(`CREATE TRIGGER talent_cost_delete AFTER DELETE ON player_inventory FOR EACH ROW DELETE FROM talent_material_costs WHERE owner_type='stock' AND owner_id=OLD.character_id AND item_id=OLD.item_id`);
  if(!names.has('talent_product_consume_v2'))await pool.query(`CREATE TRIGGER talent_product_consume_v2 AFTER UPDATE ON player_inventory FOR EACH ROW BEGIN IF OLD.quantity>NEW.quantity THEN UPDATE player_talent_products SET quantity=GREATEST(0,CAST(quantity AS SIGNED)-CAST(OLD.quantity-NEW.quantity AS SIGNED)) WHERE character_id=OLD.character_id AND item_id=OLD.item_id; END IF; END`);
  if(!names.has('talent_product_delete'))await pool.query(`CREATE TRIGGER talent_product_delete AFTER DELETE ON player_inventory FOR EACH ROW DELETE FROM player_talent_products WHERE character_id=OLD.character_id AND item_id=OLD.item_id`);
};
