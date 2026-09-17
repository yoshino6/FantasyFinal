from pathlib import Path
root=Path('E:/猫拉瑞亚/FantasyFinal')
def edit(file, changes):
 p=root/file;s=p.read_text(encoding='utf-8')
 for a,b in changes:
  if a not in s: raise RuntimeError(file+' missing '+a)
  s=s.replace(a,b)
 p.write_text(s,encoding='utf-8')
edit('src/game/advanced-profession.config.ts', [('哥布林陷阱师','哥布林网罗工兵'),('哥布林耳朵','哥布林耳')])
edit('src/game/advanced-profession-routes.config.ts',[('哥布林耳朵','哥布林耳')])
edit('src/game/advanced-profession.service.ts',[
 ('ridgeCore','materialQuantity'),
 ("i.code=\\'ridge_core\\' LIMIT 1', [character.id]", "i.code=? LIMIT 1', [character.id, profession.route.materialCode]"),
 ("i.code=\\'ridge_core\\' FOR UPDATE', [character.id]", "i.code=? FOR UPDATE', [character.id, profession.route.materialCode]"),
 ('个【岩脊核心】','个【${profession.route.materialName}】'),
 ('consumedCore:profession.second.materialCount','materialCode:profession.route.materialCode,consumedMaterial:profession.second.materialCount')])
edit('src/game/career-quest.service.ts',[
 ('const [[quests], [completed], [cores]] = await Promise.all([','const [[quests], [completed]] = await Promise.all(['),
 ("[character.id]),\n    pool.execute<(RowDataPacket & { quantity: number })[]>(`SELECT pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code='ridge_core' LIMIT 1`, [character.id])", "[character.id])"),
 ("character.region_code === 'ridge_foothills'",'character.region_code === profession.route.regionCode'),
 ("{ label: '[前往 岩脊山麓]', command: '/前往 -221 0 0' }",'{ label: `[前往 ${profession.route.name}]`, command: `/前往 ${profession.route.x} ${profession.route.y} 0` }'),
 ('在岩脊山麓击败','在${profession.route.name}击败'),
 ('    const quantity = Number(cores[0]?.quantity ?? 0);',"    const [cores] = await pool.execute<(RowDataPacket & { quantity: number })[]>('SELECT pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code=? LIMIT 1', [character.id, profession.route.materialCode]);\n    const quantity = Number(cores[0]?.quantity ?? 0);"),
 ('收集岩脊核心：','收集${profession.route.materialName}：')])
edit('src/response/advanced-profession.ts',[
 ('ridgeCore','materialQuantity'),
 ('在岩脊山麓击败','在${profession.route.name}击败'),
 (".addBlockquote('导师把砾风石滩与岩脊山麓的路线图交给你：“从世界树向西，沿草原、石滩进入山麓。地图不扣登记额度，仓库已有的记得带上。”')",'.addBlockquote(`导师为你核对${profession.route.name}及沿途地图。已开放且缺少的地图直接补入背包，不扣登记额度或贡献点；仓库已有的请取回。`)'),
 ('目标：击败【${profession.second.targetText}', '目标：在${profession.route.name}击败【${profession.second.targetText}'),
 ('提交岩脊核心 ${materialQuantity}', '提交${profession.route.materialName} ${materialQuantity}')])
edit('src/game/progression-map.service.ts',[
 ("import type { PoolConnection", "import { advancedProfessionByCode } from './advanced-profession.config';\nimport type { PoolConnection"),
 ('advanced_trial: number;', 'advanced_trial: number; advanced_profession_code?: string | null;'),
 ("if (character.advanced_trial) { regions.add('gravelwind_shore'); regions.add('ridge_foothills'); }", "if (character.advanced_trial && character.advanced_profession_code) {\n    const profession = advancedProfessionByCode(character.advanced_profession_code);\n    for (const code of profession?.route.maps ?? []) regions.add(code);\n  }"),
 ('AS advanced_trial\n', 'AS advanced_trial,\n    (SELECT profession_code FROM player_advanced_profession_quests WHERE character_id=c.id AND stage IN (1,2,3) ORDER BY stage DESC,profession_code ASC LIMIT 1) AS advanced_profession_code\n')])
edit('src/game/advanced-profession.dialogue.ts', [('岩脊核心的冷光融入瓶底','雾沼心的冷光融入瓶底'),('岩脊核心嵌入新的机括','炉心赤晶嵌入新的机括')])
edit('test/progression-map.test.ts', [('...state,advanced_trial:1','...state,advanced_trial:1,advanced_profession_code:\'bulwark_guard\'')])
