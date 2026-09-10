import { combatUnitLabel } from './combat-unit-label';
import { tenacityContest } from './combat-math';
import type { AutomatonState } from './automaton';
import { automatonPanel } from './automaton';
import { automatonSkills } from './automaton-skill-catalog';
import { CombatRules, type RuleUnit, type RuleState } from './combat-rule-registry';
import { canDispelCombatEffect } from './combat-dispel-policy';

export type AutomatonBattleState = { pet: AutomatonState; rule: RuleState; cooldowns:Record<string,number>; sync:number; ultimateUsed:boolean; actionCount:number; channel?:string; exited:boolean; threat:Record<string,number>; manual?:string };
export type AutomatonCombatant = {id:number;ownerId:number;battle:AutomatonBattleState;unit:RuleUnit};
const skillById=new Map(automatonSkills.map(s=>[s.id,s]));
const equipped=(pet:AutomatonCombatant,id:string)=>pet.battle.pet.equipped.includes(id);
const defensive=['N025','N026','N027','N028','N029','N031','N032','N033','N037','N038','N039','N040','N041','N044','N045','N055','N075','N080','N088','N092','S022','S023','S027','S028','S030'];
const hard=['sleep','petrify','fear','alchemy_stun','stun','freeze'];
export const automatonRuleUnit=(id:number,battle:AutomatonBattleState):RuleUnit=>{
  const p=automatonPanel(battle.pet);
  const unit:RuleUnit={key:`automaton:${id}`,side:'member',name:battle.pet.name,level:battle.pet.level,boss:false,
    get participating(){return !battle.exited;},
    get hp(){return battle.pet.hp;},set hp(v){battle.pet.hp=Math.max(0,Math.floor(v));},hpMax:p.hpMax!,get mp(){return battle.pet.mp;},set mp(v){battle.pet.mp=Math.max(0,Math.floor(v));},mpMax:p.mpMax!,
    attack:p.physicalAttack!,magic:p.magicAttack!,defense:p.physicalDefense!,magicDefense:p.magicDefense!,accuracy:p.accuracy!,evasion:p.evasion!,speed:p.speed!,crit:p.critRateBp!,critResist:p.critResistBp!,critDamage:p.critDamageBp!,critReduction:p.critDamageReductionBp!,pierce:p.tenacityPierce!,tenacity:p.tenacity!,state:battle.rule,cooldowns:battle.cooldowns,passives:[],resistance:{},mastery:{}};
  const multiply=(key:'attack'|'magic'|'defense'|'magicDefense'|'speed'|'evasion'|'accuracy'|'tenacity',amount:number)=>{unit[key]*=1+amount/100;};
  for(const skill of battle.pet.equipped){
    if(skill==='N010')multiply('attack',8);if(skill==='N022')multiply('magic',8);if(skill==='N034'){multiply('defense',8);multiply('magicDefense',8);}if(skill==='N058')multiply('speed',8);if(skill==='N059')multiply('accuracy',8);if(skill==='N071')multiply('tenacity',10);
    if(skill==='S001'){multiply('attack',22);multiply('magic',-12);}if(skill==='S002'){multiply('magic',22);multiply('attack',-12);}if(skill==='S003'){multiply('defense',22);multiply('magicDefense',22);multiply('speed',-10);}if(skill==='S004'){multiply('speed',18);multiply('evasion',18);multiply('defense',-10);multiply('magicDefense',-10);}
  }
  return unit;
};
const sumDefense=(p:AutomatonCombatant)=>p.unit.defense+p.unit.magicDefense;
const healFactor=(p:AutomatonCombatant)=>1+(equipped(p,'N046')?.10:0)+(equipped(p,'S005')?.22:0);
const shieldFactor=(p:AutomatonCombatant)=>equipped(p,'S005')?1.22:1;
const effective=(rules:CombatRules,u:RuleUnit)=>[u.key,u.hp,u.mp,...rules.effects(u).map(e=>[e.code,e.value,e.until,e.source])];
const once=(rules:CombatRules,p:AutomatonCombatant,key:string,battle=false)=>rules.once(p.unit,`automaton_${key}`,battle);
const heal=async(rules:CombatRules,p:AutomatonCombatant,target:RuleUnit,amount:number,normal=true)=>{
  if(target.hp<=0)return false;const old=target.hp;const proposed=amount*healFactor(p);await rules.restore(p.unit,target,proposed,0,!normal);
  const actual=target.hp-old,overflow=Math.max(0,Math.floor(proposed*rules.healingMultiplier(p.unit,target))-(target.hpMax-old));
  if(normal&&equipped(p,'N047')&&overflow>0&&once(rules,p,'overflow'))await rules.shield(p.unit,target,Math.min(p.unit.magic*.25,overflow*.2),1);
  if(normal&&actual>0&&equipped(p,'S014')){const memory=p.unit.state.memory;memory.healCount=Number(memory.healCount??0)+1;if(Number(memory.healCount)%3===0){const echo=Math.min(target.hpMax-target.hp,Math.floor(actual*.4));target.hp+=echo;if(echo)rules.log.push(`　&修护回响&${combatUnitLabel(target)}恢复 ${echo} HP。`);}}
  return actual>0;
};
const shield=async(rules:CombatRules,p:AutomatonCombatant,target:RuleUnit,amount:number,duration:number)=>{if(target.hp>0)await rules.shield(p.unit,target,amount*shieldFactor(p),duration);};
const harmful=(rules:CombatRules,source:RuleUnit,target:RuleUnit,code:string,value:number,duration:number)=>{
  const contest=tenacityContest(source.pierce,target.tenacity*(1+rules.value(target,'tenacity')/100),source.level-target.level,value);
  return rules.add(target,code,value*contest.harmfulMultiplier,Math.max(1,Math.round(duration*contest.harmfulMultiplier)),source,true);
};
const dot=(rules:CombatRules,p:AutomatonCombatant,target:RuleUnit,id:string,amount:number,element:string,duration:number)=>{
  const code=`automaton_dot_${p.id}_${id}`;
  target.state.statuses=target.state.statuses.filter(e=>e.code!==code);
  const existing=target.state.statuses.filter(e=>e.code.startsWith(`automaton_dot_${p.id}_`)&&e.until>=rules.turn);
  if(existing.length>=2){existing.sort((a,b)=>a.value*(a.until-rules.turn+1)-b.value*(b.until-rules.turn+1));target.state.statuses=target.state.statuses.filter(e=>e!==existing[0]);}
  const contest=tenacityContest(p.unit.pierce,target.tenacity*(1+rules.value(target,'tenacity')/100),p.unit.level-target.level,amount);
  rules.add(target,code,amount*(equipped(p,'N083')?1.1:1)*contest.damageOverTimeMultiplier,Math.max(1,Math.round(duration*contest.harmfulMultiplier)),p.unit,true,JSON.stringify({element}));
};
export const installAutomatonRules=(rules:CombatRules,pets:AutomatonCombatant[])=>{
  rules.units.push(...pets.map(p=>p.unit));
  const absorb=rules.hooks.absorb,legacy=rules.hooks.legacyEffects,extra=rules.hooks.extraAction;
  rules.hooks.absorb=(unit,damage)=>unit.key.startsWith('automaton:')?Promise.resolve(0):absorb(unit,damage);
  rules.hooks.legacyEffects=unit=>unit.key.startsWith('automaton:')?[]:legacy(unit);
  rules.hooks.extraAction=unit=>{if(!unit.key.startsWith('automaton:'))extra(unit);};
  rules.hooks.beforeAction=async unit=>{
    if(!rules.once(unit,'automatonPeriodic'))return;
    for(const effect of [...unit.state.statuses].filter(e=>e.until>=rules.turn&&e.code.startsWith('automaton_'))){
      const source=rules.units.find(u=>u.key===effect.source);if(!source)continue;
      if(effect.code.startsWith('automaton_dot_')){const element=JSON.parse(effect.data??'{}').element??'无';await rules.secondary(source,unit,effect.value,'机巧持续伤害',element);}
      if(effect.code.startsWith('automaton_hot_')&&unit.hp>0)await rules.restore(source,unit,effect.value,0,true);
      if(effect.code.startsWith('automaton_mana_')&&unit.hp>0)await rules.restore(source,unit,0,unit.mpMax*effect.value*effect.stacks/100,true);
    }
  };
  rules.hooks.afterDamage=async(unit,damage,broken,originalShield)=>{
    const pet=pets.find(p=>p.unit===unit);
    if(pet){
      if(unit.hp<=0&&equipped(pet,'S015')&&once(rules,pet,'immortal',true)){unit.hp=1;await rules.remove(unit,e=>hard.includes(e.code)&&canDispelCombatEffect(e.code,'ordinary'));await shield(rules,pet,unit,2*sumDefense(pet),1);}
      if(damage>0&&unit.hp>0){if(once(rules,pet,'hurtSync'))pet.battle.sync=Math.min(100,pet.battle.sync+5);if(equipped(pet,'N035')&&once(rules,pet,'reorganize'))await heal(rules,pet,unit,.2*sumDefense(pet),false);
        if(equipped(pet,'N036')&&unit.hp/unit.hpMax<=.3&&once(rules,pet,'dangerPlate',true))await shield(rules,pet,unit,1.2*sumDefense(pet),2);}
      if(broken&&originalShield?.source===unit.key&&originalShield.data==='automaton_active_shield'&&equipped(pet,'S013')&&once(rules,pet,'brokenMana'))await rules.restore(unit,unit,0,unit.mpMax*.04,true);
    }
    for(const companion of pets.filter(p=>unit.key===`member:${p.ownerId}`&&p.unit.hp>0&&!p.battle.exited)){
      if(unit.hp<=0){companion.battle.exited=true;continue;}
      if(unit.hp/unit.hpMax<=companion.battle.pet.personality.ownerCareHp/100)companion.unit.state.memory.automaton_ownerDanger=1;
      if(unit.hp>0&&unit.hp/unit.hpMax<=.3&&equipped(companion,'N048')&&once(rules,companion,'ownerHeal',true))await heal(rules,companion,unit,1.2*companion.unit.magic,false);
      if(unit.hp>0&&unit.hp/unit.hpMax<=.35&&equipped(companion,'S011')&&once(rules,companion,'ownerShield',true))await shield(rules,companion,unit,1.6*sumDefense(companion),2);
    }
  };
  const missed=rules.missed.bind(rules);
  rules.missed=async(source,target)=>{await missed(source,target);const pet=pets.find(p=>p.unit===target);if(pet&&equipped(pet,'N060'))rules.add(target,'next_damage',20,2,target);};
  const incoming=rules.incoming.bind(rules);
  rules.incoming=async(source,target,raw,element,magic,skill,single=true,legacyResolved=false)=>{
    const pet=pets.find(p=>p.unit===target);
    if(pet){
      raw*=1-rules.value(target,'automaton_defending')/100;
      if(raw>0&&equipped(pet,'N096')&&once(rules,pet,'adaptive',true))rules.add(target,magic?'magic_defense':'defense',15,999,target);
      if(equipped(pet,'S013')&&rules.shieldValue(target)>0)raw*=.82;
      if(rules.status(target,'automaton_mirror')&&rules.shieldValue(target)>0&&magic)raw*=.9;
    }
    const buffer=rules.status(target,'automaton_buffer');if(buffer){raw-=Math.min(raw*.25,buffer.value);await rules.consume(target,'automaton_buffer');}
    const amount=await incoming(source,target,raw,element,magic,skill,single,legacyResolved);
    target.state.memory.automaton_direct_single=single&&source.side!==target.side?rules.turn:-1;
    return amount;
  };
  rules.hooks.beforeHpDamage=async(unit,damage)=>{
    const direct=unit.state.memory.automaton_direct_single===rules.turn;
    // 消耗本次直击标识，DOT/派生伤害不会借上一次攻击触发挡刀。
    delete unit.state.memory.automaton_direct_single;
    if(damage<=0||!direct)return damage;
    const pet=pets.find(p=>`member:${p.ownerId}`===unit.key&&!p.battle.exited&&p.unit.hp>0);
    if(!pet||damage<unit.hp-unit.hpMax*pet.battle.pet.personality.ownerCareHp/100||pet.battle.channel||hard.some(c=>rules.status(pet.unit,c))||pet.unit.mp<Math.ceil(pet.unit.mpMax*.05)||(!pet.battle.pet.personality.sacrifice&&pet.unit.hp/pet.unit.hpMax<=.25)||!once(rules,pet,'interceptAttempt',true))return damage;
    if(rules.random()>=pet.battle.pet.personality.interceptChance)return damage;
    const transferred=Math.min(Math.floor(damage*.35),Math.floor(pet.unit.hpMax*.2));if(transferred<=0)return damage;
    pet.unit.mp-=Math.ceil(pet.unit.mpMax*.05);pet.unit.hp-=transferred;pet.unit.state.memory.automaton_intercept=1;
    rules.log.push(`　&挡刀&${combatUnitLabel(pet.unit)}替主人承受 ${transferred} 点伤害。`);
    return damage-transferred;
  };
};

const damageSkills:Record<string,[number,boolean,string,number?,number?,number?]>={
  N001:[1.15,false,'无'],N002:[.65,false,'无',2],N003:[1,false,'无',1,10],N004:[1.25,false,'无'],N005:[1.1,false,'无'],N006:[1.2,false,'无'],N007:[.8,false,'无',1,0,3],N008:[1.2,false,'无'],N009:[1.8,false,'无',1,25],
  N013:[1.15,true,'光'],N014:[1.15,true,'火'],N015:[1,true,'冰'],N016:[1,true,'雷'],N017:[1.2,true,'水'],N018:[.8,true,'土',1,0,3],N019:[1.2,true,'木'],N020:[1.2,true,'暗'],N021:[1.7,true,'最低'],N030:[.6,false,'无'],
  N049:[1,false,'无'],N050:[1,true,'风'],N054:[1.2,false,'无'],N056:[.5,false,'无',3],N057:[1.65,false,'无'],N061:[.75,true,'冰'],N065:[.7,true,'雷'],N066:[.7,true,'暗'],N068:[.9,true,'光'],N069:[1,true,'冰'],N073:[.9,true,'火'],N074:[.9,false,'无'],N078:[.85,true,'暗'],N089:[1.2,false,'无'],N093:[1.5,false,'无'],
  S017:[2.8,false,'无',1,20],S018:[2.8,true,'光'],S019:[1.65,true,'火',1,0,3],S020:[1.4,true,'冰',1,0,3],S021:[2.1,true,'雷'],S025:[3.8,false,'无',1,30],S026:[2.3,true,'最低',1,0,3],S029:[3,false,'无'],S031:[4.2,true,'光',1,0,3],S032:[4,false,'无',1,35]
};
const buffs:Record<string,[string,number,number][]>={N025:[['defense',15,2]],N026:[['magic_defense',15,2]],N028:[['tenacity',20,2],['slow',10,2]],N029:[['reduction',20,2]],N033:[['defense',30,2],['magic_defense',30,2],['reduction',15,2],['slow',20,2]],N051:[['accuracy',15,2]],N052:[['speed',15,2]],N053:[['evasion',25,2]],N085:[['attack',12,2]],N086:[['magic',12,2]],N087:[['next_damage',20,2]],S024:[['attack',35,3],['magic',35,3],['speed',20,3]]};
const manaCost=(p:AutomatonCombatant,id:string)=>{const skill=skillById.get(id)!;const percent=Number.parseFloat(skill.cost);return percent?Math.max(1,Math.ceil(p.unit.mpMax*percent/100*(equipped(p,'N023')&&skill.kind==='A'&&damageSkills[id]?.[1]?.valueOf()? .9:1))):0;};
export const chooseAutomatonAction=(_rules:CombatRules,p:AutomatonCombatant,owner:RuleUnit)=>{
  if(p.battle.channel)return p.battle.channel;
  const available=p.battle.pet.equipped.filter(id=>['A','ULT'].includes(skillById.get(id)!.kind)&&!(p.battle.cooldowns[id]!>0)&&p.unit.mp>=manaCost(p,id)&&(skillById.get(id)!.kind!=='ULT'||(!p.battle.ultimateUsed&&p.battle.sync>=100)));
  // 旧存档的策略、手动指令与挡刀开关不再参与决策。
  const personality=p.battle.pet.personality;
  const selfCare=p.unit.hp/p.unit.hpMax*100<personality.selfCareHp,ownerCare=owner.hp/owner.hpMax*100<personality.ownerCareHp;
  const scored=available.map((id,index)=>({id,score:(skillById.get(id)!.kind==='ULT'?40:0)+(defensive.includes(id)?(selfCare||ownerCare?70:-20):20)+(skillById.get(id)!.domains.some(d=>personality.aligned.includes(d))?8:0)-index*.01}));
  return scored.sort((a,b)=>b.score-a.score)[0]?.id??(selfCare?'防御':'普攻');
};
export const actAutomaton=async(rules:CombatRules,p:AutomatonCombatant)=>{
  const owner=rules.units.find(u=>u.key===`member:${p.ownerId}`);
  if(!owner||owner.hp<=0||p.battle.exited){p.battle.exited=true;return;}
  if(p.unit.hp<=0)return;
  p.unit.name=p.battle.pet.name;
  p.battle.actionCount++;
  await rules.consume(p.unit,'automaton_defending');
  if(Number(p.unit.state.memory.overclockUntil??0)>0&&Number(p.unit.state.memory.overclockUntil)<rules.turn){rules.add(p.unit,'slow',15,1,p.unit,true);delete p.unit.state.memory.overclockUntil;}
  const blocked=new Set(Object.entries(p.battle.cooldowns).filter(([,n])=>n>0).map(([id])=>id));
  for(const id of blocked)p.battle.cooldowns[id]=Math.max(0,p.battle.cooldowns[id]!-1);
  if(equipped(p,'N082')&&p.battle.actionCount%3===0)await rules.restore(p.unit,p.unit,0,p.unit.mpMax*.02,true);
  if(equipped(p,'N084')&&p.unit.hp/p.unit.hpMax<=.5)await heal(rules,p,p.unit,.2*sumDefense(p),false);
  if(!(await rules.beforeAction(p.unit))){delete p.battle.channel;return;}
  const target=rules.units.find(u=>u.key===owner.selected&&u.hp>0&&u.side!==p.unit.side)??rules.enemies(p.unit)[0];
  if(!target){delete p.battle.channel;return;}
  owner.selected=target.key;
  p.unit.selected=target.key;
  // 使用回合开始时 CD 判定，扣到零的技能仍须等下一次自己的行动。
  const saved={...p.battle.cooldowns};for(const id of blocked)p.battle.cooldowns[id]=Math.max(1,p.battle.cooldowns[id]!);
  const id=chooseAutomatonAction(rules,p,owner);p.battle.cooldowns=saved;p.unit.cooldowns=saved;
  if(id==='待机')return;if(id==='防御'){rules.add(p.unit,'automaton_defending',10,2,p.unit);return;}
  const skill=id==='普攻'?undefined:skillById.get(id)!;
  if(skill&&rules.status(p.unit,'silence')){delete p.battle.channel;return;}
  const channel=Boolean(p.battle.channel);let paid=0;
  if(skill&&!channel){paid=manaCost(p,id);if(p.unit.mp<paid)return;p.unit.mp-=paid;if(skill.kind==='ULT'){p.battle.sync=0;p.battle.ultimateUsed=true;}else p.battle.cooldowns[id]=Number(skill.cost.split('/')[1]);
    if(['S025','S026','S031'].includes(id)){p.battle.channel=id;rules.log.push(`➤${combatUnitLabel(p.unit)}预备【${skill.name}】，被打断不退还消耗。`);return;}}
  delete p.battle.channel;
  rules.log.push(`➤${combatUnitLabel(p.unit)}${skill?`使用【${skill.name}】`:'普通攻击'}`);
  const self=p.unit,D=sumDefense(p),support=self.hp/self.hpMax<=owner.hp/owner.hpMax?self:owner;
  const activeShield=async(target:RuleUnit,amount:number,duration:number)=>{await shield(rules,p,target,amount,duration);const applied=rules.status(target,'shield');if(applied&&applied.source===self.key)applied.data='automaton_active_shield';};
  const before=JSON.stringify(rules.units.map(u=>effective(rules,u)));let hit=false,totalHpDamage=0,anyAttack=false;
  const definition=id==='普攻'?[1,self.magic>self.attack,'无'] as [number,boolean,string]:damageSkills[id];
  if(definition){
    let [power,magic,element,segments=1,penetration=0,area=1]=definition;anyAttack=true;
    if(['N093','S029','S032'].includes(id))magic=self.magic>self.attack;
    if(id==='N089')magic=target.magicDefense<target.defense;
    if(id==='N008'&&target.hp/target.hpMax<=.3)power=1.65;
    if(element==='最低')element=['金','木','水','火','土','风','雷','冰','光','暗'].filter(e=>e!=='金').sort((a,b)=>(target.resistance[a]??0)-(target.resistance[b]??0))[0]!;
    const affected=[target,...rules.enemies(self).filter(u=>u.key!==target.key).sort((a,b)=>a.key.localeCompare(b.key))].slice(0,area);
    const oldAccuracy=self.accuracy;if(equipped(p,'N094')&&self.hp/self.hpMax<.4)self.accuracy*=1.15;
    const oldCrit=self.crit;if(skill&&equipped(p,'S006'))self.crit*=1.15;
    for(let segment=0;segment<segments;segment++) await rules.areaDamage(affected, async enemy => {
      if(enemy.hp<=0)return;
      const hpBefore=enemy.hp,shieldBefore=rules.shieldValue(enemy);let bonus=1;
      if(!magic&&equipped(p,'N012')&&rules.status(enemy,'armor_shatter'))bonus*=1.18;
      if(equipped(p,'N072')&&rules.effects(enemy).some(e=>e.debuff))bonus*=1.15;
      if(rules.status(enemy,`automaton_lock_${p.id}`))bonus*=1.12;
      if(id==='N093'&&rules.effects(enemy).filter(e=>e.debuff).length>=2)bonus*=1.2;
      if(id==='S029'&&enemy.hp/enemy.hpMax<.25)bonus*=1.25;
      const last=self.state.memory.lastAttackType,current=magic?'magic':'physical';if(skill&&equipped(p,'S009')&&last&&last!==current)bonus*=1.25;
      if(equipped(p,'N024')&&self.state.memory.element===element&&Number(self.state.memory.elementCount)>=2)bonus*=1.2;
      const didHit=await rules.strike(self,enemy,(id==='S031'&&enemy!==target?2.1:power)*100,element,magic,false,false,1,{skill:Boolean(skill),single:area===1,penetration:Math.min(50,penetration+(skill&&enemy===target&&equipped(p,'S012')?20:0)),hitPenalty:-(id==='N016'?8:id==='N054'?15:id==='N057'?25:0)-(skill&&equipped(p,'S006')?10:0),finalMultiplier:bonus,shieldMultiplier:id==='N006'?1.4:1});
      hit ||= didHit;const dealt=hpBefore-enemy.hp;totalHpDamage+=dealt;p.battle.threat[enemy.key]=(p.battle.threat[enemy.key]??0)+dealt+(shieldBefore-rules.shieldValue(enemy));
      if(id==='N030')p.battle.threat[enemy.key]!+=2*dealt;

      if(didHit){
        const weaken=equipped(p,'N070')?1.1:1;
        if(id==='N005')harmful(rules,self,enemy,'armor_shatter',12*weaken,2);if(id==='N020')harmful(rules,self,enemy,'magic_shatter',12*weaken,2);
        if(['N015','N061','S020'].includes(id)&&(id!=='S020'||rules.random()<.5))harmful(rules,self,enemy,'slow',id==='N015'?8:id==='N061'?15:25,id==='S020'?2:1);
        if(id==='N019')harmful(rules,self,enemy,'alchemy_antiheal',20,2);
        if(['N065','N066','N069','S021'].includes(id)){
          const memory=enemy.state.memory;
          if(!(enemy.boss&&(memory.alchemyHardSuccess||Number(memory.alchemyHardRetry??0)>rules.turn||enemy.cooldowns.alchemy_control_debuff_resistance))&&Number(memory.alchemyHardUntil??0)<rules.turn){
            const controlled=await rules.control(self,enemy,id==='N066'?'silence':'alchemy_stun',id==='N069'||id==='S021'?60:40,1,false);
            if(controlled){memory.alchemyHardUntil=rules.turn+2;if(enemy.boss){memory.alchemyHardSuccess=1;enemy.cooldowns.alchemy_control_debuff_resistance=true;}}
            else if(enemy.boss)memory.alchemyHardRetry=rules.turn+2;
          }
        }
        if(['N068','S018'].includes(id))await rules.dispel(self,enemy,false,1);
        if(id==='N073')dot(rules,p,enemy,id,.12*self.magic,'火',2);if(id==='N074')dot(rules,p,enemy,id,.12*self.attack,'无',2);if(id==='N078')dot(rules,p,enemy,id,.18*self.magic,'暗',3);
      }
    });
    self.accuracy=oldAccuracy;self.crit=oldCrit;
    if(hit&&equipped(p,'N011')&&rules.random()<.2&&once(rules,p,'pursuit'))await rules.strike(self,target,25,'无',false,true);
    if(skill&&hit&&equipped(p,'S007')){const used=Number(self.state.memory.siphonTurn===rules.turn?self.state.memory.siphonValue??0:0),amount=Math.max(0,Math.min(totalHpDamage*.1,self.hpMax*.08-used));self.state.memory.siphonTurn=rules.turn;self.state.memory.siphonValue=used+amount;await heal(rules,p,self,amount,false);}
    if(hit&&target.hp<=0&&skill?.kind==='A'&&equipped(p,'N095')&&once(rules,p,'killMana'))await rules.restore(self,self,0,self.mpMax*.03,true);
    if(!hit&&skill?.kind==='A'&&equipped(p,'S010')&&once(rules,p,'recompute'))p.battle.cooldowns[id]=Math.max(0,p.battle.cooldowns[id]!-2);
    if(skill)self.state.memory.lastAttackType=magic?'magic':'physical';
    if(equipped(p,'N024')){const count=Number(self.state.memory.elementCount??0);self.state.memory.elementCount=self.state.memory.element===element?(count>=2?0:count+1):1;self.state.memory.element=element;}
  }
  for(const [code,value,duration] of buffs[id]??[])rules.add(self,code,value,duration,self,code==='slow');
  if(id==='S024')self.state.memory.overclockUntil=rules.turn+2;
  if(id==='N004')rules.add(self,'slow',10,1,self,true);if(id==='N017')await rules.restore(self,self,0,self.mpMax*.02,true);
  if(id==='N049'||id==='N057')rules.add(self,'evasion',id==='N049'?10:15,1,self);if(id==='N050'||id==='N055')rules.add(self,'speed',10,1,self);
  if(id==='N027')await activeShield(support,.6*D,2);if(id==='N031'){await activeShield(self,.8*D,2);rules.add(self,'automaton_mirror',1,2,self);}if(id==='N032')rules.add(support,'automaton_buffer',self.hpMax*.15,2,self);
  if(id==='N044')await rules.dispel(self,support,true,1);
  if(['N037','N041','N044','N045','N080','N092','S023','S027'].includes(id)){
    const recipients=['N041','S023','S027'].includes(id)?[self,owner]:[id==='N080'||id==='N092'?self:support];
    let factor=({N037:1,N041:.75,N044:.6,N045:1.8,N080:.6,N092:.9,S023:2.2,S027:2.4} as Record<string,number>)[id]!;
    if(id==='N045'&&support.hp/support.hpMax<=.3)factor*=1.25;
    if(id!=='N092'||self.hp/self.hpMax<.5)for(const recipient of recipients)await heal(rules,p,recipient,factor*self.magic,skill?.kind==='A');else await activeShield(owner,.65*D,2);
  }
  if(id==='N038'||id==='N075')rules.add(id==='N038'?support:self,`automaton_hot_${p.id}_${id}`,(id==='N038'?.3*self.magic:.2*D)*healFactor(p),id==='N038'?2:3,self);
  if(id==='N039')await rules.dispel(self,support,true,1);
  if(id==='N040')await activeShield(support,.55*self.magic,2);
  if(id==='N042')await rules.restore(self,owner,0,self.mpMax*.05,true);
  if(id==='N043'){const hot=[self,owner].flatMap(u=>u.state.statuses).find(e=>e.source===self.key&&e.code.startsWith('automaton_hot_')&&e.until>=rules.turn&&!e.data);if(hot){hot.until++;hot.data='extended';}}
  if(id==='N055')await rules.dispel(self,self,true,1,e=>['slow','bind'].includes(e.code));
  if(['N062','N063','N064','N067'].includes(id)&&rules.random()<.7){const values:Record<string,string[]>={N062:['accuracy_down'],N063:['evasion_down'],N064:['armor_shatter','magic_shatter'],N067:['attack_down','magic_down']};for(const code of values[id]!)harmful(rules,self,target,code,id==='N064'?8*(equipped(p,'N070')?1.1:1):id==='N067'?12:15,['N062','N063'].includes(id)?1:2);}
  if(id==='N076'||id==='N080')await rules.restore(self,self,0,self.mpMax*(id==='N076'?.08:.04),true);
  if(id==='N077'){dot(rules,p,target,id,.2*self.magic,'水',2);harmful(rules,self,target,'armor_shatter',8*(equipped(p,'N070')?1.1:1),2);}
  if(id==='N079')for(const enemy of [target,...rules.enemies(self).filter(u=>u!==target)].slice(0,3))dot(rules,p,enemy,id,.16*self.magic,'火',2);
  if(id==='N081')dot(rules,p,target,id,.3*self.magic,'火',4);
  if(id==='N088'){await rules.dispel(self,self,true,1,e=>['accuracy_down','evasion_down'].includes(e.code));await activeShield(self,.3*D,1);}
  if(id==='N090')rules.add(target,`automaton_lock_${p.id}`,12,2,self,true);
  if(id==='N091'){const other=p.battle.pet.equipped.filter(s=>s!==id&&skillById.get(s)?.kind==='A'&&p.battle.cooldowns[s]!>0).sort((a,b)=>p.battle.cooldowns[b]!-p.battle.cooldowns[a]!)[0];if(other)p.battle.cooldowns[other]!--;}
  if(['S022','S028'].includes(id))for(const recipient of [self,owner])await activeShield(recipient,(id==='S022'?1.5:2)*D,3);
  if(id==='S028')rules.add(self,'reduction',20,2,self);
  if(id==='S023'||id==='S027')for(const recipient of [self,owner])await rules.dispel(self,recipient,true,id==='S027'?2:1);
  if(id==='S030'){await rules.dispel(self,self,true,2,e=>hard.includes(e.code)||e.code==='silence');for(const code of Object.keys(p.battle.cooldowns))if(skillById.get(code)?.kind==='A')p.battle.cooldowns[code]=Math.max(0,p.battle.cooldowns[code]!-2);await activeShield(self,1.2*D,2);}
  if(id==='S032'){rules.add(self,'attack_down',25,2,self,true);rules.add(self,'magic_down',25,2,self,true);}
  const changed=before!==JSON.stringify(rules.units.map(u=>effective(rules,u)));
  if(changed&&id!=='N076'&&skill?.kind!=='ULT')p.battle.sync=Math.min(100,p.battle.sync+20);
  if(skill?.kind==='A'&&changed&&!['N042','N076','N080','N091'].includes(id)&&equipped(p,'S016')){self.state.memory.activeCount=Number(self.state.memory.activeCount??0)+1;if(Number(self.state.memory.activeCount)%3===0&&once(rules,p,'miracle')){p.battle.cooldowns[id]=0;self.mp=Math.min(self.mpMax,self.mp+Math.floor(paid*.3));}}
  if(anyAttack)await rules.consume(self,'next_damage');
};
