from pathlib import Path
p=Path('src/game/adventure.service.ts')
s=p.read_text(encoding='utf-8')
s="import { runNegotiation, readNegotiationReplay, assertNoNegotiation, assertMonsterNotNegotiating, closeNegotiationSession, type NegotiationCommand, type NegotiationDrop, type NegotiationResult } from './negotiation.service';\nimport { hiddenAttributesFor } from './hidden-attributes.service';\nimport { teamLuckMultiplier, weightedRecipient, dropBatches, moodDropMultiplier } from './negotiation-rules';\n"+s
start=s.index('export const chooseTarget = '); end=s.index('\nexport const queueAmbush',start)
block=s[start:end]
block=block.replace('export const chooseTarget = async (qqUserId: string, spawnId: number, ambush = false, retreatPosition?: CombatRetreatPosition) => withTransaction(async connection => {','const chooseTargetInTransaction = async (connection: PoolConnection, qqUserId: string, spawnId: number, ambush = false, retreatPosition?: CombatRetreatPosition, prepaid?: Record<string, boolean>) => {')
block=block.replace('await characterFor(qqUserId)', 'await characterFor(qqUserId, connection)')
block=block.replace('  for (const member of members) await recalculateCharacterStats', '  for (const member of members) await assertNoNegotiation(connection, Number(member.id));\n  for (const member of members) await recalculateCharacterStats',1)
block=block.replace('  // 每一场新的遭遇', '  await assertMonsterNotNegotiating(connection, spawns.map(spawn => Number(spawn.id)));\n  // 每一场新的遭遇',1)
block=block.replace('const staminaEligibility = await consumeEncounterStamina(connection, members);','const staminaEligibility = prepaid ? new Map(members.map(member => [Number(member.id), member.npc_code ? true : Boolean(prepaid[String(member.id)])])) : await consumeEncounterStamina(connection, members);')
block=block.rstrip(); assert block.endswith('});'); block=block[:-3]+'};\nexport const chooseTarget = async (qqUserId: string, spawnId: number, ambush = false, retreatPosition?: CombatRetreatPosition) => withTransaction(connection => chooseTargetInTransaction(connection, qqUserId, spawnId, ambush, retreatPosition));\n'
s=s[:start]+block+s[end:]
start=s.index('const negotiationFailureOpening = ');end=s.index('export const encounterAction = ',start);s=s[:start]+s[end:]
start=s.index("  if (action === 'persuade') {",s.index('export const encounterAction'))
end=s.index("  throw new Error('未知的遇战操作。');",start)
s=s[:start]+"  if (action === 'persuade') {\n    const view = await negotiateEncounter(qqUserId, spawnId, { type: 'view' });\n    if (view.kind !== 'ongoing') return view.text;\n    const result = await negotiateEncounter(qqUserId, spawnId, { type: 'talk', sessionId: view.sessionId, revision: view.revision });\n    return result.text;\n  }\n"+s[end:]
start=s.index('const negotiationChance = ');end=s.index('\nconst ',s.index('const negotiationSuccessText',start)+10);s=s[:start]+s[end:]
start=s.index('export const combatAction = ');end=s.index('\n});',start)+4
block=s[start:end]
sig=block[:block.index(' => withTransaction(async connection => {')]
block=block.replace(sig+' => withTransaction(async connection => {',sig.replace('export const combatAction = async (','const combatActionInTransaction = async (connection: PoolConnection, ').replace('hiddenAutomatic = false)', 'hiddenAutomatic = false, skipPlayerTurn = false)')+' => {',1)
block=block.replace('await characterFor(qqUserId)', 'await characterFor(qqUserId, connection)',1)
block=block.replace("  if (!session) throw new Error('当前不在战斗中。');", "  if (!session) throw new Error('当前不在战斗中。');\n  if (!skipPlayerTurn) await assertNoNegotiation(connection, Number(character.id));",1)
block=block.replace('  if (!aliveMembers.every(member => member.pending_action))', '  if (skipPlayerTurn) for (const member of aliveMembers) member.pending_action = { type: \'attack\' };\n  if (!aliveMembers.every(member => member.pending_action))',1)
block=block.replace('  for (const turn of turns) {\n', "  for (const turn of turns) {\n    if (skipPlayerTurn && turn.kind !== 'target') continue;\n",1)
block=block.rstrip(); assert block.endswith('});');block=block[:-3]+'};\n'+sig+' => withTransaction(connection => combatActionInTransaction(connection, qqUserId, action, slot, skillId, itemId, deviceSkillCode, targetKind, targetId, automaticChant, hiddenTicket, hiddenAutomatic));\n'
s=s[:start]+block+s[end:]
# Luck affects the original roll expectation and ownership independently.
s=s.replace('  const randomRecipient = () => rewardMembers[random(0, rewardMembers.length - 1)]!;', "  const luckByMember = new Map<number, number>();\n  for (const member of rewardMembers) luckByMember.set(Number(member.id), (await hiddenAttributesFor(connection, Number(member.id))).luck);\n  const luckMultiplier = teamLuckMultiplier([...luckByMember.values()]);\n  const randomRecipient = () => weightedRecipient(rewardMembers, member => luckByMember.get(Number(member.id)) ?? 0);")
s=s.replace('  // 每个掉落条目只掷一次：组队只提高成功率，不增加基础掉落总量。', '  // 幸运逐人乘算，超出 100% 的期望转为额外掉落批次；掉落参照者保持均匀抽取。')
s=s.replace('    const recipient = randomRecipient(); const modifiers = modifiersByMemberId.get(Number(recipient.id))!;', '    const recipient = rewardMembers[random(0, rewardMembers.length - 1)]!; const modifiers = modifiersByMemberId.get(Number(recipient.id))!;')
s=s.replace('    if (Math.random() > Math.min(1, baseDropChance * globalDrop * (1 + traitDropBonus + partyDropBonus + omniscientDropBonus + elixirDropBonus) + modifiers.dropBonus)) continue;','    const batches = dropBatches(baseDropChance * globalDrop * (1 + traitDropBonus + partyDropBonus + omniscientDropBonus + elixirDropBonus) + modifiers.dropBonus, luckMultiplier);')
s=s.replace('    for (let index = 0; index < dropQuantity(drop); index += 1) await grantDrop(randomRecipient(), resolvedDropCode(drop, Number(target.level)), 1);','    for (let batch = 0; batch < batches; batch++) {\n      const quantity = dropQuantity(drop);\n      for (let index = 0; index < quantity; index++) await grantDrop(randomRecipient(), resolvedDropCode(drop, Number(target.level)), 1);\n    }')
p.write_text(s,encoding='utf-8')
