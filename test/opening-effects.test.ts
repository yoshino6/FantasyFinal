import { talentBeginAction, talentCommitAction } from '../src/game/talent-combat';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatRules, emptyRuleState, type RuleUnit } from '../src/game/combat-rule-registry';
import { openingEffectiveHeal, openingSpellHealingFactor, openingCombatEffectsFor } from '../src/game/opening-combat';
import { companionSupport, companionSpecialties } from '../src/game/companion.service';
import { openingShopQuote, payOpeningShopDiscount } from '../src/game/divine-effects';
import { chestTableForVersion, goldenChestTable, rollChest } from '../src/game/opening-chest.config';
import { openingPackExtras, grantOpeningPackExtras, repairClaimedOpeningPack } from '../src/game/opening-pack.service';
import { epicLoadoutFromRows } from '../src/game/epic-equipment.service';
import { equipmentSetSummary } from '../src/game/equipment-set-summary';
import { aquaSupport, aquaPermitLevel } from '../src/game/aqua.service';
import { companionAreaHit } from '../src/game/companion.service';

const unit=(key='member:1'):RuleUnit=>({key,name:key,side:key.split(':')[0],level:1,boss:false,hp:1000,hpMax:1000,mp:0,mpMax:1000,attack:100,magic:100,defense:50,magicDefense:50,accuracy:100,evasion:0,speed:10,crit:0,critResist:0,critDamage:0,critReduction:0,pierce:0,tenacity:0,state:emptyRuleState(),cooldowns:{},passives:[],mastery:{},resistance:{},opening:{divines:[],weapons:[],crimson:0,pve:true}});
const engine=(...units:RuleUnit[])=>new CombatRules(units,1,[],{absorb:async()=>0,legacyEffects:()=>[],removeLegacy:async()=>{},extraAction:()=>{},swapThreat:async()=>{}},'',undefined,()=>.5);

test('G15隔离额外来源与PVP；G17已删除旧直击减伤',async()=>{
  const a=unit(),b=unit('target:2'),r=engine(a,b);a.opening!.divines=['talent_combat_01'];await talentBeginAction(r,a);talentCommitAction(a,'attack');
  assert.equal(await r.incoming(a,b,1000,'无',false,false),1500);
  assert.equal(await r.incoming(a,b,1000,'无',false,true,true,true,false),1000);
  a.opening!.pve=false;assert.equal(await r.incoming(a,b,1000,'无',false,false),1000);
  a.opening!.pve=true;a.opening!.divines=['talent_physique_02'];assert.equal(await r.incoming(b,a,1000,'无',false,true),1000);
  r.add(a,'reduction',80,2,a);assert.equal(await r.incoming(b,a,1000,'无',false,true),199);
});
test('G16以实付MP折减并向上取整，原零耗维持零；晨枝只返还首个付费技能',async()=>{
  const a=unit(),r=engine(a);a.opening!.divines=['talent_combat_03'];a.opening!.weapons=['dawn_staff'];
  assert.equal(r.manaCost(a,0),0);assert.equal(r.manaCost(a,1),1);assert.equal(r.manaCost(a,11),8);
  await r.paid(a,0,{category:'magic',cooldown:0});assert.equal(a.mp,0);
  await r.paid(a,9,{category:'magic',cooldown:0});assert.equal(a.mp,1);
  r.turn++;await r.paid(a,100,{category:'magic',cooldown:0});assert.equal(a.mp,1);
});
test('初晓长剑、短刃只触发一次；追加伤害使用实际损血，不含护盾和溢出',async()=>{
  const a=unit(),b=unit('target:2'),r=engine(a,b);a.opening!.weapons=['dawn_sword','dawn_dagger'];
  await r.takeHit(b,100);await r.afterHit(a,b,100,'无',false);assert.equal(b.hp,892);assert.equal(r.value(a,'shield'),50);
  r.turn++;await r.takeHit(b,100);await r.afterHit(a,b,100,'无',false);assert.equal(b.hp,792);
  const c=unit(),d=unit('target:3'),r2=engine(c,d);c.opening!.weapons=['dawn_dagger'];d.hp=3;
  await r2.takeHit(d,1000);await r2.afterHit(c,d,1000,'无',false);assert.equal(d.hp,0);assert.equal(d.state.memory.opening_actual_damage,3);
});
test('轻跃蓄势只提高下一次普攻；猩红护盾跨回合不重复，PVP不触发',async()=>{
  const a=unit(),b=unit('target:2'),r=engine(a,b);a.opening!.weapons=['dawn_knuckle'];a.opening!.crimson=2;
  await r.takeHit(a,650);await r.afterHit(b,a,650,'无',true);assert.equal(r.value(a,'shield'),80);
  assert.equal(await r.incoming(a,b,100,'无',false,true),100);assert.equal(await r.incoming(a,b,100,'无',false,false),110);assert.equal(await r.incoming(a,b,100,'无',false,false),100);
  r.turn=4;await r.takeHit(a,1);await r.afterHit(b,a,1,'无',true);assert.equal(r.value(a,'shield'),0);
  const c=unit(),r2=engine(b,c);c.opening!.pve=false;c.opening!.crimson=5;c.hp=300;await r2.afterHit(b,c,10,'无',true);assert.equal(r2.value(c,'shield'),0);
});
test('掌心微日只跟随有效治疗，溢出不转盾，追加不形成治疗链',()=>{
  const a=unit(),b=unit('member:2'),r=engine(a,b);a.opening!.divines=['talent_combat_02'];a.opening!.weapons=['dawn_orb'];
  assert.equal(openingSpellHealingFactor(a),1.5);openingEffectiveHeal(r,a,b,0);assert.equal(a.state.memory.opening_dawn_orb,undefined);
  b.hp=990;openingEffectiveHeal(r,a,b,20);assert.equal(b.hp,1000);assert.equal(r.value(b,'shield'),0);
  b.hp=500;openingEffectiveHeal(r,a,b,20);assert.equal(b.hp,500);
});
test('王冠按防具槽计数，单件/两件/五件摘要不会读取其他史诗三件规则',()=>{
  const rows=['shoulder','upper','waist','lower','feet'].map(slot=>({slot,effect_json:{epicSetCode:'crimson_crown'}}));
  assert.equal(epicLoadoutFromRows(rows).setCount,5);assert.match(equipmentSetSummary(rows.slice(0,1))[0].effects[0],/5%/);assert.match(equipmentSetSummary(rows.slice(0,2))[0].effects[0],/8%/);assert.match(equipmentSetSummary(rows)[0].effects[1],/10%/);
});
test('黄金兔每三个主人行动支援一次，同回合重试不计数，低血护持每场一次',async()=>{
  const a=unit(),b=unit('target:2'),r=engine(a,b);a.hp=200;
  const c={execute:async()=>[[{id:7,template_code:'golden_rabbit',name:'黄金兔',level:1}]]} as any;
  await companionSupport(c,r,a,'s:1');await companionSupport(c,r,a,'s:1');await companionSupport(c,r,a,'s:2');assert.equal(a.hp,200);
  await companionSupport(c,r,a,'s:3');assert.equal(a.hp,280);
  for(let i=4;i<=6;i++)await companionSupport(c,r,a,`s:${i}`);assert.equal(a.hp,280);
  assert.ok(!companionSpecialties('golden_rabbit').includes('workshop'));assert.ok(companionSpecialties('goblin_king').includes('negotiate'));
});
test('宝箱新版医疗和商业档补齐，已生成的V1预览仍有旧版本定义',()=>{
  const old=chestTableForVersion('opening_golden_chest',1)!;assert.equal(old.version,1);assert.equal(goldenChestTable.version,2);
  assert.equal(rollChest(old,1,()=>.99).at(-1)!.quantity,2);assert.equal(rollChest(goldenChestTable,1,()=>.99).at(-1)!.quantity,1);
  assert.ok(rollChest(goldenChestTable,1,()=>.75).some(i=>i.code==='novice_mp_potion_small'&&i.quantity===2));
  assert.equal(chestTableForVersion('opening_golden_chest',99),undefined);
});
test('路线礼包额外额度只补一次，V3纪念物不混入R礼包',async()=>{
  const writes:{sql:string,args:unknown[]}[]=[];let marked=false;
  const c={execute:async(sql:string,args:unknown[]=[])=>{writes.push({sql,args});if(sql.includes('pack_extras_v1')){const affectedRows=marked?0:1;marked=true;return[{affectedRows}];}if(sql.startsWith('SELECT route_code'))return[[{route_code:'M02',story_version:3,branch_code:'A'}]];return[{affectedRows:1}];}} as any;
  assert.equal(await grantOpeningPackExtras(c,1,'R食'),true);assert.equal(await grantOpeningPackExtras(c,1,'R食'),false);
  assert.equal(writes.filter(w=>w.args[1]==='meal').length,1);assert.deepEqual(writes.find(w=>w.args[1]==='meal')!.args,[1,'meal',3]);
  assert.equal(await repairClaimedOpeningPack(c,1),false);assert.equal(Object.keys(openingPackExtras).length,8);
});
test('G10目录报价与扣款共用额度：优先礼包，不叠加，超过日上限只折剩余部分',async()=>{
  let credit=0,used=4998;const c={execute:async(sql:string)=>sql.startsWith('SELECT')&&sql.includes('player_opening_services')?[[{uses:credit}]]:sql.startsWith('SELECT used')?[[{used}]]:sql.startsWith('SELECT 1')?[[{}]]:[{affectedRows:1}]} as any;
  const item={item_type:'consumable',item_category:'药剂',buy_price:10,trade_price:1,rarity:'普通'};
  assert.deepEqual(await openingShopQuote(c,1,item,10),{base:100,price:98,credit:0,discount:2});
  credit=50;const quote=await openingShopQuote(c,1,item,10);assert.equal(quote.price,50);assert.equal(quote.discount,0);await payOpeningShopDiscount(c,1,quote);
  assert.equal((await openingShopQuote(c,1,{...item,item_category:'地图'},10)).price,100);
});
test('女神三次主人行动才支援，治疗和净化各限一次，许可成长有上限',async()=>{
  const a=unit(),r=engine(a);a.hp=200;
  const c={execute:async()=>[[{flags_json:{permitBattles:20}}]]} as any;
  assert.equal(aquaPermitLevel(0),1);assert.equal(aquaPermitLevel(10),2);assert.equal(aquaPermitLevel(999),3);
  for(let i=1;i<=3;i++)await aquaSupport(c,r,a,`s:${i}`);assert.equal(a.hp,270);
  r.add(a,'poison',1,10,a,true);for(let i=4;i<=6;i++)await aquaSupport(c,r,a,`s:${i}`);assert.equal(a.hp,270);assert.equal(r.status(a,'poison'),undefined);
  r.add(a,'poison',1,10,a,true);for(let i=7;i<=9;i++)await aquaSupport(c,r,a,`s:${i}`);assert.ok(r.status(a,'poison'));
  const p=unit('pvp:1');p.opening!.pve=false;p.hp=200;for(let i=1;i<=3;i++)await aquaSupport(c,engine(p),p,`s:${i}`);assert.equal(p.hp,200);
});
test('随从范围受伤使用独立生命，耗尽后写退场而不让玩家代伤或永久删除',async()=>{
  const a=unit(),b=unit('target:2'),r=engine(a,b);b.attack=9999;const writes:string[]=[];
  const c={execute:async(sql:string)=>{writes.push(sql);return sql.startsWith('SELECT')?[[{id:7,name:'球兔',level:1}]]:[{affectedRows:1}];}} as any;
  await companionAreaHit(c,r,a,b,false);assert.equal(a.hp,1000);assert.equal(a.state.memory.opening_companion_hp,0);assert.ok(writes.some(s=>s.includes('SET injured=1')));assert.ok(writes.every(s=>!s.includes('DELETE')));
});


test('王冠单件和两件护持不被另一套三件史诗覆盖，摘要与开战效果一致',async()=>{
  for(const count of [1,2]){
    const rows=['shoulder','upper','waist','lower','feet'].map((slot,index)=>({slot,effect_json:{epicSetCode:index<3?'valk_forge_regalia':index<3+count?'crimson_crown':''}}));
    const gear=epicLoadoutFromRows(rows);assert.equal(gear.setCode,'valk_forge_regalia');assert.equal(gear.setCount,3);assert.equal(gear.crimsonCount,count);
    const summary=equipmentSetSummary(rows);assert.equal(summary.length,2);assert.ok(summary.some(s=>s.title.startsWith('猩红王冠')));
    const c={execute:async(sql:string)=>sql.includes('FROM player_blessings')?[[]]:[rows]} as any;
    const effects=await openingCombatEffectsFor(c,[1]);assert.equal(effects.get(1)!.crimson,count);
    const owner=unit(),enemy=unit('target:1');owner.opening=effects.get(1)!;owner.hp=390;
    const rules=engine(owner,enemy);await rules.takeHit(enemy,owner,10,true);await rules.afterHit(enemy,owner,10,'无',true);
    assert.equal(rules.value(owner,'shield'),count===1?50:80);
  }
});
