import type { CombatRules, RuleStatus, RuleUnit } from './combat-rule-registry';
import type { AlchemyConsumableEffect } from './alchemy-catalog';
import { bossControlChanceMultiplier } from './combat-math';
import { canDispelCombatEffect } from './combat-dispel-policy';
import { fireActive, hasTalent, talentState } from './talent-combat';

const clamp = (value: number, low: number, high: number) => Math.max(low,Math.min(high,value));
const data = (effect?: RuleStatus) => { try { return JSON.parse(effect?.data ?? '{}') as Record<string,number>; } catch { return {}; } };
const standard = (unit: RuleUnit) => Math.max(unit.attack,unit.magic) * 1.6;
const sourceOf = (rules: CombatRules, effect: RuleStatus, fallback: RuleUnit) => rules.units.find(unit => unit.key===effect.source) ?? fallback;
export const alchemyStatusNames: Record<string,string> = { alchemy_regeneration:'丰生',alchemy_mana_regeneration:'魔力回流',alchemy_last_life:'灰烬续生',alchemy_thorns:'铁木反刺',alchemy_wind:'借风蓄势',alchemy_chant:'凝时速咏',alchemy_seed:'蓄雷',alchemy_oil:'油膜',alchemy_antiheal:'封疗',alchemy_echo:'回声蓄伤',alchemy_reflect:'镜面折光',alchemy_resistance:'逆相抗性',alchemy_defer:'延迟偿伤',alchemy_stun:'眩晕' };

export const alchemyHealingFactor = (rules: CombatRules, target: RuleUnit) => 1-clamp(rules.value(target,'alchemy_antiheal'),0,90)/100;
const healing = (rules: CombatRules, target: RuleUnit, hp: number, mp=0) => {
  if(target.hp<=0) return { healed:0,overflow:0 };
  const amount = fireActive(target)?0:Math.max(0,Math.floor(hp*(1+Number(target.modifiers?.healingReceivedPct??0)/100)*alchemyHealingFactor(rules,target)));
  const healed=Math.min(target.hpMax-target.hp,amount); const restored=Math.min(target.mpMax-target.mp,Math.max(0,Math.floor(mp)));
  target.hp+=healed; target.mp+=restored;
  rules.log.push(`　➥【${target.name}】恢复 ${healed} HP、${restored} MP。`); return { healed,overflow:Math.max(0,amount-healed) };
};
/** 药剂护盾不吃技能专精或援护回响。 */
const shield = (rules:CombatRules, source:RuleUnit,target:RuleUnit,amount:number,turns:number) => {
  const old=rules.status(target,'shield'); amount=Math.floor(Math.max(0,amount));
  if(amount<=0 || old && old.value>=amount) return false;
  rules.add(target,'shield',amount,turns,source); return true;
};
const buff = (rules:CombatRules,source:RuleUnit,target:RuleUnit,code:string,value:number,turns:number,debuff=false,payload?:Record<string,number>) => {
  const old=rules.status(target,code);
  if(old && old.value>value) return false;
  rules.add(target,code,['attack','magic','defense','magic_defense','evasion','speed'].includes(code)?Math.min(60,value):value,turns,source,debuff,JSON.stringify({...payload,alchemy:1})); return true;
};
const direct = async (rules:CombatRules,source:RuleUnit,target:RuleUnit,raw:number,element='无',single=true) => {
  if(target.hp<=0) return 0;
  const defense=Math.max(0,(element==='无'?target.defense:target.magicDefense)*(1-clamp(rules.value(target,element==='无'?'armor_shatter':'magic_shatter'),0,80)/100));
  const base=raw*raw/Math.max(1,raw+defense);
  const amount=Math.max(0,Math.floor(base*rules.elementFactor(source,target,element)*(rules.hooks.directMultiplier?.(source,target,element,element!=='无',single,element)??1)*(1-clamp(rules.value(target,'reduction')+(rules.hooks.directMultiplier?0:rules.value(target,'barrier')),0,80)/100)*(1+rules.value(target,'exposed')/100)));
  const adjusted=await alchemyIncoming(rules,source,target,amount,element!=='无',false);
  const old=target.hp; await rules.takeHit(target,adjusted,1,!single);
  rules.log.push(`　➥【${target.name}】受到 ${old-target.hp} 点${element}投掷伤害。`);
  // 投掷物属于直伤；不触发技能专精和技能追击，炼金引爆另有无递归边界。
  await alchemyAfterHit(rules,source,target,Math.max(0,old-target.hp),element);
  return Math.max(0,old-target.hp);
};

const reaction=async(rules:CombatRules,source:RuleUnit,target:RuleUnit,raw:number,label:string,element='无')=>{
  if(target.hp<=0||raw<=0)return;
  const defense=Math.max(0,element==='无'?target.defense:target.magicDefense);
  const multiplier=rules.hooks.directMultiplier?.(source,target,element,element!=='无',true,'打击')??(1-clamp(rules.value(target,'barrier'),0,80)/100);
  const damage=Math.max(0,Math.floor(raw*raw/Math.max(1,raw+defense)*rules.elementFactor(source,target,element)*multiplier*(1-clamp(rules.value(target,'reduction'),0,80)/100)));
  const hp=target.hp;await rules.take(target,damage);rules.log.push(`　&${label}&【${target.name}】受到 ${Math.max(0,hp-target.hp)} 点${element}伤害。`);
};

export const useAlchemyCombat = async (rules:CombatRules,actor:RuleUnit,enemy:RuleUnit|undefined,effect:Omit<AlchemyConsumableEffect,'status'> & { heal?:number;restoreMp?:number;status?:{code:string;value:number;turns:number;chance?:number;applicableLevel?:number} },name:string,mode:'pve'|'pvp',ally?:RuleUnit) => {
  if(effect.requiredLevel && actor.level<effect.requiredLevel)return {consumed:false,message:`需要Lv.${effect.requiredLevel}才能使用，未消耗道具。`};
  if(effect.skillReset) return { consumed:false,message:'归悟洗练露只能在战斗外使用，请打开“归悟洗练”。' };
  if(effect.experienceBonusPct||effect.partyDropBonusPct) return { consumed:false,message:'此秘药请在冒险模式使用。' };
  const target=effect.target==='enemy'?enemy:(ally?.side===actor.side?ally:actor);
  if(!target || target.hp<=0) return { consumed:false,message:'当前没有合法的存活目标。' };
  const family=effect.tactic??effect.status?.code??(effect.healPct?'life':'mana'); const key=`alchemy_limit_${family}`;
  if(effect.perBattleLimit && Number(actor.state.memory[key]??0)>=effect.perBattleLimit) return { consumed:false,message:'同类道具本场使用次数已达上限。' };
  const start=rules.log.length; const q=clamp(Number(effect.quality??1),1,1.4)*clamp(Number(effect.tacticPotency??1),1,1.3); let changed=false;
  const apply=(code:string,value:number,turns:number,to=target,debuff=false,payload?:Record<string,number>) => { changed=buff(rules,actor,to,code,value,turns,debuff,payload)||changed; };
  const heal=(to:RuleUnit,hp:number,mp=0) => {
    if((hp>0&&to.hp<to.hpMax)||(mp>0&&to.mp<to.mpMax))talentState(to).poorBroken=true;
    if(to.key===actor.key&&hp>0&&!effect.tactic&&hasTalent(actor,'I09')&&actor.opening?.settings?.invertPotion){
      const amount=Math.floor(hp*2),old=Number(actor.state.memory.talentBottleShield??0);
      if(amount>old){actor.state.memory.talentBottleShield=amount;actor.state.memory.talentBottleUntil=talentState(actor).clock+2;changed=true;rules.log.push(`　➥倒置药瓶形成${amount}点护盾。`);}
      hp=0;
    }
    const old=to.hp+to.mp; const result=healing(rules,to,hp,mp); changed=changed||to.hp+to.mp>old; return result;
  };
  const hit=async (scale:number,to=target,element='无') => { changed=true; return direct(rules,actor,to,standard(actor)*scale*q,element,to===target); };
  const cleanse=async (to:RuleUnit,debuff:boolean,max:number) => {
    const removed=await rules.remove(to,e=>e.debuff===debuff&&canDispelCombatEffect(e.code,'ordinary',Boolean(e.mechanism))&&!['alchemy_defer'].includes(e.code),max);
    changed=changed||removed.length>0; return removed.length;
  };
  switch(effect.tactic) {
    case 'emergency': heal(target,target.hpMax*(target.hp/target.hpMax<.3?.45:.3)*q); break;
    case 'overflow': { const result=heal(target,target.hpMax*.3*q); changed=shield(rules,actor,target,Math.min(target.hpMax*.15*q,result.overflow*.7),2)||changed; break; }
    case 'clean_shield': { const count=await cleanse(target,true,3); if(count) shield(rules,actor,target,target.hpMax*.05*q*count,2); break; }
    case 'last_life': if(target.state.memory.alchemyRevived) return { consumed:false,message:'该目标本场已触发灰烬续生。' }; apply('alchemy_last_life',15*q,3); break;
    case 'mana_spring': heal(target,0,target.mpMax*.25*q); apply('alchemy_mana_regeneration',10*q,2,target,false,{start:rules.turn+1}); if(changed) rules.status(target,'alchemy_mana_regeneration')!.until=rules.turn+2; break;
    case 'blood_mana': {
      const price=Math.ceil(actor.hpMax*.12); if(actor.hp<=price) return { consumed:false,message:'生命不足以支付交换代价，未消耗药剂。' };
      if(actor.mp>=actor.mpMax) return { consumed:false,message:'魔力已满，无需交换。' }; actor.hp-=price; heal(actor,0,actor.mpMax*.4*q); changed=true; break;
    }
    case 'berserk': apply('attack',40*q,3); apply('magic',40*q,3); apply('armor_shatter',15,3,target,true); apply('magic_shatter',15,3,target,true); break;
    case 'thorns': apply('defense',25*q,2); apply('magic_defense',25*q,2); apply('alchemy_thorns',1,2,target,false,{damage:standard(actor)*.35*q}); break;
    case 'shed': apply('evasion',25*q,2); if(mode==='pve') actor.state.memory.alchemyThreatDrop=40; break;
    case 'lure': await hit(.7); if(mode==='pvp') apply('accuracy_down',20,1,target,true); else actor.state.memory.alchemyThreatBoost=standard(actor)*q; break;
    case 'wind_charge': apply('alchemy_wind',45*q,3); break;
    case 'quick_chant': apply('alchemy_chant',1,3); break;
    case 'thunder_seed': await hit(.65,target,'雷'); apply('alchemy_seed',1,2,target,true,{hits:1,last:rules.turn,damage:standard(actor)*.9*q}); rules.status(target,'alchemy_seed')!.until=rules.turn+2; break;
    case 'oil': await hit(.5,target,'火'); apply('alchemy_oil',1,3,target,true,{damage:standard(actor)*.8*q}); break;
    case 'frost_crack': { const bound=rules.status(target,'bind'); await hit(.6,target,'冰'); apply('armor_shatter',25,2,target,true); apply('magic_shatter',25,2,target,true); if(bound) await reaction(rules,actor,target,standard(actor)*.35*q,'霜裂','冰'); break; }
    case 'chain': await rules.areaDamage([target,...rules.enemies(actor).filter(unit=>unit.key!==target.key).slice(0,2)], async other => {
      changed=true; await direct(rules,actor,other,standard(actor)*(other===target?.8:.35)*q,'雷',false);
    }); break;
    case 'antiheal': await hit(.6); apply('alchemy_antiheal',40,2,target,true); break;
    case 'echo_damage': apply('alchemy_echo',20,2,target,true,{damage:0,cap:standard(actor)*1.2*q}); break;
    case 'steal_light': { const count=await cleanse(target,false,2); if(count) shield(rules,actor,actor,actor.hpMax*.06*q*count,2); break; }
    case 'reflect': apply('alchemy_reflect',35,2,target,false,{cap:standard(actor)*.8*q}); break;
    case 'resistance': apply('alchemy_resistance',25,3); break;
    case 'rescue': for(const unit of [...rules.allies(actor)].sort((a,b)=>a.hp/a.hpMax-b.hp/b.hpMax).slice(0,3)) heal(unit,unit.hpMax*.18*q); break;
    case 'chaos': { const rolled=Math.floor(rules.random()*3); if(rolled===0) await hit(1.4); else if(rolled===1) { await hit(.8); apply('slow',20,1,target,true); } else { heal(actor,actor.hpMax*.25*q); await hit(.5); } break; }
    case 'defer': if(rules.status(target,'alchemy_defer')) return { consumed:false,message:'已有未结清的延迟偿伤，请等待偿还。' }; apply('alchemy_defer',30,2,target,false,{damage:0,cap:target.hpMax*.2}); break;
    default: {
      if(effect.healPct||effect.restoreMpPct||effect.heal||effect.restoreMp) heal(target,target.hpMax*Number(effect.healPct??0)/100+Number(effect.heal??0),target.mpMax*Number(effect.restoreMpPct??0)/100+Number(effect.restoreMp??0));
      if(effect.cleanse) await cleanse(target,true,Infinity);
      const targets=effect.targetScope==='all'?rules.enemies(actor):[target];
      if(effect.throwable) await rules.areaDamage(targets, async victim => { await direct(rules,actor,victim,Math.max(actor.attack,actor.magic)*effect.throwable!.damageScale,effect.throwable!.element,targets.length===1); changed=true; });
      const status=effect.status;
      if(status) for(const victim of targets) {
        if(victim.hp<=0) continue;
        const hard=['stun','alchemy_confusion'].includes(status.code);
        if(hard) {
          if(victim.boss&&(victim.state.memory.alchemyHardSuccess||Number(victim.state.memory.alchemyHardRetry??0)>rules.turn)) continue;
          if(!victim.boss&&Number(victim.state.memory.alchemyHardUntil??0)>=rules.turn) continue;
          changed=true;
          const chance=clamp(Number(status.chance??100),0,100)/100 * (victim.boss?bossControlChanceMultiplier:1);
          if(rules.random()<chance) { buff(rules,actor,victim,status.code==='stun'?'alchemy_stun':'confusion',1,victim.boss?1:status.turns,true); if(victim.boss) victim.state.memory.alchemyHardSuccess=1; victim.state.memory.alchemyHardUntil=rules.turn+(victim.boss?1:status.turns)+1; }
          else { if(victim.boss) victim.state.memory.alchemyHardRetry=rules.turn+2; rules.log.push(`　➥【${victim.name}】抵抗了药剂控制。`); }
          continue;
        }
        if(effect.target==='enemy'&&(status.chance!==undefined||['bind','imbalance'].includes(status.code))){
          changed=true;
          const probability=clamp(Number(status.chance??100),0,100)/100*(victim.boss&&['bind','imbalance'].includes(status.code)?bossControlChanceMultiplier:1);
          if(rules.random()>=probability){rules.log.push(`　➥【${victim.name}】抵抗了药剂效果。`);continue;}
        }
        const map:Record<string,string[]>={regeneration:['alchemy_regeneration'],mana_regeneration:['alchemy_mana_regeneration'],barrier:['reduction'],battle_cry:['attack','magic'],precision:['accuracy'],critical_focus:['crit_bonus'],sprint:['speed'],alchemy_guard:['defense','magic_defense'],alchemy_evasion:['evasion'],burn:['burn'],bind:['slow'],exposed:['exposed'],imbalance:['accuracy_down','evasion_down']};
        for(const code of map[status.code]??[])apply(code,status.value,status.turns,victim,effect.target==='enemy',['alchemy_regeneration','alchemy_mana_regeneration'].includes(code)?{start:rules.turn+(victim.state.memory.actedTurn===rules.turn?1:0)}:undefined);
      }
    }
  }
  if(!changed) return { consumed:false,message:'当前没有可生效的目标、恢复缺口或可替换效果，未消耗道具。' };
  if(effect.perBattleLimit) actor.state.memory[key]=Number(actor.state.memory[key]??0)+1;
  if(rules.log.length===start) rules.log.push(`　➥【${target.name}】获得【${name}】的效果。`);
  return { consumed:true,message:rules.log.splice(start).join('\n') };
};

export const alchemyIncoming = async (rules:CombatRules,source:RuleUnit,target:RuleUnit,amount:number,magic:boolean,skill:boolean) => {
  if(skill) {
    const action=Number(source.state.memory.alchemyAction??0);
    const wind=await rules.consume(source,'alchemy_wind');
    if(wind) { source.state.memory.alchemyWindAction=action; source.state.memory.alchemyWindValue=wind.value; }
    if(source.state.memory.alchemyWindAction===action) amount*=1+Number(source.state.memory.alchemyWindValue??0)/100;
  }
  const mirror=magic?await rules.consume(target,'alchemy_reflect'):undefined;
  if(mirror) { const reduction=amount*mirror.value/100; amount-=reduction; await reaction(rules,target,source,Math.min(data(mirror).cap??0,reduction*.5),'镜面折光'); }
  const deferred=rules.status(target,'alchemy_defer');
  if(deferred) { const payload=data(deferred); const delayed=Math.max(0,Math.min(amount*deferred.value/100,(payload.cap??0)-(payload.damage??0))); amount-=delayed; payload.damage=(payload.damage??0)+delayed; deferred.data=JSON.stringify(payload); }
  return amount;
};
export const alchemyAfterHit = async (rules:CombatRules,source:RuleUnit,target:RuleUnit,damage:number,element:string) => {
  await alchemySaveLife(rules,target);
  if(damage<=0) return;
  const thorn=rules.status(target,'alchemy_thorns'); if(thorn&&rules.once(target,'alchemyThorn')) await reaction(rules,target,source,data(thorn).damage??0,'铁木反刺');
  const echo=rules.status(target,'alchemy_echo'); if(echo) { const payload=data(echo); payload.damage=Math.min(payload.cap??0,(payload.damage??0)+damage*.2); echo.data=JSON.stringify(payload); }
  const seed=rules.status(target,'alchemy_seed');
  if(seed) { const payload=data(seed); if(payload.last!==rules.turn) { payload.last=rules.turn; payload.hits=(payload.hits??0)+1; seed.data=JSON.stringify(payload); if(payload.hits>=3) { await rules.consume(target,'alchemy_seed'); await reaction(rules,sourceOf(rules,seed,source),target,payload.damage??0,'蓄雷引爆','雷'); } } }
  const oil=element==='火'?await rules.consume(target,'alchemy_oil'):undefined;
  if(oil) { await reaction(rules,sourceOf(rules,oil,source),target,data(oil).damage??0,'油膜引爆','火'); if(target.hp>0) rules.add(target,'burn',3,2,source,true); }
};
export const alchemySaveLife = async (rules:CombatRules,target:RuleUnit) => {
  if(target.hp>0||target.state.memory.alchemyRevived) return;
  const effect=await rules.consume(target,'alchemy_last_life'); if(!effect) return;
  target.state.memory.alchemyRevived=1; target.hp=1; healing(rules,target,target.hpMax*effect.value/100); rules.log.push(`　&灰烬续生&【${target.name}】抵住了致命伤。`);
};
export const alchemyEndTurn = async (rules:CombatRules) => {
  for(const unit of rules.units) {
    if(unit.hp<=0) continue;
    for(const effect of unit.state.statuses.filter(effect=>effect.until>=rules.turn)) {
      const payload=data(effect);
      if(['alchemy_regeneration','alchemy_mana_regeneration'].includes(effect.code)&&(payload.start??0)<=rules.turn) healing(rules,unit,effect.code==='alchemy_regeneration'?unit.hpMax*effect.value/100:0,effect.code==='alchemy_mana_regeneration'?unit.mpMax*effect.value/100:0);
      if(effect.until!==rules.turn) continue;
      if(effect.code==='alchemy_defer') { const damage=Math.floor(payload.damage??0); unit.hp=Math.max(0,unit.hp-damage); rules.log.push(`　&延迟偿伤&【${unit.name}】偿还 ${damage} 点生命。`); await alchemySaveLife(rules,unit); }
      if(effect.code==='alchemy_echo') await reaction(rules,sourceOf(rules,effect,unit),unit,payload.damage??0,'回声蓄伤');
    }
  }
};
export const consumeAlchemyChant = async (rules:CombatRules,unit:RuleUnit,turns:number) => turns>0&&await rules.consume(unit,'alchemy_chant')?Math.max(0,turns-1):turns;
