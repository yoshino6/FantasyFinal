/** 只读读取旧材料/货架与账本覆盖情况；不调用会初始化正式库的 getPool。 */
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {createConnection} from 'mysql2/promise';
import {alchemyMaterialValue,alchemyQualityRoll,expectedAlchemyUnitCost} from '../src/game/alchemy-balance';
import {alchemyOutputDefinitions} from '../src/game/alchemy-catalog';
import {constructionBlueprintCodes,blindBoxBlueprints} from '../src/game/deconstructor-catalog';
import {nativeSkillBalanceByCode} from '../src/game/combat-skill-balance.config';
const require=createRequire(import.meta.url);const yaml=require('yaml');const config=yaml.parse(readFileSync('alemon.config.yaml','utf8'));const c=config.FantasyFinal?.database??config.mysql;
const connection=await createConnection({host:c.host,port:c.port,user:c.user,password:c.password,database:c.database,connectTimeout:5000});
const report:any={createdAt:new Date().toISOString(),scope:'只读当前材料、旧货架与匿名账本计数；数值样本为固定角色模型，不代表真人胜率',skillVersion:createHash('sha256').update(readFileSync('src/game/combat-skill-balance.config.ts')).digest('hex'),definitionCount:alchemyOutputDefinitions.length};
try{
  await connection.query('SET TRANSACTION READ ONLY');await connection.beginTransaction();
  const[materials]=await connection.execute<any[]>("SELECT code,name,item_category,required_level,effect_json,trade_price FROM item_definitions WHERE item_type='material' AND item_category IN ('怪材','炼材','锻材','粒子','构件','基材') ORDER BY code");
  report.materials=materials.map(item=>{const effect=typeof item.effect_json==='string'?JSON.parse(item.effect_json):item.effect_json??{};const level=Number(effect.material_monster_level??effect.material_level??effect.alchemyLevel??item.required_level??1);return{code:item.code,name:item.name,category:item.item_category,level,tradePrice:Number(item.trade_price),anchor:alchemyMaterialValue(item.code,level,item.item_category)};});
  report.oldShops={};for(const table of ['blacksmith_shop_items','alchemist_shop_items','oddworkshop_items']){const[items]=await connection.query<any[]>(`SELECT i.code,i.name,i.item_type,i.item_category,s.buy_price,s.stock_quantity FROM ${table} s JOIN item_definitions i ON i.id=s.item_id WHERE s.is_active=1 ORDER BY i.code`);report.oldShops[table]=items.map(item=>({...item,decision:constructionBlueprintCodes.has(item.code)||blindBoxBlueprints.some(box=>box.code===item.code)?'图纸或研习资料迁入个人成长入口':item.item_type==='material'?'原料下架，个人制作/探索承接':'对应成品保留'}));}
  const[ledger]=await connection.query<any[]>("SELECT COUNT(*) AS entries,COUNT(DISTINCT character_id) AS ledgerCharacters,SUM(amount<0) AS spendingEntries FROM player_skill_point_ledger");const[skills]=await connection.query<any[]>('SELECT COUNT(*) AS learnedRows,COUNT(DISTINCT character_id) AS skillCharacters FROM player_skills');report.ledger={...ledger[0],...skills[0],note:'计数不代表每笔都可退款；实际按洗练服务逐技能校验，不推算旧进度'};
  await connection.rollback();
}finally{await connection.end();}
let seed=20260906;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const input=45,success=.86,great=.10;
report.sampling=[];
for(const battles of [10,30,100])for(const craftsmanship of [0,30,50]){
  const series=Array.from({length:1000},()=>{let bottles=0,potency=0;for(let n=0;n<battles;n++){if(random()>=success)continue;const critical=random()<great;const quality=alchemyQualityRoll(craftsmanship,critical,false,random);const count=quality.quantity*(critical?2:1);bottles+=count;potency+=count*(1+quality.quality*.2);}return{bottles,potency};});
  const sorted=series.map(row=>row.potency).sort((a,b)=>a-b);report.sampling.push({battles,craftsmanship,inputPerBatch:input,totalInput:battles*input,meanBottles:series.reduce((n,row)=>n+row.bottles,0)/1000,meanStandardEquivalent:sorted.reduce((a,b)=>a+b,0)/1000,p05:sorted[49],p95:sorted[949],sampleWorst:sorted[0],theoreticalWorst:0});
}
const damage=(scale:number)=>100*scale*100*scale/(100*scale+50);
report.skillReferences=['water_bolt','heavy_strike','fireball','war_cry','purifying_light'].map(code=>nativeSkillBalanceByCode.get(code));
const skill=nativeSkillBalanceByCode.get('fireball')!;
report.directReference=[10,30,50,80].map(level=>{const potion=alchemyOutputDefinitions.find(item=>item.code===`alchemy_fire_l${level}`)!;return{level,potion:potion.name,scale:potion.effect.throwable!.damageScale,potionDirect:damage(potion.effect.throwable!.damageScale),fireballDirect:damage(skill.power/100),ratio:damage(potion.effect.throwable!.damageScale)/damage(skill.power/100),note:'攻击100、防御50；不计命中暴击、专精、抗性和持续伤害，纯伤害可比样本'};});
report.unitCostExample=expectedAlchemyUnitCost(input,success,great,true);
report.resetInput=3*(alchemyMaterialValue('mana_dust',1,'炼材')!+alchemyMaterialValue('herbal_extract',1,'炼材')!+10);
report.unknownAnchors=report.materials.filter((row:any)=>row.anchor===null).length;
writeFileSync('docs/炼金V2校准数据.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({materials:report.materials.length,unknownAnchors:report.unknownAnchors,definitions:report.definitionCount,samples:report.sampling.length,legacyShopProducts:Object.values(report.oldShops).reduce((n:number,items:any)=>n+items.length,0)}));
