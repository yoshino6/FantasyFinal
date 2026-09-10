from pathlib import Path
p=Path('src/game/adventure.service.ts');s=p.read_text(encoding='utf-8')
def replace(old,new):
 global s
 assert s.count(old)==1,(old[:90],s.count(old))
 s=s.replace(old,new)
s="import { hasTalent, talentState, talentBeginAction, talentEndAction, talentCommitAction, talentCanPaySkill, talentPaySkill, talentFinishFire } from './talent-combat';\n"+s
replace("type: 'attack' | 'skill' | 'item' | 'escape' | 'device' | 'device_charge'", "type: 'attack' | 'skill' | 'item' | 'escape' | 'device' | 'device_charge' | 'defend'")
replace("    const canRuleAct = turn.kind === 'spirit' || await rules.beforeAction(ruleUnit(turn.kind, turn.id));", "    const talentActor = turn.kind === 'spirit' ? undefined : ruleUnit(turn.kind, turn.id);\n    if(talentActor)await talentBeginAction(rules,talentActor,extraTurn);\n    try {\n    const canRuleAct = turn.kind === 'spirit' || await rules.beforeAction(ruleUnit(turn.kind, turn.id));")
replace("  }\n  for (const pet of combatAutomatons) {", "    } finally { if(talentActor)await talentEndAction(rules,talentActor); }\n  }\n  const talentBattleEnded = targets.every(target=>target.is_defeated) || members.every(member=>member.is_defeated) || aliveMembers.every(member=>(jsonObject(member.pending_action) as unknown as PendingAction).type==='escape');\n  if(talentBattleEnded)for(const unit of rules.units)talentFinishFire(unit);\n  for (const pet of combatAutomatons) {")
replace("      const choice = jsonObject(member.pending_action) as unknown as PendingAction;", "      const choice = jsonObject(member.pending_action) as unknown as PendingAction;\n      if(choice.type==='defend'){const unit=ruleUnit('member',Number(member.id));talentCommitAction(unit,'defend');rules.add(unit,'reduction',50,1,unit);log.push(`➤${member.name}主动防御。`);continue;}")
replace("        const resourceRequirement = advancedResourceRequirementForSkill(skill.code);", "        const harmfulTalentSkill=['physical','magic'].includes(skill.category);\n        if(!casting&&!talentCanPaySkill(unit,harmfulTalentSkill)){log.push('　➥焚命者的HP不足，未支付资源。');continue;}\n        const resourceRequirement = advancedResourceRequirementForSkill(skill.code);")
replace("        member.current_mp = Math.max(0, Number(member.current_mp) - manaCost);", "        if(!casting)talentPaySkill(unit,harmfulTalentSkill);\n        member.current_mp = Math.max(0, Number(member.current_mp) - manaCost);")
replace("        const chant = casting ? 0 : await consumeAlchemyChant(rules, ruleUnit('member', Number(member.id)), specialized.chant);", "        const prayer=hasTalent(unit,'J04')&&Number(skill.chant_turns??0)>=1;\n        const chant = casting ? 0 : (await consumeAlchemyChant(rules, unit, specialized.chant))+(prayer?1:0);")
replace("        if (casting) delete unit.state.cast;", "        if (casting) delete unit.state.cast;\n        talentCommitAction(unit,harmfulTalentSkill?'skill':'support',skill.damage_type,skill.target_scope!=='全体',skill.category==='magic'||skill.damage_type==='刺击',prayer);")
replace("      const modifiers = persistentArtifact; const swordAction", "      if(choice.type==='attack')talentCommitAction(ruleUnit('member',Number(member.id)),'attack','斩击',true,false);\n      const modifiers = persistentArtifact; const swordAction")
replace("openingSpellHealingFactor(source);", "openingSpellHealingFactor(source,ally);")
p.write_text(s,encoding='utf-8');print('Wired normal/extra action lifetime and native skill commitment.')
