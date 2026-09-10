from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[2]
p=root/'src/game/talent.config.ts';source=p.read_text(encoding='utf-8');start=source.index('= [',source.index('export const talentDefinitions'))+2;entries,length=json.JSONDecoder().raw_decode(source[start:])
rules={
'A01':'普通攻击与主动攻击技能有效；追加伤害不重复触发。',
'A02':'不放大药剂、吸血、固定比例回生与溢出回血。',
'A03':'不减少HP、颗粒、能量或天赋次数；固定转赠MP不享受折扣。',
'A06':'仇恨只影响敌人的目标选择，不再次增加伤害。',
'A08':'防御占用正常行动；效果不叠多层，下一次主动攻击后消耗增伤。',
'B01':'不缩短寻怪、传送、剧情护送；仍须遵守道路和地图边界。',
'C07':'第5次额外奖励最多为前4次平均基础经验的6倍；固定奖励不推进计数。',
'D01':'仅限战斗开始前；共享心情上限、失败黑名单及拒收物留在背包的规则照常。',
'E03':'料理的种类与覆盖上限不变。',
'F06':'提前结束战斗会丢失未到期伤害；复制不再计算暴击与元素，不触发新命中，不复制部位传导，无法伤害已死目标。',
'G03':'不额外放大面板双攻；不强制改变外形与种族。',
'G09':'混沌核最多1枚、战后消散；余震不再计算暴击或元素，不触发新核，不复制部位传导。',
'I02':'代用最多承担本批普通材料总标准价值的50%；实际扣除替代材料，不生成可领取的目标材料。主材、稀有物、任务物、核心及催化剂不可代用；成品、品质、成功率和熟练度基数不变。',
'I10':'限单人单敌、非Boss且允许降服的普通怪物；不触发击杀吸血、吞噬或交涉入队。达到阈值后停止其承受的剩余段数、追加伤害和持续伤害，每个生命实例只结算一次。'
}
for entry in entries:
    if entry['number'] in rules:entry['description']=entry['summary']+'\n'+rules[entry['number']]
    if not entry['implemented']:entry['description']=re.sub(r'[，；]?\s*(?:完整规则)?(?:详见|见)\d+(?:\.\d+)*','',entry['description'])
p.write_text(source[:start]+json.dumps(entries,ensure_ascii=False,indent=2)+source[start+length:],encoding='utf-8')
files=[p for p in (root/'src/game').glob('*.ts') if p.name!='talent.config.ts']
contents={p:p.read_text(encoding='utf-8') for p in files}
coverage={}
for entry in entries:
    candidates=[]
    for file,s in contents.items():
        literal=re.search(r'''['"]'''+entry['number']+r'''['"]''',s)
        if entry['code'] in s or (literal and (file.name.startswith('talent') or re.search(r'hasTalent\([^\n]*'+entry['number'],s))):candidates.append(file.relative_to(root).as_posix())
    coverage[entry['number']]={'name':entry['name'],'code':entry['code'],'status':'connected' if entry['implemented'] else 'deferred','entrypoints':candidates}
(root/'.data/talent-implementation-20260908/coverage.json').write_text(json.dumps(coverage,ensure_ascii=False,indent=2),encoding='utf-8')
lines=['# 新版天赋第一期实装记录','',
'目录统一为100项，内部代码已全部采用分类编号。A～I共90项接入本期玩法；J类10项特殊成长路线可查阅，服务入口拒绝选择，按原要求留待下一期。旧18项神技表已从生成内容中移除，不再接受旧代码或旧目录命令。','',
'## 本轮最终调整','',
'| 编号 | 天赋 | 当前效果 |','| --- | --- | --- |']
for code in ['G01','G02','F02','F03','F07','F10']:
    e=next(e for e in entries if e['number']==code);lines.append(f"| {code} | {e['name']} | {e['summary']} |")
lines+=['','## 编号与生效入口','',
'数据库代码使用talent_分类英文_两位序号。绑定天赋仍加入技能列表，普通技能专精与天赋身份分开处理。下表“已接入”表示存在实际结算入口，不代表完成了全部客户端与生产服场景验收。','',
'| 编号 | 名称 | 内部代码 | 状态 | 主要源码 |','| --- | --- | --- | --- | --- |']
for e in entries:
    c=coverage[e['number']];paths='、'.join(f"`{name}`" for name in c['entrypoints'][:3]) if e['implemented'] else '仅目录与方案'
    lines.append(f"| {e['number']} | {e['name']} | `{e['code']}` | {'已接入' if e['implemented'] else '下一期'} | {paths} |")
lines+=['','## 使用与数据迁移','',
'- `/天赋目录`查阅100项；`/天赋`管理自身天赋的可选模式、记录与领取。所有QQ正文蓝色链接仅填入命令。','- 新增定点勘察、雾石调查、公开材料委托和家园活木种植，作为探索、社交与生产天赋的实际入口；入门调查与材料委托的基础经验按不超过Lv.10计算。','- 通用技能专精每级固定乘算：过充、强效每级×1.06，瞬息冷却/吟唱基数每级×0.94，前三项蓝耗每级×1.12，节能每级蓝耗×0.88。各方向独立按1、2、3……SP升级。','- 初始化先迁移天赋代码，再重算面板：原地保留技能数据库主键与持有关系，更新祝福身份。新旧技能定义冲突时回滚并报告，避免误删角色数据；迁移可重复执行。','- 磐心开场盾按敌人生命实例记录，撤退重进不刷新。击败成长、反伤、物理吸血与复制伤害区分入口，额外行动与部位不能重复领取相关收益。','- 战斗天赋沿用PVE边界；PVP重建基础面板，避免血量、精通以及天赋料理效果渗入。百步之外按技能远程标记判定，现有战场没有独立格距限制，页面明确说明。','',
'## 本地验证','',
'- `npx tsc --noEmit`通过。','- 开局、目录QQ转换、天赋战斗、普通技能专精、交涉、Boss部位及炼金相关测试98项通过。','- 独立临时MySQL数据库测试13项通过，包含原地编号迁移、重复执行、面板还原、同敌重进盾量、经验与材料账本、自产来源、旧操作重放；测试库完成后删除。','- 未对实际运营数据库执行迁移，未重启或部署服务，未做QQ客户端端到端实机验收。',
'','完整规则与特殊成长路线见[初始天赋重设计方案V2](./初始天赋重设计方案V2.md)。','']
(root/'docs/新版天赋第一期实装记录.md').write_text('\n'.join(lines),encoding='utf-8')
missing=[key for key,value in coverage.items() if value['status']=='connected' and not value['entrypoints']]
print(json.dumps({'catalog':len(entries),'enabled':sum(e['implemented'] for e in entries),'without_explicit_source':missing}))
