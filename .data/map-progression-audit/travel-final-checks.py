from pathlib import Path
p=Path('src/game/adventure.service.ts');s=p.read_text(encoding='utf-8')
s=s.replace('partyRows[0] ? Number(partyRows[0].party_id) : undefined','partyRows[0] ? String(partyRows[0].party_id) : undefined')
s=s.replace('partyRows[0]?Number(partyRows[0].party_id):undefined','partyRows[0]?String(partyRows[0].party_id):undefined')
start=s.index('export const completeTravel =');end=s.index('export const settleDueTravels',start)
block=s[start:end];old='const character = await characterFor(qqUserId); const [rows] ='
assert old in block
block=block.replace(old,"const identity = await characterFor(qqUserId);\n    await connection.execute('SELECT id FROM characters WHERE id=? FOR UPDATE',[identity.id]);\n    const character = await characterFor(qqUserId,connection); const [rows] =",1)
s=s[:start]+block+s[end:];p.write_text(s,encoding='utf-8')
