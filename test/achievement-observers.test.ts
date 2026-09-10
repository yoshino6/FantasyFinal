import {achievementItem,achievementLevel,achievementSecondaryLevel,achievementEquipment,achievementNpcState} from '../src/game/achievement-hooks';
import test from 'node:test';
import assert from 'node:assert/strict';
import {takeAchievementEvents} from '../src/game/achievement-events';
const metrics=(c:any)=>takeAchievementEvents(c).flatMap(e=>e.facts);
for(const [level,ids] of [[9,[]],[10,['ACH_A12']],[19,['ACH_A12']],[20,['ACH_A12','ACH_A13']],[30,['ACH_A12','ACH_A13','ACH_A14']]] as [number,string[]][])test('成长观察器 Lv.'+level,()=>{const c={} as any;achievementLevel(c,1,level);assert.deepEqual(metrics(c).map(f=>f.metric).filter(id=>id!=='ACH_A11'),ids);});
for(const [level,ids] of [[2,[]],[3,['ACH_A18']],[4,['ACH_A18']],[5,['ACH_A18','ACH_A19']],[10,['ACH_A18','ACH_A19']],[11,['ACH_A18','ACH_A19','ACH_A20']]] as [number,string[]][])test('副职业观察器 Lv.'+level,()=>{const c={} as any;achievementSecondaryLevel(c,1,level);assert.deepEqual(metrics(c).map(f=>f.metric),ids);});
const cases:[string,any,string[]][]=[
 ['锻材',{code:'ridge_core',item_type:'material',item_category:'锻材'},['ACH_E03','ACH_E04','ACH_E15','ACH_E17']],
 ['炼材',{code:'refined_core',item_type:'material',item_category:'炼材'},['ACH_E03','ACH_E04','ACH_E16']],
 ['元素粉尘',{code:'wind_element_dust',item_type:'material'},['ACH_E03','ACH_E04','ACH_E18']],
 ['三粒子',{code:'magic_unit',item_type:'material'},['ACH_E03','ACH_E04','ACH_E19']],
 ['百分比药',{item_type:'consumable',effect_json:{healPct:1}},['ACH_E03','ACH_E21']],
 ['固定药',{item_type:'consumable',effect_json:JSON.stringify({restoreMp:1})},['ACH_E03','ACH_E21']],
 ['零回复',{item_type:'consumable',effect_json:{heal:0}},['ACH_E03']],
 ['材料回复不算药',{item_type:'material',effect_json:{heal:1}},['ACH_E03','ACH_E04']],
 ['技能书',{effect_json:{skillBook:'test'}},['ACH_E03','ACH_E23']],
 ['稀有武器',{item_type:'equipment',item_category:'武器',weapon_type:'剑',rarity:'稀有'},['ACH_E03','ACH_E07','ACH_E11']],
 ['史诗装备有实例',{item_type:'equipment',rarity:'史诗',instance:true},['ACH_E03','ACH_E12']],
 ['史诗仅定义无实例',{item_type:'equipment',rarity:'史诗'},['ACH_E03']],
 ['史诗材料',{item_type:'material',rarity:'史诗'},['ACH_E03','ACH_E04']],
 ['神器正常取得',{item_type:'equipment',rarity:'神器'},['ACH_E03','ACH_E13']],
 ...['布甲','皮甲','轻甲','重甲','板甲'].map(weapon_type=>[weapon_type,{weapon_type},['ACH_E03','ACH_E08']] as [string,any,string[]])
];
for(const [name,item,expected] of cases)test('正常获取分类：'+name,async()=>{const c={execute:async(sql:string)=>sql.includes('FROM item_definitions')?[[{id:1,code:'test',...item}]]:[item.instance?[{id:99}]:[]]} as any;await achievementItem(c,1,1);assert.deepEqual(metrics(c).map(f=>f.metric).filter(id=>id!=='ACH_E01'),expected);});
for(const affinity of [199,200])test('NPC第二级好感 '+affinity,async()=>{const c={execute:async()=>[[{affinity}]]} as any;await achievementNpcState(c,1,'npc',false);assert.deepEqual(metrics(c).map(f=>f.metric),affinity===200?['ACH_F07','ACH_F08']:[]);await achievementNpcState(c,1,'npc',true);assert.ok(metrics(c).some(f=>f.metric==='ACH_F09'&&f.distinct==='npc'));});
test('装备：重复槽不凑五件，同甲类五槽才计套装；装备定义按本世记录',async()=>{let rows:any[]=[];const c={execute:async()=>[rows]} as any;rows=Array.from({length:5},()=>({slot:'shoulder',weapon_type:'板甲'}));await achievementEquipment(c,1,50);assert.ok(!metrics(c).some(f=>f.metric==='ACH_I08'));rows=['shoulder','upper','waist','lower','feet'].map(slot=>({slot,weapon_type:'板甲'}));await achievementEquipment(c,1,50);const f=metrics(c);assert.ok(f.some(f=>f.metric==='ACH_I08'));assert.ok(f.some(f=>f.metric==='ACH_E20'&&f.life&&f.distinct==='50'));});
