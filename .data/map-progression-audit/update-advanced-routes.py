from pathlib import Path
import re
root=Path('E:/猫拉瑞亚/FantasyFinal')
p=root/'src/game/advanced-profession.config.ts'
s=p.read_text(encoding='utf-8')
s="import { advancedProfessionRoutes, type AdvancedProfessionRoute } from './advanced-profession-routes.config';\n"+s
s=s.replace('  first: { title:', '  route: AdvancedProfessionRoute;\n  first: { title:',1)
s=s.replace("const ridge = '岩脊山麓';\n",'')
# code, region, first targets/text/story, second targets/text/story. Retain each mentor's titles, counts and final trial.
rows=[
('bulwark_guard','ridge_foothills',['mountain_beetle'],'山甲虫','加雷斯把缺角旧盾交给你：去岩脊山麓挡住山甲虫的冲撞，替旧护送队清出停靠点。',['stonevein_golem'],'石脉傀儡','清理封住护送道的石脉傀儡，带回岩脊核心修补旧盾。守护要从站稳缺口开始。'),
('ironbreaker','ridge_foothills',['cliff_ram'],'峭壁羊怪','诺尔让你去岩脊山麓观察峭壁羊怪的发力，在冲撞的间隙练习收锋。',['rubble_beast'],'碎岩兽','劈开旧矿道上的碎岩兽，收集岩脊核心辨认受力回音。剑豪只出必要的一剑。'),
('aegis_priest','ridge_foothills',['stonevein_golem','cliff_ram'],'石脉傀儡或峭壁羊怪','赫克托托你守住岩脊山麓的旧石阶，击退冲撞祷墙的石脉傀儡与峭壁羊怪。',['mountain_beetle','rubble_beast'],'山甲虫或碎岩兽','清走祷墙缺口附近的山甲虫与碎岩兽，带回岩脊核心嵌入裂隙，为后来者撑起屏障。'),
('elementalist','rediron_pass',['rediron_wisp'],'赤铁矿灵','森让你前往赤铁山道，平息赤铁矿灵的热流，辨认火元素与矿脉之间失衡的节拍。',['furnace_beetle'],'炉心甲虫','驱离积热的炉心甲虫，收集炉心赤晶作为元素回声样本。把热流引回边界，而非制造新的灾害。'),
('spellblade','rediron_pass',['magnet_golem'],'磁石傀儡','维恩要你走进赤铁山道，在磁石傀儡的牵制中练习贴近施咒，让脚步和咒文同时落定。',['cinder_boar'],'焦岩野猪','迎击焦岩野猪的突进，带回炉心赤晶校准剑上的热流。近咒的分寸，是在冲击到来前完成一击。'),
('trickster_ranger','rediron_pass',['ore_raider'],'盗矿团弩手','维拉让你去赤铁山道追查被剪断的索道，击退盗矿团弩手，判断每一道射线的落点。',['mine_hexer'],'矿坑咒师','清除干扰索道机关的矿坑咒师，收集炉心赤晶稳定触发器。用预先安排的路线把危险引开。'),
('spirit_summoner','mistalgae_marsh',['watermirror_siren'],'水镜妖','米娅请你前往雾藻湿地，驱散水镜妖的虚假呼唤，让走散的灵息找到自己的回应。',['mistalgae_mass'],'雾藻团','清理堵住旧巢的雾藻团，带回雾沼心保存微弱灵息。为守望、疗愈与追击各留一个位置。'),
('venomancer','mistalgae_marsh',['bog_midge'],'毒沼蜉蝣','宁让你走进雾藻湿地，清除毒沼蜉蝣，辨别风里毒性的扩散方向。',['marsh_crocodile'],'沼泽鳄','驱离药草水道中的沼泽鳄，收集雾沼心配制解毒药液。学会用毒，也必须留下解法。'),
('saint_healer','mistalgae_marsh',['reed_walker'],'芦苇行尸','玛蕾请你把白枝带到雾藻湿地的旧营地，清除芦苇行尸，为伤者留出归路。',['bogfire_wisp'],'沼火鬼灯','熄灭诱人迷途的沼火鬼灯，带回雾沼心为营地续灯。治疗也意味着让等待的人看见天明。'),
('war_lord','dark_forest_deep',['goblin_drummer'],'哥布林战鼓手','奥伦让你深入幽暗密林深处，击败哥布林战鼓手，辨认敌阵如何通过鼓声聚散。',['goblin_shieldbearer'],'哥布林盾卫','击退封锁林间道路的哥布林盾卫，带回哥布林耳朵作为清路凭证，让同伴能并肩前进。'),
('nightblade','dark_forest_deep',['goblin_trapper'],'哥布林陷阱师','前往幽暗密林深处，清除哥布林陷阱师，练习在暴露之前辨认埋伏。',['goblin_archer'],'哥布林弓箭手','绕过林间射线，击败哥布林弓箭手，并带回哥布林耳朵证明退路已清。夜刃的锋芒应结束危险。'),
('dawn_inquisitor','dark_forest_deep',['goblin_priest'],'哥布林祭司','索拉让你深入幽暗密林深处，击败哥布林祭司，驱散遮住旅人归路的阴影。',['goblin_mage'],'哥布林法师','清除阻断晨光的哥布林法师，带回哥布林耳朵作为凭证。让第一束光落在需要方向的人身上。')]
# Actual nightblade code is verified below; reject any missing profession.
for code,region,fc,ft,fs,sc,st,ss in rows:
    pattern=r"  \{ code: '"+code+r"'.*?(?=\n)"
    m=re.search(pattern,s)
    if not m: raise RuntimeError('Missing profession '+code)
    line=m.group()
    line=line.replace(' first: {',f' route: advancedProfessionRoutes.{region}, first: {{',1)
    for phase,codes,text,story in [('first',fc,ft,fs),('second',sc,st,ss)]:
        pat=phase+r": \{ title: ('[^']*'), story: `[^`]*`, targetCodes: \[[^\]]*\], targetText: '[^']*'"
        repl=phase+": { title: "+re.search(pat,line).group(1)+", story: `"+story+"`, targetCodes: ["+','.join(repr(c) for c in codes)+"], targetText: '"+text+"'"
        line=re.sub(pat,lambda _:repl,line,count=1)
    s=s[:m.start()]+line+s[m.end():]
p.write_text(s,encoding='utf-8')
