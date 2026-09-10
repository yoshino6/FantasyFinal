from pathlib import Path
import json, re
root=Path(__file__).resolve().parents[2]
def edit(path, old, new):
    p=root/path; s=p.read_text(encoding='utf-8'); assert old in s, (path,old[:100]); p.write_text(s.replace(old,new),encoding='utf-8')
edit('src/game/combat-rule-registry.ts','import { hasTalent, talentDirectFactor,','import { talentOpeningShield, talentState, hasTalent, talentDirectFactor,')
edit('src/game/combat-rule-registry.ts','    damage = Math.max(0, damage);\n    const bottleAbsorbed', '''    damage = Math.max(0, damage);
    talentOpeningShield(target);
    const stoneAbsorbed = hasTalent(target, 'G17') ? Math.min(damage, talentState(target).stoneShield ?? 0) : 0;
    if (stoneAbsorbed) { talentState(target).stoneShield! -= stoneAbsorbed; damage -= stoneAbsorbed; }
    const bottleAbsorbed''')
edit('src/game/combat-rule-registry.ts','return bottleAbsorbed + absorbed + legacyAbsorbed','return stoneAbsorbed + bottleAbsorbed + absorbed + legacyAbsorbed')
edit('src/game/combat-rule-registry.ts',"    if(source.side!==target.side&&target.opening?.pve&&hasOpeningDivine(target,'divine_g17'))reduction=100-(100-reduction)*2/3;\n",'')
edit('src/game/combat-rule-registry.ts','absorbed = 0, extra = false) {\n    talentAfterHit','absorbed = 0, extra = false, magic = false) {\n    await talentAfterHit')
edit('src/game/combat-rule-registry.ts','absorbed,element,extra);','absorbed,element,extra,magic);')
edit('src/game/combat-rule-registry.ts','element, isSkill, absorbed, extra); return true;','element, isSkill, absorbed, extra, magic); return true;')
edit('src/game/adventure.service.ts','Boolean(skillId), shield.absorbed, extraTurn);',"Boolean(skillId), shield.absorbed, extraTurn, kind !== '物理');")
edit('src/game/pvp.service.ts','Boolean(actorCooldowns?.__extraTurn));','Boolean(actorCooldowns?.__extraTurn), Boolean(magic));')
edit('src/game/talent-battle.service.ts',"import { hasTalent, talentState }", "import { hasTalent, talentState, talentOpeningShield }")
edit('src/game/talent-battle.service.ts','        if(old.fireUsed)state.fireUsed=true;', '''        if(old.stoneGranted){state.stoneGranted=true;state.stoneShield=Math.min(state.stoneShield??Infinity,Number(old.stoneShield??0));}
        if(old.fireUsed)state.fireUsed=true;''')
edit('src/game/talent-battle.service.ts','    if(hasSupport.has(Number(row.id)))state.noAid=false;','    talentOpeningShield(unit);\n    if(hasSupport.has(Number(row.id)))state.noAid=false;')
edit('src/game/talent-battle.service.ts','poorBroken:state.poorBroken};','poorBroken:state.poorBroken,stoneGranted:state.stoneGranted,stoneShield:state.stoneShield};')
edit('src/game/talent-battle.service.ts','    if(unit.state.memory.talentQuickMove)data.flags.quickMove=true;if(unit.state.memory.talentWeatherMove)data.flags.weatherMove=true;if(unit.state.memory.talentRestMark)data.flags.restMark=true;','    if(unit.state.memory.talentRestMark)data.flags.restMark=true;')
edit('src/game/talent-exploration.ts',"  let factor=talent.number==='G02'?.5:talent.number==='X07'?.6:1;\n  if(talent.number==='X02'&&data.flags.quickMove){factor=.5;delete data.flags.quickMove;}\n  if(talent.number==='X10'&&data.flags.weatherMove){factor=.5;delete data.flags.weatherMove;}","  let factor=talent.number==='G02'||talent.number==='X02'?.5:1;")
edit('src/game/adventure.service.ts'," * (await (await import('./divine-effects')).hasDivine(pool,Number(character.id),'divine_g01') ? 3 : 1)",'')
edit('src/game/adventure.service.ts',"(await(await import('./divine-effects')).hasDivine(connection,Number(character.id),'divine_g01')?3:1)*",'')
edit('src/game/adventure.service.ts',"      const divine=await import('./divine-effects');\n      if(await divine.hasDivine(connection,Number(member.id),'divine_g01')&&await divine.spendDivineUse(connection,Number(member.id),'g01_recovery'))hp=Math.max(1,Number(member.hp_max));\n",'')
edit('src/game/adventure.service.ts',"encumbrance(attributes, weight, ignoreWeightPenalty,talent?.number==='X07'?1.8:1)","encumbrance(attributes, weight, ignoreWeightPenalty)")
edit('src/response/talent.ts',"    if(panel.name==='鲲鹏血脉')md.addNewline().addButton('[沿来路返回起点]',{data:'/天赋返程',autoEnter:false});\n",'')
# Remove the retired service as well as its UI, so stale commands cannot keep its effects.
for path, marker in [('src/game/talent.service.ts','export const talentReturnDestination='),('src/response/talent.ts','export const talentReturnHandler=')]:
    p=root/path;s=p.read_text(encoding='utf-8');assert marker in s;p.write_text(s[:s.index(marker)].rstrip()+'\n',encoding='utf-8')
edit('src/index.ts',"appGroup.use('天赋返程',()=>import('./response/talent').then(module=>({default:module.talentReturnHandler})));\n",'')
changes={
 'G01':('饮血之躯','本人正常攻击行动结束时，恢复该次物理直击实际HP损失的50%；每次最多恢复自身20%最大HP','不限每场触发次数；魔法、持续伤害、反伤、追加伤害及额外行动不吸血；护盾吸收与溢出伤害不计，回复受禁疗和治疗修正影响。','敌人的伤口，是你尚未熄灭的心跳。'),
 'G17':('磐心壁垒','开战获得50%最大HP的独立护盾；每完成一次有效正常行动，补充5%最大HP的盾量，上限50%','与其他护盾并存；额外行动、受控跳过和无效行动不补盾；同一敌人撤退重进保留剩余盾量，不刷新开场盾。','风暴能磨去岩壁，却追不上山岳重新生长的速度。'),
 'X02':('青龙血脉','雷元素精通+50；非战斗普通移动耗时永久×0.50','无需命中或储存次数；不改变战斗行动速度、传送和道路准入条件。','雷霆经过你的经络时，像是回到了故乡。'),
 'X03':('玄武血脉','最大HP×1.50；承受敌方直击并存活时，将本次实际HP损失的50%反震给攻击者','护盾吸收、溢出和自损不计；反震不重复计算攻防、暴击或元素，不触发吸血、命中、反伤或击败成长。','山岳在你的背后合拢，潮水在你的心前停下。'),
 'X07':('鲲鹏血脉','本人直击×1.25；本人正常攻击直接击败合格敌人，恢复25%最大HP，且本场直击倍率增加0.25，最多升至×2.50','合格敌人为与本人等级差不超过5级的敌人本体；每个生命实例只记一次，部位、降服、队友击杀和额外伤害不计；成长于战斗结束清空，回复受治疗修正且不超过25%最大HP。','每吞下一场胜利，你的羽翼便遮住更远的天空。'),
 'X10':('应龙血脉','风元素精通+50；每次正常攻击行动结束，对命中且仍存活的敌人追加该次有效直击HP损失50%的风压伤害','多段先合计，同一敌人本体与部位只取最高一份；风压不再重复计算攻防、暴击和元素，不触发新命中、吸血或反伤；额外行动不触发。','你振翼时，风暴便有了形状。')
}
p=root/'src/game/talent.config.ts';s=p.read_text(encoding='utf-8')
for code,(name,effect,limits,flavour) in changes.items():
    pattern=r'  \{\n    "code": "(?:divine|talent)_'+code.lower()+r'",.*?\n  \}'
    m=re.search(pattern,s,re.S);assert m,code;obj=json.loads(m.group());obj.update(name=name,summary=effect,description=effect+'\n'+limits,flavour=flavour)
    s=s[:m.start()]+'  '+json.dumps(obj,ensure_ascii=False,indent=2).replace('\n','\n  ')+s[m.end():]
p.write_text(s,encoding='utf-8')
p=root/'docs/初始天赋重设计方案V2.md';s=p.read_text(encoding='utf-8');lines=s.splitlines()
for i,line in enumerate(lines):
    for code,(name,effect,limits,flavour) in changes.items():
        if line.startswith('| '+code+' '):
            if '“' in line:lines[i]=f'| {code} {name} | “{flavour}”{effect} | {limits} |'
            else:lines[i]=f'| {code} {name} | 重做 | {effect}。{limits} |'
s='\n'.join(lines)+'\n';s=s.replace('G01～G18同编号承接新同名天赋','G01～G18保留原内部编号承接对应新版天赋（名称可调整）')
s+='\n## 15. 2026-09-09 战斗持续收益修订\n\n以上六项以目录最新条目为准。G01删除休息与战败恢复；G17删除固定减伤，使用可再生护盾；X03固定减伤改为反震；X02不再依赖战斗攒移动次数；X07删除移动、负重和返程效果；X10删除防御后移动与天气优惠。战斗效果沿用本方案PVE边界。\n'
p.write_text(s,encoding='utf-8')
edit('test/opening-effects.test.ts',"G15/G17只进入敌对PVE直击；额外来源、PVP和80%减伤上限隔离","G15隔离额外来源与PVP；G17已删除旧直击减伤")
edit('test/opening-effects.test.ts',"r.incoming(b,a,1000,'无',false,true),666)","r.incoming(b,a,1000,'无',false,true),1000)")
