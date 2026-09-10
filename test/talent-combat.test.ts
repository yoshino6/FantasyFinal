import { companionSupport } from '../src/game/companion.service';
import { useAlchemyCombat } from '../src/game/alchemy-combat';
import { manaTransferCost } from '../src/game/skill-specialization';
import { residentSkillByCode } from '../src/game/resident-skill.config';
import { installAutomatonRules } from '../src/game/automaton-combat';
import {canTalentPacify,talentTransferBuff,loadTalentBattle} from '../src/game/talent-battle.service';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatRules, emptyRuleState, readRuleState, type RuleUnit } from '../src/game/combat-rule-registry';
import { fireActive, talentState, talentOpeningShield, talentBeginAction, talentCommitAction, talentEndAction, talentDirectFactor, talentAttackAttempt, talentHpDamage, talentSpellHealing, talentReceiveHealing, talentFinishFire, installTalentHealingGuard } from '../src/game/talent-combat';
import { talentDefinitions, selectableTalents, talentGroups, talentCode } from '../src/game/talent.config';

const unit=(id:string,code=''):RuleUnit=>({key:id,name:id,side:id.split(':')[0],level:10,boss:false,hp:1000,hpMax:1000,mp:1000,mpMax:1000,attack:100,magic:100,defense:50,magicDefense:50,accuracy:100,evasion:0,speed:10,crit:0,critResist:0,critDamage:0,critReduction:0,pierce:0,tenacity:0,state:emptyRuleState(),cooldowns:{},passives:[],mastery:{},resistance:{},opening:{divines:code?[talentCode(code)!]:[],weapons:[],crimson:0,pve:true,accessories:0}});
const engine=(...units:RuleUnit[])=>new CombatRules(units,1,[],{absorb:async()=>0,legacyEffects:()=>[],removeLegacy:async()=>{},extraAction:()=>{},swapThreat:async()=>{}},'',undefined,()=>.5);
const direct = async (r:CombatRules, source:RuleUnit, target:RuleUnit, damage:number, magic=false, extra=false) => {
  const hit=await r.takeHit(target,damage);
  await r.afterHit(source,target,hit.damage-hit.absorbed,'无',true,hit.absorbed,extra,magic);
};

test('F01 朱雀按多段实际HP与破韧保存，正常时点火抗修正且不再计算火精通',async()=>{
  const a=unit('member:1','F01'),b=unit('target:2'),r=engine(a,b);a.pierce=10;b.tenacity=30;a.mastery.火=500;b.resistance.火=20;b.hp=b.hpMax=10000;
  await talentBeginAction(r,a);talentCommitAction(a,'skill','斩击');r.add(b,'shield',100,9,b);
  await direct(r,a,b,500);await direct(r,a,b,400);await talentEndAction(r,a);
  assert.equal(talentState(b).burns[0].amount,10); // 800 * 2.5% * (2*10/(10+30))
  const hp=b.hp;await talentBeginAction(r,b,true);assert.equal(b.hp,hp);assert.equal(talentState(b).burns[0].ticks,2);
  await talentBeginAction(r,b);assert.equal(b.hp,hp-8);b.state=readRuleState(JSON.parse(JSON.stringify(b.state)));await talentBeginAction(r,b);assert.equal(b.hp,hp-16);assert.equal(talentState(b).burns.length,0);await talentBeginAction(r,b);assert.equal(b.hp,hp-16);
});

test('F01 朱雀本体部位取最高、盾命中刷新、普通净化与免疫入口有效',async()=>{
  const a=unit('member:1','F01'),b=unit('target:2'),part=unit('target:3'),r=engine(a,b,part);a.pierce=100;part.state.memory.talentRoot=b.key;
  await talentBeginAction(r,a);talentCommitAction(a,'skill','火',false);await direct(r,a,b,100);await direct(r,a,part,200);await talentEndAction(r,a);
  assert.deepEqual(talentState(b).burns,[{source:a.key,amount:5,ticks:2}]);assert.equal(talentState(part).burns.length,0);
  r.hooks.linkDamage=async()=>{throw Error('朱雀不得再次触发部位传伤');};await talentBeginAction(r,b);assert.equal(b.hp,895);delete r.hooks.linkDamage;
  r.add(b,'shield',100,9,b);await talentBeginAction(r,a);talentCommitAction(a,'attack');await direct(r,a,b,50);await talentEndAction(r,a);assert.deepEqual(talentState(b).burns,[{source:a.key,amount:5,ticks:2}]);
  r.add(b,'time_guard',1,3,b);await talentBeginAction(r,b);assert.equal(b.hp,895);assert.match(r.log.join('\n'),/免疫朱雀灼烧/);
  const removed=await r.dispel(b,b,true);assert.equal(removed.length,1);assert.equal(talentState(b).burns.length,0);assert.match(r.log.join('\n'),/净化.*朱雀灼烧/);
  await talentBeginAction(r,b);assert.equal(b.hp,895);
  a.opening!.pve=false;await talentBeginAction(r,a);talentCommitAction(a,'attack');await direct(r,a,part,100);await talentEndAction(r,a);assert.equal(talentState(b).burns.length,0);
});

test('F01 朱雀零实际伤害不新建，琉璃减轻后仍可净化',async()=>{
  const a=unit('member:1','F01'),b=unit('target:2','G07'),r=engine(a,b);a.pierce=100;r.add(b,'shield',100,5,b);
  await talentBeginAction(r,a);talentCommitAction(a,'attack');await direct(r,a,b,100);await talentEndAction(r,a);assert.equal(talentState(b).burns.length,0);
  talentState(b).burns=[{source:a.key,amount:100,ticks:2}];await talentBeginAction(r,b);assert.equal(b.hp,965);await r.dispel(b,b,true);assert.equal(talentState(b).burns.length,0);
});

test('I04 预备施法不返MP、不触发根系回响，正式施法仍可返还',async()=>{
  const a=unit('member:1','I04'),b=unit('member:2'),r=engine(a,b);a.passives=['D07'];a.opening!.weapons=['dawn_staff'];a.mp=500;a.hp=500;r.add(a,'roots',1,5,a);a.state.memory.talentPreparing=1;
  await r.paid(a,100,{category:'utility',cooldown:4});assert.equal(a.mp,500);await r.shield(a,a,100,3);assert.equal(a.hp,500);assert.equal(a.state.memory.rootCount,undefined);
  delete a.state.memory.talentPreparing;await r.paid(a,100,{category:'utility',cooldown:4});assert.ok(a.mp>500);await r.shield(a,a,100,3);assert.ok(a.hp>500);
});

test('影子代班每累计两次行动只触发一次，后续被控跳过不会反复复制',async()=>{
  const a=unit('member:1','I05'),b=unit('target:2'),r=engine(a,b);
  talentState(a).normal=2;talentState(a).lastBasic={target:b.key,damage:100};
  await talentBeginAction(r,a);assert.equal(b.hp,850);await talentEndAction(r,a);
  await talentBeginAction(r,a);assert.equal(b.hp,850);await talentEndAction(r,a);
  a.state=readRuleState(JSON.parse(JSON.stringify(a.state)));
  await talentBeginAction(r,a);assert.equal(b.hp,850);
  talentState(a).normal=4;await talentBeginAction(r,a);assert.equal(b.hp,700);
});

test('饮血只计物理实际损血，多段共用每次20%上限且下次正常行动可再次吸血',async()=>{
  const a=unit('member:1','G01'),b=unit('target:2'),r=engine(a,b);a.hp=100;
  await talentBeginAction(r,a);talentCommitAction(a,'skill','斩击');r.add(b,'shield',100,2,b);
  await direct(r,a,b,300);await direct(r,a,b,300);await talentEndAction(r,a);assert.equal(a.hp,300);
  await talentBeginAction(r,a);talentCommitAction(a,'attack');await direct(r,a,b,2000);await talentEndAction(r,a);
  assert.equal(a.hp,500);assert.equal(b.hp,0);
});
test('饮血排除魔法、追加和额外行动；反震不能再产生吸血，溢出不计',async()=>{
  const a=unit('member:1','G01'),b=unit('target:2'),r=engine(a,b);a.hp=100;
  await talentBeginAction(r,a);talentCommitAction(a,'skill');await direct(r,a,b,100,true);await r.secondary(a,b,100,'追加');await talentEndAction(r,a);assert.equal(a.hp,100);
  await talentBeginAction(r,a,true);talentCommitAction(a,'attack');await direct(r,a,b,100,false,true);await talentEndAction(r,a);assert.equal(a.hp,100);
  b.hp=10;await talentBeginAction(r,a);talentCommitAction(a,'attack');await direct(r,a,b,999);await talentEndAction(r,a);assert.equal(a.hp,105);
});
test('磐心开场50%独立盾与其他盾并存；仅有效正常行动补5%，恢复有上限',async()=>{
  const a=unit('member:1','G02'),r=engine(a);talentOpeningShield(a);r.add(a,'shield',100,9,a);
  await r.take(a,650);assert.equal(a.hp,950);assert.equal(talentState(a).stoneShield,0);
  await talentBeginAction(r,a);talentCommitAction(a,'defend');await talentEndAction(r,a);assert.equal(talentState(a).stoneShield,50);
  await talentBeginAction(r,a,true);talentCommitAction(a,'attack');await talentEndAction(r,a);assert.equal(talentState(a).stoneShield,50);
  await talentBeginAction(r,a);await talentEndAction(r,a);assert.equal(talentState(a).stoneShield,50);
  for(let i=0;i<12;i++){await talentBeginAction(r,a);talentCommitAction(a,'attack');await talentEndAction(r,a);}
  assert.equal(talentState(a).stoneShield,500);
  await r.take(a,400);a.state=readRuleState(JSON.parse(JSON.stringify(a.state)));talentOpeningShield(a);assert.equal(talentState(a).stoneShield,100);
});
test('玄武按实际损血50%反震且不递归；盾吸收、致死溢出不反震，旧减伤已取消',async()=>{
  const a=unit('member:1','F03'),b=unit('target:2','F03'),r=engine(a,b);r.add(a,'shield',100,9,a);
  assert.equal(await r.incoming(b,a,300,'无',false,false),300);
  await direct(r,b,a,300);assert.equal(a.hp,800);assert.equal(b.hp,900);
  await direct(r,b,a,9999);assert.equal(a.hp,0);assert.equal(b.hp,900);
});
test('鲲鹏直接击败回血并本场成长；本体只记一次，部位、低等级与降服不算',async()=>{
  const a=unit('member:1','F07'),b=unit('target:2'),r=engine(a,b);a.hp=100;
  await talentBeginAction(r,a);talentCommitAction(a,'attack');assert.equal(talentDirectFactor(a,b,false,false,''),1.25);
  b.hp=10;await direct(r,a,b,20);assert.equal(a.hp,350);assert.equal(talentDirectFactor(a,b,false,false,''),1.5);
  await r.afterHit(a,b,10,'无',false);assert.equal(a.hp,350);
  for(const [key,level,root,pacified] of [['target:3',10,'target:2',false],['target:4',1,'',false],['target:5',10,'',true]] as const){
    const enemy=unit(key);enemy.level=level;enemy.hp=10;if(root)enemy.state.memory.talentRoot=root;if(pacified)enemy.state.memory.talentPacified=1;r.units.push(enemy);await direct(r,a,enemy,20);
  }
  assert.equal(talentState(a).kills?.length,1);assert.equal(a.hp,350);
});
test('应龙多段在行动结束追加一次风压，部位与本体取最高且额外行动不触发',async()=>{
  const a=unit('member:1','F10'),b=unit('target:2'),part=unit('target:3'),r=engine(a,b,part);part.state.memory.talentRoot=b.key;
  await talentBeginAction(r,a);talentCommitAction(a,'skill','风',false);await direct(r,a,b,100);await direct(r,a,b,100);await direct(r,a,part,300);
  await talentEndAction(r,a);assert.equal(b.hp,650);assert.equal(part.hp,700);
  await talentBeginAction(r,a,true);talentCommitAction(a,'attack');await direct(r,a,b,100,false,true);await talentEndAction(r,a);assert.equal(b.hp,550);
});

test('饕餮击败回复遵守受疗减益与8%上限，同回合不能重复回复',async()=>{
  const a=unit('member:1','F09'),b=unit('target:2'),other=unit('target:3'),r=engine(a,b,other);a.hp=100;a.modifiers={healingReceivedPct:-50};
  await talentBeginAction(r,a);talentCommitAction(a,'attack');b.hp=10;await direct(r,a,b,20);assert.equal(a.hp,140);
  other.hp=10;await direct(r,a,other,20);assert.equal(a.hp,140);
  const next=unit('target:4'),nextRules=engine(a,next);nextRules.turn=2;a.modifiers={healingReceivedPct:100};
  await talentEndAction(r,a);await talentBeginAction(nextRules,a);talentCommitAction(a,'attack');next.hp=10;await direct(nextRules,a,next,20);assert.equal(a.hp,220);
});
test('新吸血、再生盾、反震、击败成长与风压全部遵循PVE开关',async()=>{
  for(const code of ['G01','G02','F03','F07','F10']){
    const a=unit('member:1',code),b=unit('target:2'),r=engine(a,b);a.opening!.pve=false;a.hp=500;
    await talentBeginAction(r,a);talentCommitAction(a,'attack');await direct(r,a,b,100);await direct(r,b,a,100);await talentEndAction(r,a);
    assert.equal(a.hp,400,code);assert.equal(b.hp,900,code);assert.equal(talentState(a).stoneShield,undefined,code);assert.equal(talentDirectFactor(a,b,false,false,''),1,code);
  }
});

test('统一100项新编号，九类90项可选，特殊道路只展示，旧编号不作别名',()=>{
  assert.equal(talentDefinitions.length,100);assert.equal(selectableTalents.length,90);assert.equal(new Set(talentDefinitions.map(t=>t.code)).size,100);
  for(const group of talentGroups)assert.equal(talentDefinitions.filter(t=>t.group===group).length,10);
  for(const talent of talentDefinitions){assert.match(talent.code,/^talent_[a-z]+_\d{2}$/);assert.equal(talentCode(talent.number),talent.code);}
  assert.equal(talentCode('U02'),undefined);assert.equal(talentCode('divine_g01'),undefined);assert.equal(talentCode('G17'),undefined);
  assert.equal(talentDefinitions.find(t=>t.number==='J02')?.implemented,false);
});
test('一剑封喉首次失手也消耗，整个多段动作共享首次资格；跨序列化不刷新',async()=>{
  const a=unit('member:1','H05'),b=unit('target:2'),r=engine(a,b);
  await talentBeginAction(r,a);talentCommitAction(a,'skill','斩击');talentAttackAttempt(a,b);
  assert.equal(talentDirectFactor(a,b,false,true,''),5);
  talentAttackAttempt(a,b);assert.equal(talentDirectFactor(a,b,false,true,''),5);
  await talentEndAction(r,a);a.state=readRuleState(JSON.parse(JSON.stringify(a.state)));
  await talentBeginAction(r,a);talentCommitAction(a,'attack','斩击');talentAttackAttempt(a,b);
  assert.equal(talentDirectFactor(a,b,false,false,''),.75);
});
test('一剑封喉群攻先手不获5倍，部位和本体共用根敌人身份',async()=>{
  const a=unit('member:1','H05'),b=unit('target:2'),part=unit('target:3'),r=engine(a,b,part);
  part.state.memory.talentRoot=b.key;
  await talentBeginAction(r,a);talentCommitAction(a,'skill','斩击',false);talentAttackAttempt(a,part);
  assert.equal(talentDirectFactor(a,part,false,true,''),1);await talentEndAction(r,a);
  await talentBeginAction(r,a);talentCommitAction(a,'attack','斩击');talentAttackAttempt(a,b);
  assert.equal(talentDirectFactor(a,b,false,false,''),.75);
});
test('借火拦住触发当次致命伤害及多段，实际HP损失正确，不消耗第二份免死',async()=>{
  const a=unit('member:1','H10'),b=unit('target:2'),r=engine(a,b);a.hp=300;r.add(a,'feign',1,9,a);
  const first=await r.take(a,500);assert.equal(a.hp,1);assert.equal(500-first,299);assert.ok(fireActive(a));assert.ok(r.status(a,'feign'));
  const second=await r.take(a,500);assert.equal(a.hp,1);assert.equal(500-second,0);
  assert.equal(talentReceiveHealing(b,a),0);
});
test('借火仅消耗两个本人正常时点，额外行动不推进或享增伤，之后不再免死',async()=>{
  const a=unit('member:1','H10'),b=unit('target:2'),r=engine(a,b);a.hp-=talentHpDamage(a,1500);
  await talentBeginAction(r,a);talentCommitAction(a,'attack');assert.equal(talentDirectFactor(a,b,false,false,''),3);await talentEndAction(r,a);
  await talentBeginAction(r,a,true);talentCommitAction(a,'attack');assert.equal(talentDirectFactor(a,b,false,false,''),1);await talentEndAction(r,a);assert.ok(fireActive(a));
  await talentBeginAction(r,a);await talentEndAction(r,a);assert.equal(fireActive(a),false);
  await r.take(a,100);assert.equal(a.hp,0);
});
test('原生技能直接写HP也不能绕过借火禁疗',()=>{
  const a=unit('member:1','H10');const row={current_hp:10};a.hp=10;talentHpDamage(a,15);installTalentHealingGuard(a,row);
  row.current_hp=900;assert.equal(row.current_hp,10);
});
test('贫者允许队友技能治疗，断契的同类支援使本场资格永久失效',async()=>{
  const a=unit('member:1','H07'),ally=unit('member:2'),b=unit('target:3'),r=engine(a,ally,b);
  await talentBeginAction(r,a);talentCommitAction(a,'attack');assert.equal(talentDirectFactor(a,b,false,false,''),2);assert.equal(talentReceiveHealing(ally,a),1);
  a.opening!.divines=[talentCode('H08')!];talentState(a).noAid=true;talentReceiveHealing(ally,a);assert.equal(talentDirectFactor(a,b,false,false,''),1);
});
test('祷告按治疗3.5和直击3分开，无吟唱不获倍率；PVP全部关闭',async()=>{
  const a=unit('member:1','H04'),b=unit('target:2'),r=engine(a,b);
  await talentBeginAction(r,a);talentCommitAction(a,'skill','火',true,true,true);
  assert.equal(talentSpellHealing(a),3.5);assert.equal(talentDirectFactor(a,b,true,true,'火'),3);
  a.opening!.pve=false;assert.equal(talentSpellHealing(a),1);assert.equal(talentDirectFactor(a,b,true,true,'火'),1);
});


test('听见败因只累计敌方实际损血，包含追加、持续和额外行动',async()=>{
  const a=unit('member:1','C06'),b=unit('target:2'),ally=unit('member:3'),r=engine(a,b,ally);
  r.add(a,'shield',100,3,a);
  await r.secondary(b,a,150,'敌方追加');assert.equal(talentState(a).enemyHpLoss,50);
  await r.take(a,100,1,b);assert.equal(talentState(a).enemyHpLoss,150);
  await r.take(a,100,1,a);await r.take(a,100,1,ally);await r.take(a,100);
  assert.equal(talentState(a).enemyHpLoss,150);
  await direct(r,b,a,100,false,true);assert.equal(talentState(a).enemyHpLoss,250);
  await r.take(a,10000,1,b);assert.equal(talentState(a).enemyHpLoss,700);
});


test('第二种结局只接纳无特殊标记的单人单敌普通战斗',()=>{
  const enemy=unit('target:2');const row={monster_class:'normal',traits_json:'[]'};
  assert.equal(canTalentPacify(row,enemy,1,1),true);
  for(const changed of [{monster_class:'boss'},{traits_json:[{code:'quest_monster'}]},{traits_json:[{code:'lamplight_encounter'}]},{traits_json:[{code:'summoned'}]},{traits_json:'invalid'},{traits_json:{}},{must_kill:true}])assert.equal(canTalentPacify({...row,...changed},enemy,1,1),false);
  assert.equal(canTalentPacify(row,enemy,2,1),false);assert.equal(canTalentPacify(row,enemy,1,2),false);
});
test('万物借位按完成行动转移一次，原生增益留在原管线且不重新计算数值',async()=>{
  const a=unit('member:1','I07'),b=unit('member:2'),r=engine(a,b);a.opening!.settings={transferBuff:'battle_cry:member:2'};
  const effect={code:'battle_cry',value:30,stacks:1,until:4,source:a.key,debuff:false,legacyId:8};
  let recipient=a.key;let moved=0;r.hooks.legacyEffects=u=>u.key===recipient?[effect]:[];
  r.hooks.transferLegacy=async(e,source,target)=>{assert.equal(e.value,30);assert.equal(e.until,4);assert.equal(source.key,a.key);recipient=target.key;moved++;return true;};
  talentState(a).normal=2;await talentTransferBuff(r,a);assert.equal(moved,0);
  talentState(a).normal=3;await talentTransferBuff(r,a);await talentTransferBuff(r,a);assert.equal(moved,1);
  assert.equal(a.state.statuses.length+b.state.statuses.length,0);assert.equal(recipient,b.key);
});
test('万物借位的规则增益保留剩余时长与施加者，转出后自身不再持有',async()=>{
  const a=unit('member:1','I07'),b=unit('member:2','H08'),r=engine(a,b);a.opening!.settings={transferBuff:'attack:member:2'};
  r.add(a,'attack',20,3,a);const effect={...r.status(a,'attack')!};talentState(a).normal=3;
  await talentTransferBuff(r,a);assert.equal(r.status(a,'attack'),undefined);assert.deepEqual(r.status(b,'attack'),effect);assert.equal(talentState(b).noAid,false);
});


test('A01 主动直击最终乘1.5，友伤与非本人直击不乘',async()=>{
  const a=unit('member:1','A01'),b=unit('target:2'),friend=unit('member:3'),r=engine(a,b,friend);
  installAutomatonRules(r,[]); // The real battle installs this wrapper even without any automaton.
  await talentBeginAction(r,a);talentCommitAction(a,'attack');
  assert.equal(await r.incoming(a,b,100,'无',false,false),150);
  assert.equal(await r.incoming(a,b,100,'无',true,true),150);
  assert.equal(await r.incoming(a,friend,100,'无',false,false),100);
  assert.equal(await r.incoming(a,b,100,'无',false,false,true,false,false),100);
  a.opening!.pve=false;assert.equal(await r.incoming(a,b,100,'无',false,false),100);
  a.opening!.pve=true;a.companion=true;assert.equal(await r.incoming(a,b,100,'无',false,false),100);
});
test('A02 治疗术先放大再封顶；普通回复不放大',async()=>{
  const a=unit('member:1','A02'),b=unit('member:2'),r=engine(a,b);b.hp=100;
  a.castSpecialization={effectFactor:1} as any;await r.restore(a,b,100);assert.equal(b.hp,250);
  a.castSpecialization=undefined;await r.restore(a,b,100);assert.equal(b.hp,350);
  a.castSpecialization={effectFactor:1} as any;b.hp=980;await r.restore(a,b,100);assert.equal(b.hp,1000);
  b.hp=100;b.modifiers={healingReceivedPct:-50};await r.restore(a,b,100);assert.equal(b.hp,175);
  const friend=unit('member:3');friend.hp=100;r.units.push(friend);for(const ally of [b,friend])await r.restore(a,ally,100);assert.equal(b.hp,250);assert.equal(friend.hp,250);
  a.opening!.pve=false;b.hp=100;await r.restore(a,b,100);assert.equal(b.hp,150);
});
test('A03 MP支付向上取整，零耗与资源转赠不变',async()=>{
  const a=unit('member:1','A03'),r=engine(a);
  assert.equal(r.manaCost(a,90),60);assert.equal(r.manaCost(a,1),1);assert.equal(r.manaCost(a,0),0);
  a.opening!.pve=false;assert.equal(r.manaCost(a,90),90);
});

test('I10 降服截断多段及后续追加，保留三分之一HP且只触发一次',async()=>{
  const a=unit('member:1','I10'),b=unit('target:2'),r=engine(a,b),row={id:2,monster_class:'normal',traits_json:'[]',is_defeated:0};
  const db={execute:async()=>[[{data_json:{settings:{pacify:true},flags:{},jobs:[],counters:{},remainders:{}}}]]};await loadTalentBattle(db as any,r,[{id:1}],[row],new Set());
  for(const damage of [500,500,500,1000])await r.take(b,damage,1,a);assert.equal(b.hp,334);assert.equal(b.participating,false);assert.equal(row.is_defeated,1);assert.equal(r.log.filter(s=>s.includes('已被降服')).length,1);
});

test('I09 换盾按药剂基础量、不吃受疗、两正常时点到期，队友和PVP不转换',async()=>{
  const a=unit('member:1','I09'),b=unit('member:2'),r=engine(a,b);a.opening!.settings={invertPotion:true};a.modifiers={healingReceivedPct:100} as any;a.hp=400;talentState(a).clock=1;
  const effect={alchemyOutput:true,healPct:10,target:'self',perBattleLimit:1} as const;assert.equal((await useAlchemyCombat(r,a,undefined,effect,'测试药','pve')).consumed,true);assert.equal(a.hp,400);assert.equal(a.state.memory.talentBottleShield,200);assert.equal((await useAlchemyCombat(r,a,undefined,effect,'测试药','pve')).consumed,false);
  assert.equal((await useAlchemyCombat(r,a,undefined,{healPct:5},'较弱药','pve')).consumed,false);assert.equal(a.state.memory.talentBottleShield,200);assert.equal(a.state.memory.talentBottleUntil,3);
  await talentBeginAction(r,a,true);talentCommitAction(a,'defend','无',true);await talentEndAction(r,a);assert.equal(a.state.memory.talentBottleShield,200);await talentBeginAction(r,a);talentCommitAction(a,'defend');await talentEndAction(r,a);assert.equal(a.state.memory.talentBottleShield,200);await talentBeginAction(r,a);talentCommitAction(a,'defend');await talentEndAction(r,a);assert.equal(a.state.memory.talentBottleShield,undefined);
  b.hp=400;await useAlchemyCombat(r,a,undefined,{healPct:10},'给队友','pve',b);assert.equal(b.hp,500);assert.equal(b.state.memory.talentBottleShield,undefined);a.opening!.pve=false;await useAlchemyCombat(r,a,undefined,{healPct:10},'切磋药','pvp');assert.ok(a.hp>400);assert.equal(a.state.memory.talentBottleShield,undefined);
});
test('H10 提前结束或到期只支付一次10%最大HP，最低保留1点',()=>{
  for(const hp of [205,105]){const a=unit('member:1','H10');a.hp=hp;a.hp-=talentHpDamage(a,10);assert.ok(fireActive(a));talentFinishFire(a);const remaining=Math.max(1,hp-110);assert.equal(a.hp,remaining);assert.equal(fireActive(a),false);talentFinishFire(a);assert.equal(a.hp,remaining);assert.equal(talentState(a).fireUsed,true);}
});
test('H07 队友炼金药剂援助取消贫者资格，满血未用药不取消',async()=>{
  const a=unit('member:1','H07'),b=unit('member:2'),r=engine(a,b);
  const full=await useAlchemyCombat(r,b,undefined,{heal:100},'恢复药','pve',a);assert.equal(full.consumed,false);assert.notEqual(talentState(a).poorBroken,true);
  a.hp=100;await r.restore(b,a,100);assert.notEqual(talentState(a).poorBroken,true);const used=await useAlchemyCombat(r,b,undefined,{heal:100},'恢复药','pve',a);assert.equal(used.consumed,true);assert.equal(talentState(a).poorBroken,true);
});
test('H01 玻璃王冠获得普通盾减半，PVP恢复原值',async()=>{
  const a=unit('member:1','H01'),b=unit('member:2'),r=engine(a,b);await r.shield(b,a,100,3);assert.equal(r.shieldValue(a),50);await r.remove(a,e=>e.code==='shield');r.add(a,'life_shield',100,3,b);assert.equal(r.shieldValue(a),50);
  a.opening!.pve=false;await r.remove(a,e=>e.code==='life_shield');await r.shield(b,a,100,3);assert.equal(r.shieldValue(a),100);
});
test('H02 外来治疗减半，自疗不减；低血在行动开始锁定，后续压血不能补资格',async()=>{
  const a=unit('member:1','H02'),b=unit('member:2'),enemy=unit('target:3'),r=engine(a,b,enemy);a.hp=100;await r.restore(b,a,100);assert.equal(a.hp,150);await r.restore(a,a,100);assert.equal(a.hp,250);
  a.hp=301;await talentBeginAction(r,a);a.hp=299;talentCommitAction(a,'attack');assert.equal(talentDirectFactor(a,enemy,false,false,''),1);await talentEndAction(r,a);await talentBeginAction(r,a);a.hp=900;talentCommitAction(a,'attack');assert.equal(talentDirectFactor(a,enemy,false,false,''),2);
});

test('A03 魔力转赠按固定公式支付与到账，不经过天赋折扣',async()=>{
  const a=unit('member:1','A03'),friend=unit('member:2'),r=engine(a,friend);friend.mp=0;
  const paid=manaTransferCost(a.mp);assert.equal(paid,580);a.mp-=paid;await r.cast(a,friend,residentSkillByCode('resident_d01')!,paid);
  assert.equal(a.mp,420);assert.equal(friend.mp,580);
});
test('A04 首次未命中保留三倍，多段与部位共享本次倍率，命中后跨序列化1.25',async()=>{
  const a=unit('member:1','A04'),b=unit('target:2'),part=unit('target:3'),r=engine(a,b,part);part.state.memory.talentRoot=b.key;
  await talentBeginAction(r,a);talentCommitAction(a,'attack');talentAttackAttempt(a,b);await talentEndAction(r,a);
  await talentBeginAction(r,a);talentCommitAction(a,'skill');talentAttackAttempt(a,part);
  assert.equal(await r.incoming(a,part,100,'无',false,true),300);await direct(r,a,part,100);
  assert.equal(await r.incoming(a,b,100,'无',false,true),300);await talentEndAction(r,a);
  a.state=readRuleState(JSON.parse(JSON.stringify(a.state)));await talentBeginAction(r,a);talentCommitAction(a,'attack');
  assert.equal(await r.incoming(a,b,100,'无',false,false),125);
});
test('A05 按真实伤害类型轮换，同一动作所有段共享倍率',async()=>{
  const a=unit('member:1','A05'),b=unit('target:2'),r=engine(a,b);
  for(const [type,want] of [['斩击',110],['斩击',110],['奥术',160],['刺击',160]] as const){
    await talentBeginAction(r,a);talentCommitAction(a,'skill',type);
    for(let i=0;i<3;i++)assert.equal(await r.incoming(a,b,100,'无',false,true),want);
    await talentEndAction(r,a);
  }
});
test('A06 输出与承伤分开结算，真实伤害不减',async()=>{
  const a=unit('member:1','A06'),b=unit('target:2'),r=engine(a,b);await talentBeginAction(r,a);talentCommitAction(a,'attack');
  assert.equal(await r.incoming(a,b,120,'无',false,false),150);
  assert.equal(await r.incoming(b,a,120,'无',false,false),100);
  assert.equal(await r.incoming(b,a,120,'真实',false,false),120);
});
test('A07 同根多段只推进一次，第五次封顶，主动非攻击和换目标重置',async()=>{
  const a=unit('member:1','A07'),b=unit('target:2'),part=unit('target:3'),other=unit('target:4'),r=engine(a,b,part,other);part.state.memory.talentRoot=b.key;
  for(const want of [110,130,150,170,190,190]){
    await talentBeginAction(r,a);talentCommitAction(a,'skill');
    for(const target of [b,part,b]){talentAttackAttempt(a,target);assert.equal(await r.incoming(a,target,100,'无',false,true),want);}
    await talentEndAction(r,a);
  }
  await talentBeginAction(r,a);talentCommitAction(a,'support');await talentEndAction(r,a);
  await talentBeginAction(r,a);talentCommitAction(a,'attack');talentAttackAttempt(a,b);assert.equal(talentState(a).chain,1);await talentEndAction(r,a);
  await talentBeginAction(r,a);talentCommitAction(a,'attack');talentAttackAttempt(a,other);assert.equal(talentState(a).chain,1);
});
test('A08 防御减伤到下次正常行动，额外时点不清除；下一次攻击后消耗三倍',async()=>{
  const a=unit('member:1','A08'),b=unit('target:2'),r=engine(a,b);
  await talentBeginAction(r,a);talentCommitAction(a,'defend');r.add(a,'reduction',50,100000,a,false,'talentDefend');await talentEndAction(r,a);
  assert.equal(await r.incoming(b,a,100,'无',false,false),50);
  await talentBeginAction(r,a,true);assert.equal(await r.incoming(b,a,100,'无',false,false),50);await talentEndAction(r,a);
  await talentBeginAction(r,a);assert.equal(await r.incoming(b,a,100,'无',false,false),100);talentCommitAction(a,'attack');
  assert.equal(await r.incoming(a,b,100,'无',false,false),300);await talentEndAction(r,a);
  await talentBeginAction(r,a);talentCommitAction(a,'attack');assert.equal(await r.incoming(a,b,100,'无',false,false),100);
});
test('A09 只按远程标记增幅，魔法类别本身不能代替远程',async()=>{
  const a=unit('member:1','A09'),b=unit('target:2'),r=engine(a,b);
  await talentBeginAction(r,a);talentCommitAction(a,'skill','奥术',true,false);assert.equal(await r.incoming(a,b,100,'无',true,true),100);
  talentCommitAction(a,'skill','刺击',true,true);assert.equal(await r.incoming(a,b,100,'无',false,true),165);
});
test('F06 第三个攻击生成210%延迟伤害，下一正常时点结算且只一次',async()=>{
  const a=unit('member:1','F06'),b=unit('target:2'),r=engine(a,b);
  for(let n=0;n<3;n++){await talentBeginAction(r,a);talentCommitAction(a,'attack');await direct(r,a,b,100);await talentEndAction(r,a);}
  assert.equal(b.hp,700);assert.equal(talentState(a).delayed.length,1);
  await talentBeginAction(r,a,true);assert.equal(b.hp,700);await talentEndAction(r,a);
  await talentBeginAction(r,a);assert.equal(b.hp,490);await talentEndAction(r,a);
  await talentBeginAction(r,a);assert.equal(b.hp,490);
});
test('G08 盾吸收可叠劫纹，后续伤害乘算，八层封顶，友伤不叠',async()=>{
  const a=unit('member:1','G08'),b=unit('target:2'),friend=unit('member:3'),r=engine(a,b,friend);r.add(a,'shield',1000,99,a);
  for(let n=0;n<10;n++)await direct(r,b,a,1);
  assert.equal(talentState(a).stacks,8);assert.equal(await r.incoming(b,a,1000,'无',false,false),Math.floor(1000*.93**8));
  talentState(a).stacks=0;await direct(r,friend,a,1);assert.equal(talentState(a).stacks,0);
});
test('G09 元素承伤储存一核，攻击结束余震40%，普物理与二次伤害不储核',async()=>{
  const a=unit('member:1','G09'),b=unit('target:2'),r=engine(a,b);
  assert.equal(await r.incoming(b,a,120,'火',true,true),100);assert.equal(await r.incoming(b,a,120,'无',false,false),120);
  await r.afterHit(b,a,100,'火',true);await r.afterHit(b,a,100,'冰',true);
  await talentBeginAction(r,a);talentCommitAction(a,'attack');await direct(r,a,b,100);await talentEndAction(r,a);assert.equal(b.hp,860);
  await talentBeginAction(r,a);talentCommitAction(a,'attack');await direct(r,a,b,100);await talentEndAction(r,a);assert.equal(b.hp,760);
});
test('G10 首相位可选，额外行动不轮换，星辉和星隐分别结算',async()=>{
  const a=unit('member:1','G10'),b=unit('target:2'),r=engine(a,b);a.opening!.settings={phase:'星隐'};
  await talentBeginAction(r,a);talentCommitAction(a,'attack');assert.equal(await r.incoming(a,b,100,'无',false,false),100);assert.equal(await r.incoming(b,a,100,'无',false,false),50);await talentEndAction(r,a);
  await talentBeginAction(r,a,true);assert.equal(talentState(a).phase,'星隐');await talentEndAction(r,a);
  await talentBeginAction(r,a);talentCommitAction(a,'attack');assert.equal(await r.incoming(a,b,100,'无',false,false),200);assert.equal(await r.incoming(b,a,100,'无',false,false),100);assert.equal(talentSpellHealing(a),2);
});
test('H08 外援永久取消输出资格，但不能取消25%额外MP代价',async()=>{
  const a=unit('member:1','H08'),b=unit('target:2'),friend=unit('member:3'),r=engine(a,b);
  await talentBeginAction(r,a);talentCommitAction(a,'attack');assert.equal(await r.incoming(a,b,100,'无',false,false),250);assert.equal(r.manaCost(a,100),125);
  talentReceiveHealing(friend,a);assert.equal(await r.incoming(a,b,100,'无',false,false),100);assert.equal(r.manaCost(a,100),125);
});

test('I01 当场与延期分别消耗护盾，纯护盾命中仍保留欠条，旧目标离场不追伤',async()=>{
  const a=unit('member:1','I01'),b=unit('target:2'),r=engine(a,b);r.add(b,'shield',100,99,b);
  await talentBeginAction(r,a);talentCommitAction(a,'attack');const damage=await r.incoming(a,b,100,'无',false,false);assert.equal(damage,90);
  await direct(r,a,b,damage);await talentEndAction(r,a);assert.equal(b.hp,1000);assert.equal(r.value(b,'shield'),10);
  await talentBeginAction(r,a);assert.equal(b.hp,920);assert.equal(r.value(b,'shield'),0);await talentEndAction(r,a);
  talentState(a).delayed.push({target:b.key,amount:100,due:3,label:'因果欠条'});b.participating=false;
  await talentBeginAction(r,a);assert.equal(b.hp,920);
});
test('A10 实际随从支援仅指定单位翻倍，主人不增伤，同一时点重试不重复',async()=>{
  const run=async(chosen:string)=>{
    const a=unit('member:1','A10'),b=unit('target:2'),r=engine(a,b);a.opening!.settings={command:chosen};
    const c={execute:async()=>[[{id:7,name:'测试随从',template_code:'goblin',level:10}]]} as any;
    for(let i=1;i<=3;i++)await companionSupport(c,r,a,`s:${i}`);
    const loss=1000-b.hp;await companionSupport(c,r,a,'s:3');assert.equal(1000-b.hp,loss);
    await talentBeginAction(r,a);talentCommitAction(a,'attack');assert.equal(await r.incoming(a,b,100,'无',false,false),100);
    return loss;
  };
  const normal=await run('companion:99');assert.ok(normal>0);assert.equal(await run('companion:7'),normal*2);
});
test('F05 麒麟只强化治疗术对他人，满血无休息印记，自疗与PVP不放大',async()=>{
  const a=unit('member:1','F05'),b=unit('member:2'),r=engine(a,b);a.castSpecialization={effectFactor:1} as any;a.hp=b.hp=100;
  await r.restore(a,b,100);assert.equal(b.hp,280);assert.ok(Number(b.state.memory.talentRestMark)>Date.now());await r.restore(a,a,100);assert.equal(a.hp,200);assert.equal(a.state.memory.talentRestMark,undefined);
  delete b.state.memory.talentRestMark;b.hp=b.hpMax;await r.restore(a,b,100);assert.equal(b.state.memory.talentRestMark,undefined);
  a.opening!.pve=false;b.hp=100;await r.restore(a,b,100);assert.equal(b.hp,200);assert.equal(b.state.memory.talentRestMark,undefined);
});

test('D07 交涉失败前两个正常时点半伤，额外行动不消耗时点，PVP关闭',async()=>{
  const a=unit('member:1','D07'),b=unit('target:2'),r=engine(a,b);a.opening!.settings={peaceFailure:true};
  await talentBeginAction(r,a);talentCommitAction(a,'attack');assert.equal(talentDirectFactor(a,b,false,false,'无'),.5);await talentEndAction(r,a);
  await talentBeginAction(r,a,true);assert.equal(talentState(a).clock,1);await talentEndAction(r,a);
  await talentBeginAction(r,a);talentCommitAction(a,'attack');assert.equal(talentDirectFactor(a,b,false,false,'无'),.5);await talentEndAction(r,a);
  await talentBeginAction(r,a);talentCommitAction(a,'attack');assert.equal(talentDirectFactor(a,b,false,false,'无'),1);a.opening!.pve=false;talentState(a).clock=1;assert.equal(talentDirectFactor(a,b,false,false,'无'),1);
});

test('A10 机巧指挥只放大普通直击，不放大技能或追加伤害',async()=>{
  const machine=unit('member:7'),target=unit('target:2'),r=engine(machine,target);machine.state.memory.talentCommand=1;installAutomatonRules(r,[]);
  assert.equal(await r.incoming(machine,target,100,'无',false,false),200);
  assert.equal(await r.incoming(machine,target,100,'无',false,true),100);
  assert.equal(await r.incoming(machine,target,100,'无',false,false,true,false,false),100);
});

test('G07 仅可净化DOT乘0.35，机制锁定DOT不减，同次不叠直击减伤',async()=>{
  for(const mechanism of [undefined,'boss_phase']){
    const a=unit('member:1','G07'),b=unit('target:2'),r=engine(a,b);
    const dot=r.add(a,'poison',10,3,b,true);dot.mechanism=mechanism;
    await r.beforeAction(a);assert.equal(a.hp,mechanism?900:965);
  }
});
test('G05 普通软控首次显示来源，刷新不重复，过期重施可显示，硬控与PVP排除',()=>{
  const a=unit('member:1','G05'),b=unit('target:2'),r=engine(a,b);r.add(a,'slow',10,1,b,true);assert.match(r.log.join('\n'),/受到target:2施加/);const n=r.log.length;r.add(a,'slow',20,1,b,true);assert.equal(r.log.length,n);
  r.turn=3;r.add(a,'slow',10,1,b,true);assert.equal(r.log.length,n+1);for(const code of ['sleep','petrify','charm','fear','stun','hidden_stun','hidden_freeze','alchemy_stun','nightmare'])r.add(a,code,1,3,b,true);assert.equal(r.log.length,n+1);
  a.opening!.pve=false;r.add(a,'poison',1,3,b,true);assert.equal(r.log.length,n+1);
});

test('I07 同名增益取代较弱项，不叠加；较强项不被续时，原持有者保留',async()=>{
  const a=unit('member:1','I07'),b=unit('member:2'),r=engine(a,b);a.opening!.settings={transferBuff:'attack:member:2'};
  const source=r.add(a,'attack',20,5,a);r.add(b,'attack',10,10,b);talentState(a).normal=3;
  await talentTransferBuff(r,a);assert.equal(r.value(b,'attack'),30);assert.equal(r.effects(b).filter(e=>e.code==='attack').length,1);assert.equal(r.status(b,'attack')!.until,source.until);assert.equal(r.status(a,'attack'),undefined);
  r.add(a,'attack',10,20,a);talentState(a).normal=6;const until=r.status(b,'attack')!.until;
  await talentTransferBuff(r,a);assert.equal(r.value(b,'attack'),30);assert.equal(r.status(b,'attack')!.until,until);assert.equal(r.value(a,'attack'),15);
});
test('I07 护盾替换后仅保留一份，消费不会误删另一份同名盾',async()=>{
  const a=unit('member:1','I07'),b=unit('member:2'),r=engine(a,b);a.opening!.settings={transferBuff:'shield:member:2'};
  r.add(a,'shield',100,5,a);r.add(b,'shield',50,10,b);talentState(a).normal=3;await talentTransferBuff(r,a);
  await r.take(b,160);assert.equal(b.hp,990);assert.equal(r.status(b,'shield'),undefined);
});
