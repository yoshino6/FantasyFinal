from pathlib import Path
def edit(path,pairs,imports=''):
 p=Path(path);s=p.read_text(encoding='utf-8')
 for old,new in pairs:
  assert s.count(old)==1,(path,old[:90],s.count(old));s=s.replace(old,new)
 p.write_text(imports+s,encoding='utf-8')
edit('src/game/adventure.service.ts',[
("options: { fixed?: boolean } = {}", "options: { fixed?: boolean; talent?: TalentRewardContext } = {}"),
("  const divineExperience = !options.fixed && await (await import('./divine-effects')).hasDivine(connection,Number(character.id),'divine_g12') ? 1.25 : 1;", "  let talentRoom=-Number(character.experience);for(let l=currentLevel;l<=levelCap;l++)talentRoom+=experienceRequiredForLevel(l);\n  const talentBase=rawExperience*(options.fixed?1:await globalExperienceMultiplier(connection));\n  const talentAward=options.fixed?talentBase:await talentExperience(connection,Number(character.id),talentBase,{...options.talent,remaining:Math.max(0,talentRoom)});"),
("Math.floor(rawExperience * (options.fixed ? 1 : await globalExperienceMultiplier(connection)) * divineExperience)","Math.floor(talentAward)"),
("const quantity = await resourceYield(connection, Number(mining.item_id), mining.code);", "const baseQuantity = await resourceYield(connection, Number(mining.item_id), mining.code);\n    const quantity = await talentGatherReward(connection,character,Number(mining.item_id),baseQuantity,resourceKindByCode(mining.code));"),
("    const seconds = Math.max(1, Math.ceil(distance / carry.movementSpeed * (await (await import('./divine-effects')).hasDivine(connection,Number(character.id),'divine_g02') ? .8 : 1)));", "    const seconds = Math.max(1, Math.ceil(distance / carry.movementSpeed * await talentMovementFactor(connection,character,{x,y,z,regionId:Number(character.current_region_id)})));"),
("hp=Math.max(1,Math.floor(Number(member.hp_max)*.5));", "hp=Math.max(1,Number(member.hp_max));"),
("  const heal = rawHeal ? receivedHealingAmount(rawHeal, (await modifiersFor(connection, Number(member.id))).healingReceivedPct) : 0;", "  let heal = rawHeal ? receivedHealingAmount(rawHeal, (await modifiersFor(connection, Number(member.id))).healingReceivedPct) : 0;"),
],"import { talentExperience, type TalentRewardContext } from './talent-rewards';\nimport { talentGatherReward, talentMovementFactor } from './talent-exploration';\n")
p=Path('src/game/adventure.service.ts');s=p.read_text(encoding='utf-8');s=s.replace("'divine_g01') ? 1.3 : 1", "'divine_g01') ? 3 : 1").replace("'divine_g01')?1.3:1", "'divine_g01')?3:1");p.write_text(s,encoding='utf-8')
edit('src/game/alchemist.service.ts',[("  let proficiency = level >= secondaryProfessionMaxLevel ? 0 : current.proficiency + Math.max(0, Math.round(amount));", "  amount=await talentProficiency(connection,characterId,amount,{profession:'alchemist'});\n  let proficiency = level >= secondaryProfessionMaxLevel ? 0 : current.proficiency + Math.max(0, Math.round(amount));")],"import { talentProficiency } from './talent-rewards';\n")
edit('src/game/blacksmith.service.ts',[("  let proficiency = level >= blacksmithMaxLevel ? 0 : current.proficiency + Math.max(0, Math.round(gained));", "  gained=await talentProficiency(connection,characterId,gained,{profession:'blacksmith'});\n  let proficiency = level >= blacksmithMaxLevel ? 0 : current.proficiency + Math.max(0, Math.round(gained));")],"import { talentProficiency } from './talent-rewards';\n")
edit('src/game/companion.service.ts',[("Math.min(.3,gate[1]*(divine?1.5:1))","Math.min(divine?.75:.3,gate[1]*(divine?3:1))"),("(divine.length?2.4:2)","(divine.length?6:2)"),("?1.2:1,pet.id]","?3:1,pet.id]")])
edit('src/game/divine-effects.ts',[("'divine_g06')?1.5:1","'divine_g06')?3:1"),("Math.min(200-await divineUses(connection,id,'g10_discount'),base-Math.ceil(base*.92))","Math.min(5000-await divineUses(connection,id,'g10_discount'),base-Math.ceil(base*.5))"),("'g10_discount',200,quote.discount","'g10_discount',5000,quote.discount")])
edit('src/game/negotiation.service.ts',[("let bonus=await(await import('./divine-effects')).hasDivine(connection,ctx.actorId,'divine_g08')?.2:0;","const talent=await (await import('./talent-data')).ownedTalent(connection,ctx.actorId);\n        let bonus=talent?.number==='G08'?2:talent?.number==='X08'?1:0;")])
print('Wired rewards, rest, travel, gathering, base social and legacy G buffs.')
