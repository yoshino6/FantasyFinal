import assert from 'node:assert/strict';
import test from 'node:test';
import { CombatRules, emptyRuleState, type RuleUnit } from '../src/game/combat-rule-registry';
import { alchemyTactics } from '../src/game/alchemy-tactics';
import { alchemyOutputDefinitions } from '../src/game/alchemy-catalog';
import { alchemyEndTurn, alchemyIncoming, alchemyAfterHit, useAlchemyCombat, consumeAlchemyChant } from '../src/game/alchemy-combat';
import { alchemyStability, emptyAlchemyStatistics, updateAlchemyStatistics, scanAlchemyCombinations, validAlchemyCombination, type AlchemyBatch } from '../src/game/alchemy-journal';
import { expectedAlchemyUnitCost,alchemyQualityBudget,alchemyQualityRoll,alchemyCostQualityBudget } from '../src/game/alchemy-balance';

const unit=(key:string,side:string):RuleUnit=>({ key,name:key,side,level:30,boss:false,hp:500,hpMax:1000,mp:50,mpMax:500,attack:100,magic:100,defense:50,magicDefense:50,accuracy:100,evasion:10,speed:100,crit:0,critResist:0,critDamage:150,critReduction:0,pierce:100,tenacity:100,state:emptyRuleState(),cooldowns:{},passives:[],resistance:{},mastery:{} });
const fixture=()=>{const actor=unit('member:1','member');const enemy=unit('target:1','target');const rules=new CombatRules([actor,enemy],1,[],{absorb:async()=>0,legacyEffects:()=>[],removeLegacy:async()=>{},extraAction:()=>{},swapThreat:async()=>{}},'',undefined,()=>.01);actor.state.memory.actedTurn=1;return{actor,enemy,rules};};
test('有限扫描完整找到最后一组，重复槽位合并计数',()=>{
  const ids=[1,2];const inventory=new Map([[1,2],[2,1]]);assert.equal(validAlchemyCombination([1,1,1],inventory),false);
  const tried=new Set(['1:2:1','2:1:1']);let step=scanAlchemyCombinations(ids,inventory,tried,undefined,2,()=>.1);assert.equal(step.done,false);
  while(!step.done)step=scanAlchemyCombinations(ids,inventory,tried,step.state,2,()=>.1);
  assert.deepEqual(step.combination,[1,1,2]);tried.add('1:1:2');assert.equal(scanAlchemyCombinations(ids,inventory,tried).combination,null);
});
test('稳定统计要求独立结算，失败进入分母，品质不能拆成不同药',()=>{
  const batch=(code:string,success=true):AlchemyBatch=>({success,outputs:success?[{id:1,code,name:'药',quantity:1,role:'output'}]:[]});
  let stats=updateAlchemyStatistics(emptyAlchemyStatistics(),Array.from({length:10},()=>batch('life_l30')));assert.equal(alchemyStability(stats).stable,false);
  stats=emptyAlchemyStatistics();for(let n=0;n<5;n++)stats=updateAlchemyStatistics(stats,[batch(n%2?'life_l30_q1':'life_l30'),batch('life_l30',n<3)]);
  assert.equal(stats.batches,10);assert.equal(stats.successes,8);assert.equal(alchemyStability(stats).stable,true);
  stats=updateAlchemyStatistics(stats,Array.from({length:10},()=>batch('',false)));assert.equal(alchemyStability(stats).stable,false);
});
test('失败和双产计入单位平均成本',()=>{assert.ok(Math.abs(expectedAlchemyUnitCost(45,.86,.1,true)-47.5687)<.001);});
test('药剂与不同代码的同属性技能增益取强，不改变原技能之间的合算',()=>{
  const{rules,actor}=fixture();rules.add(actor,'battle_cry',20,3,actor);rules.add(actor,'power_surge',10,3,actor);
  assert.equal(rules.statBonus(actor,['attack','battle_cry','power_surge']),30);
  rules.add(actor,'attack',40,3,actor,false,JSON.stringify({alchemy:1}));
  assert.equal(rules.statBonus(actor,['attack','battle_cry','power_surge']),40);
  rules.add(actor,'battle_cry',55,3,actor);assert.equal(rules.statBonus(actor,['attack','battle_cry','power_surge']),65);
});
test('每个道具定义使用唯一代码，全部24类战术在两种模式均可结算',async()=>{
  assert.equal(new Set(alchemyOutputDefinitions.map(item=>item.code)).size,alchemyOutputDefinitions.length);
  for(const mode of ['pve','pvp'] as const)for(const tactic of alchemyTactics){
    const {rules,actor,enemy}=fixture();if(tactic.code==='clean_shield')rules.add(actor,'poison',3,3,enemy,true);if(tactic.code==='steal_light')rules.add(enemy,'attack',20,3,enemy);
    const result=await useAlchemyCombat(rules,actor,enemy,{tactic:tactic.code,target:tactic.enemy?'enemy':'self'},tactic.name,mode);
    assert.equal(result.consumed,true,`${mode}:${tactic.code}`);
    assert.ok(actor.hp>=0&&enemy.hp>=0);assert.ok(actor.hp<=actor.hpMax&&actor.mp<=actor.mpMax);
  }
});
test('药剂回复不吃施法者专精，满血纯回复不消耗',async()=>{
  const{rules,actor,enemy}=fixture();actor.castSpecialization={supportFactor:5} as any;
  await useAlchemyCombat(rules,actor,enemy,{healPct:22},'药','pve');assert.equal(actor.hp,720);
  actor.hp=1000;assert.equal((await useAlchemyCombat(rules,actor,enemy,{healPct:22},'药','pve')).consumed,false);
});
test('强控制不可连续使用、Boss失败后只有临时冷却，软减益不被封锁',async()=>{
  const{rules,actor,enemy}=fixture();enemy.boss=true;rules.random=()=>.99;
  const effect={target:'enemy' as const,status:{code:'stun',value:1,turns:2,chance:20,applicableLevel:30}};
  assert.equal((await useAlchemyCombat(rules,actor,enemy,effect,'震荡','pve')).consumed,true);
  assert.equal((await useAlchemyCombat(rules,actor,enemy,effect,'震荡','pve')).consumed,false);
  assert.equal((await useAlchemyCombat(rules,actor,enemy,{target:'enemy',status:{code:'exposed',value:20,turns:2}},'易伤','pve')).consumed,true);
  rules.turn=3;rules.random=()=>0;await useAlchemyCombat(rules,actor,enemy,effect,'震荡','pve');assert.equal(enemy.state.memory.alchemyHardSuccess,1);
});
test('药剂控制无目标等级门槛、不受破韧韧性影响，Boss 使用40%命中系数',async()=>{
  for(const mode of ['pve','pvp'] as const)for(const boss of [false,true])for(const succeeds of [true,false]){
    const{rules,actor,enemy}=fixture();actor.level=1;actor.pierce=0;enemy.level=100;enemy.tenacity=999999;enemy.boss=boss;
    const threshold=boss?.2:.5;rules.random=()=>succeeds?threshold-.001:threshold;
    const result=await useAlchemyCombat(rules,actor,enemy,{target:'enemy',status:{code:'stun',value:1,turns:2,chance:50,applicableLevel:10}},'固定控制药',mode);
    assert.equal(result.consumed,true);assert.equal(!!rules.status(enemy,'alchemy_stun'),succeeds,`${mode}:${boss}:${succeeds}`);
  }
  for(const output of alchemyOutputDefinitions)assert.equal(output.effect.status?.applicableLevel,undefined,output.code);
});
test('灰烬续生只触发一次，延迟伤害确实到期偿还',async()=>{
  const{rules,actor,enemy}=fixture();await useAlchemyCombat(rules,actor,enemy,{tactic:'last_life'},'续生','pve');await rules.take(actor,1000);assert.equal(actor.hp,151);
  assert.equal((await useAlchemyCombat(rules,actor,enemy,{tactic:'last_life'},'续生','pve')).consumed,false);
  actor.hp=500;await useAlchemyCombat(rules,actor,enemy,{tactic:'defer'},'延迟','pve');const damage=await alchemyIncoming(rules,enemy,actor,100,false,false);assert.equal(damage,70);await rules.take(actor,damage);
  rules.turn=3;await alchemyEndTurn(rules);assert.equal(actor.hp,400);
});
test('零吟唱不吃药效，下一次有吟唱技能只消耗一次',async()=>{
  const{rules,actor,enemy}=fixture();await useAlchemyCombat(rules,actor,enemy,{tactic:'quick_chant'},'速咏','pvp');assert.equal(await consumeAlchemyChant(rules,actor,0),0);assert.ok(rules.status(actor,'alchemy_chant'));assert.equal(await consumeAlchemyChant(rules,actor,2),1);assert.equal(await consumeAlchemyChant(rules,actor,2),2);
});
test('群体投掷的直伤确实覆盖每个合法敌人',async()=>{
  const{rules,actor,enemy}=fixture();const other=unit('target:2','target');rules.units.push(other);
  await useAlchemyCombat(rules,actor,enemy,{target:'enemy',targetScope:'all',throwable:{damageScale:1.6,element:'雷'}},'雷符','pve');assert.ok(enemy.hp<500&&other.hp<500);
});

test('成本改变有限品质分布，匠心效果与产量只计一次',()=>{
  assert.ok(alchemyCostQualityBudget(200,1)>alchemyCostQualityBudget(40,1));
  for(const craft of [0,10,30,40,50])for(const cost of [0,.1,.4]){const b=alchemyQualityBudget(craft,cost);assert.ok(Math.abs(b.potency*b.quantity-(1+cost)*(1+craft/100))<1e-9);const rolled=alchemyQualityRoll(craft,false,false,()=>.99,cost);assert.ok(rolled.quality<=2&&rolled.quantity<=2);}
});
test('借风多段共享同一技能行动，普攻不消费，下次行动不复用',async()=>{
  const{rules,actor,enemy}=fixture();await useAlchemyCombat(rules,actor,enemy,{tactic:'wind_charge'},'借风','pve');await rules.beforeAction(actor);
  assert.equal(await alchemyIncoming(rules,actor,enemy,100,false,false),100);assert.ok(rules.status(actor,'alchemy_wind'));
  assert.equal(await alchemyIncoming(rules,actor,enemy,60,false,true),87);assert.equal(await alchemyIncoming(rules,actor,enemy,40,false,true),58);
  await rules.beforeAction(actor);assert.equal(await alchemyIncoming(rules,actor,enemy,100,false,true),100);
});
test('反射只消费魔法直击，延迟池无法通过驱散取消',async()=>{
  const{rules,actor,enemy}=fixture();await useAlchemyCombat(rules,actor,enemy,{tactic:'reflect'},'折光','pve');assert.equal(await alchemyIncoming(rules,enemy,actor,100,false,false),100);assert.ok(rules.status(actor,'alchemy_reflect'));assert.equal(await alchemyIncoming(rules,enemy,actor,100,true,false),65);assert.equal(rules.status(actor,'alchemy_reflect'),undefined);
  await useAlchemyCombat(rules,actor,enemy,{tactic:'defer'},'延迟','pve');await alchemyIncoming(rules,enemy,actor,100,false,false);await rules.remove(actor,()=>true);assert.ok(rules.status(actor,'alchemy_defer'));
});
test('种子同回合多段只计一次，油膜爆发不会递归引爆',async()=>{
  const{rules,actor,enemy}=fixture();enemy.hp=enemy.hpMax=10000;await useAlchemyCombat(rules,actor,enemy,{tactic:'thunder_seed',target:'enemy'},'雷种','pve');
  for(let n=0;n<5;n++)await alchemyAfterHit(rules,actor,enemy,10,'雷');assert.equal(JSON.parse(rules.status(enemy,'alchemy_seed')!.data!).hits,1);
  rules.turn=2;await alchemyAfterHit(rules,actor,enemy,10,'雷');rules.turn=3;await alchemyAfterHit(rules,actor,enemy,10,'雷');assert.equal(rules.status(enemy,'alchemy_seed'),undefined);
  await useAlchemyCombat(rules,actor,enemy,{tactic:'oil',target:'enemy'},'油膜','pve');await alchemyAfterHit(rules,actor,enemy,10,'火');assert.equal(rules.status(enemy,'alchemy_oil'),undefined);assert.equal(rules.value(enemy,'burn'),3);
});
test('封疗影响药剂，群体支援只救存活低生命队友，生命交换不能自杀',async()=>{
  const{rules,actor,enemy}=fixture();rules.add(actor,'alchemy_antiheal',40,2,enemy,true);await useAlchemyCombat(rules,actor,enemy,{tactic:'emergency'},'救急','pve');assert.equal(actor.hp,680);
  actor.hp=120;assert.equal((await useAlchemyCombat(rules,actor,enemy,{tactic:'blood_mana'},'血蓝','pve')).consumed,false);
  const ally=unit('member:2','member'),dead=unit('member:3','member');dead.hp=0;rules.units.push(ally,dead);await useAlchemyCombat(rules,actor,enemy,{tactic:'rescue'},'救援','pve');assert.equal(ally.hp,680);assert.equal(dead.hp,0);
});
test('净化没有异常不扣药，剥离不能驱散机制，溢出护盾有上限',async()=>{
  const{rules,actor,enemy}=fixture();assert.equal((await useAlchemyCombat(rules,actor,enemy,{tactic:'clean_shield'},'涤垢','pve')).consumed,false);
  rules.add(enemy,'attack',50,2,enemy).mechanism='boss_phase';assert.equal((await useAlchemyCombat(rules,actor,enemy,{tactic:'steal_light',target:'enemy'},'夺辉','pve')).consumed,false);
  actor.hp=1000;await useAlchemyCombat(rules,actor,enemy,{tactic:'overflow'},'满溢','pve');assert.equal(rules.value(actor,'shield'),150);
});
test('反刺每回合一次，回声有总池上限且只记录直接伤害',async()=>{
  const{rules,actor,enemy}=fixture();await useAlchemyCombat(rules,actor,enemy,{tactic:'thorns'},'反刺','pvp');await alchemyAfterHit(rules,enemy,actor,20,'无');const hp=enemy.hp;await alchemyAfterHit(rules,enemy,actor,20,'无');assert.equal(enemy.hp,hp);
  await useAlchemyCombat(rules,actor,enemy,{tactic:'echo_damage',target:'enemy'},'回声','pvp');await alchemyAfterHit(rules,actor,enemy,99999,'无');const payload=JSON.parse(rules.status(enemy,'alchemy_echo')!.data!);assert.equal(payload.damage,payload.cap);
});
test('魔泉保留后续两次回复，逆相抗性使用点数而非百分比',async()=>{
  const{rules,actor,enemy}=fixture();await useAlchemyCombat(rules,actor,enemy,{tactic:'mana_spring'},'魔泉','pvp');const initial=actor.mp;await alchemyEndTurn(rules);assert.equal(actor.mp,initial);rules.turn=2;await alchemyEndTurn(rules);rules.turn=3;await alchemyEndTurn(rules);assert.equal(actor.mp,initial+100);
  const before=rules.elementFactor(enemy,actor,'火');await useAlchemyCombat(rules,actor,enemy,{tactic:'resistance'},'逆相','pvp');assert.ok(rules.elementFactor(enemy,actor,'火')<before);
});
test('同效果族限次保存在战斗状态，不会随技能冷却流逝',async()=>{
  const{rules,actor,enemy}=fixture();await useAlchemyCombat(rules,actor,enemy,{healPct:22,perBattleLimit:1},'回复','pvp');rules.turn=99;actor.hp=1;assert.equal((await useAlchemyCombat(rules,actor,enemy,{healPct:22,perBattleLimit:1},'更高品质回复','pvp')).consumed,false);
});
