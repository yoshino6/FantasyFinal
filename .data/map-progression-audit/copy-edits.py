from pathlib import Path
def replace(path, old, new):
    p=Path(path)
    with p.open('r',encoding='utf-8',newline='') as f: text=f.read()
    assert text.count(old)==1, (path,old[:90],text.count(old))
    with p.open('w',encoding='utf-8',newline='') as f: f.write(text.replace(old,new))
replace('src/game/adventure.service.ts','return { id: party.id, name: party.name, leaderId:', 'return { id: party.id, name: party.name, story: await isForestStoryParty(pool, party.id), leaderId:')
replace('src/game/adventure.service.ts', "throw new Error('只有队长可以委任队长。'); const [members]", "throw new Error('只有队长可以委任队长。'); await assertPartyNotStory(connection, rows[0].party_id); const [members]")
replace('src/game/adventure.service.ts', "throw new Error('只有队长可以修改队伍名。'); const value", "throw new Error('只有队长可以修改队伍名。'); await assertPartyNotStory(connection, rows[0].party_id); const value")
replace('src/game/adventure.service.ts', "[]>('SELECT p.id,p.name,c.name AS leader_name,COUNT(pm.character_id) AS count FROM parties p JOIN characters c ON c.id=p.leader_character_id JOIN party_members pm ON pm.party_id=p.id GROUP BY p.id,p.name,c.name ORDER BY p.created_at DESC LIMIT 20')", "[]>(`SELECT p.id,p.name,c.name AS leader_name,COUNT(pm.character_id) AS count FROM parties p JOIN characters c ON c.id=p.leader_character_id JOIN party_members pm ON pm.party_id=p.id WHERE NOT ${forestStoryPartyCondition} GROUP BY p.id,p.name,c.name ORDER BY p.created_at DESC LIMIT 20`)")
replace('src/game/main-quest.service.ts','“我先去找唯薇安。她或许知道该怎么让我进入森林，找到梨子喵。”\'','“我先去找唯薇安。她或许知道该怎么让我进入森林，找到梨子喵。”\\n\\n莫妮卡把幽暗密林深处的地图和沿途商道图交到我手上：“地图不占你登记时的自选额度，先收好，再去找人。”\\n\\n公会已核对并补齐本阶段通行地图；若地图存放在家园仓库，请先取回背包。\'')
replace('src/game/floating-leaf.service.ts','**【获得地图】幽暗密林深处。**','**【通行地图】已核对并补齐世界树、草原环带、幽暗密林、百纳镇与密林深处地图，不消耗登记额度。仓库已有的地图请取回背包。**')
replace('src/response/advanced-profession.ts','.addText(`目标：在岩脊山麓击败【${profession.first.targetText}】 ${Number(active.story_kills)}/${profession.first.requiredKills} 次。`);','.addText(`目标：在岩脊山麓击败【${profession.first.targetText}】 ${Number(active.story_kills)}/${profession.first.requiredKills} 次。`).addNewline().addNewline().addBlockquote(\'导师把砾风石滩与岩脊山麓的路线图交给你：“从世界树向西，沿草原、石滩进入山麓。地图不扣登记额度，仓库已有的记得带上。”\');')
