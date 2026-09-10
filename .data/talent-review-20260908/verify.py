from pathlib import Path
import re,json,math,hashlib

root=Path('E:/猫拉瑞亚/FantasyFinal');p=root/'docs/初始天赋重设计方案V2.md'
s=p.read_text(encoding='utf-8')
sections=re.findall(r'### 3\.(\d+) ([^\n]+)\n([\s\S]*?)(?=\n### 3\.|\n## 4\.)',s)
assert len(sections)==10
ids=[];rows={};counts={}
for n,title,body in sections:
 body=body.split('\n#### ')[0]
 matches=list(re.finditer(r'^\| ([A-Z]\d{2}) ([^|]+)\|[^\n]+',body,re.M))
 assert len(matches)==10,(title,len(matches))
 counts[n]=len(matches)
 for m in matches:
  assert len(m.group(0).split('|'))==5
  code=m.group(1);ids.append(code);rows[code]=m.group(0)
assert len(ids)==len(set(ids))==100
assert {f'G{i:02d}' for i in range(1,19)}<=set(ids)
for name in ['苍天霸体','先天道体','混沌黑体','荒古圣体']:
 assert any(name in r for r in rows.values())

review=s.split('## 11. 100项逐条复核结论',1)[1]
review_rows=re.findall(r'^\| ([A-Z]\d{2}) [^|]+\| (修订|保留) \| ([^\n]+)',review,re.M)
assert len(review_rows)==100 and {r[0] for r in review_rows}==set(ids)
assert sum(r[1]=='修订' for r in review_rows)==85
assert sum(r[1]=='保留' for r in review_rows)==15
assert all(len(r[2])>15 for r in review_rows)

pathparts=re.findall(r'#### 5\.13\.(\d+) (U\d{2}) [^\n]+\n([\s\S]*?)(?=\n#### 5\.13\.|\n### 5\.14)',s)
assert len(pathparts)==10
stage_names=[]
for _,code,body in pathparts:
 stages=re.findall(r'^\| (\d+) \| (\d+)～(\d+) \| ([^|]+) \| ([^|]+) \|',body,re.M)
 assert len(stages)==10,code
 for k,(stage,low,high,name,ritual) in enumerate(stages,1):
  assert (int(stage),int(low),int(high))==(k,10*(k-1)+1,10*k)
  assert name.strip() and ritual.strip()
  stage_names.append(name.strip())
 assert len({row[3].strip() for row in stages})==10
assert len(stage_names)==100
for code in [f'U{i:02d}' for i in range(1,11)]:
 assert re.search(rf'^### 5\.\d+ {code} ',s,re.M)
assert '替代**常规境界突破' in s
assert '专属状态与操作' in s and '普通经验升级流程' in s
assert '这些可作为个人任务章节名' not in s
assert '同时满足原境界' not in s
assert '每10级必须独行试炼' not in s
assert '前四次大试炼后达到r=5' not in s

expected={
 'G08':['×3.00'],'G04':['×3.00'],'G11':['×3.00'],'S05':['×5.00'],
 'J05':['×5.00','×0.75'],'J06':['×4.50','×3.60'],'J09':['×4.00','×0.70'],
 'Q08':['×3.50'],'G06':['数值增益×1.50','持续时间×3.00'],
 'C02':['×2.00','R/2'],'S01':['×4.00','正基础好感'],
 'Q02':['纸上借材','1∶1','50%'],'Q03':['×2.00','首次抽签前'],
 'J01':['×2.25'],'J02':['×2.00'],'J03':['×2.00'],
 'J04':['直击×3.00','治疗术×3.50'],'J07':['×2.00','队友治疗'],
 'J08':['×2.50','×1.25'],'J10':['×3.00','结束结算','余火不灭','2个本人正常回合','致命战斗伤害也可保命'],
 'C09':['经验的150%','熟练度的250%'],'X08':['前5次','×4.00','此后×1.00'],
}
for code,tokens in expected.items():
 assert all(token in rows[code] for token in tokens),(code,tokens)

calc={
 'risk_gather_expected':.8*4.5,
 'risk_craft_expected_relative_to_base_probability':.7*4,
 'one_sword_average_5_attacks':(5+.75*4)/5,
 'one_sword_average_17_attacks':(5+.75*16)/17,
 'route_roundtrip_efficiency':2/(.60+.25),
 'defend_then_attack_average':3/2,
 'delayed_four_plus_seven_average':(4+7)/5,
 'first_npc_four_average':(4+1.5*3)/4,
 'stacked_body_full_effective_hp':1/.93**8,
 'dot_body_half_mix_effective_hp':1/(.35*.5+.80*.5),
 'mixed_cost_factor':.4*.4+.6,
 'movement_40pct_of_trip_at_double_speed':1/(.6+.4/2),
 'end_solo_output':1.25+.15*5,
 'end_solo_effective_hp':1.10+.08*5,
 'end_god_production':2+.60*5,
 'end_dream_proficiency':3+.60*5,
}
targets=[3.6,2.8,1.6,1,2.35294117647,1.5,2.2,2.125,1.787,1.739,.76,1.25,2,1.5,5,6]
for actual,expected_value in zip(calc.values(),targets):assert abs(actual-expected_value)<.001,(actual,expected_value)
for k in range(1,11):
 r=1+4*(k-1)/9
 assert 1<=r<=5

economy_section=s.split('## 12. 收益类专项再次复核',1)[1].split('## 13.',1)[0]
economic_ids=re.findall(r'^\| ([A-Z]\d{2}) [^|]+\| (?:维持|回调|暂保|补充|扩展|纠正) \|',economy_section,re.M)
assert len(economic_ids)==len(set(economic_ids))==66
risk_section=s.split('### 13.1 逐项结论',1)[1].split('### 13.2',1)[0]
risk_ids=re.findall(r'^\| (J\d{2}) ',risk_section,re.M)
assert set(risk_ids)=={f'J{i:02d}' for i in range(1,11)} and len(risk_ids)==10
assert len(set(economic_ids)|set(risk_ids))==74
for code in ['J06','J09','Q08']:
 assert '×6.00' not in rows[code]
assert '×3.00' not in rows['J07']
assert rows['Q03'].count('×2.00')==2
assert '并按新包数量×3.00' not in s
assert '材料载运能力参考3倍' not in s
assert '险采与孤注制作成功产量均6倍' not in s
assert '如需保持原有加成需禁用所有治疗' not in s
assert '纸上借材' in s and '### 13.2 贫者之刃' in s
assert '### 13.4 J10 末日借火' in s
assert '此扣除保底不保护敌方伤害' not in s

extra_calc={
 'craft_baseline_profit':.8*100-60,
 'craft_risk_profit':.8*.7*4*100-60,
 'craft_profit_ratio':(.8*.7*4*100-60)/(.8*100-60),
 'stable_sealed_daily_units':100*3.5,
 'review_xp_5min':2.5*5/(5+5),
 'review_proficiency_5min':3.5*5/(5+5),
 'review_xp_20min':2.5*20/(20+5),
 'review_proficiency_20min':3.5*20/(20+5),
 'peek_expected_two_equal_chance_values':2*(max(50,100)+max(150,100))/2,
 'failed_material_expected_payment':1-(1-.8)*2/3,
 'sequential_forge_10_success_average':(4*10-3)/10,
 'full_supply_chain_material_limited':3*3.5,
 'poor_vs_10pct_accessory':2/1.1,
 'poor_vs_25pct_accessory':2/1.25,
 'poor_vs_40pct_accessory':2/1.4,
 'chant_damage_cycle_1':3*1/2,
 'chant_damage_cycle_2':3*2/3,
 'chant_damage_cycle_4':3*4/5,
 'solo_damage_per_mp':2.5/1.25,
 'chant_heal_cycle_1':3.5*1/2,
 'chant_heal_cycle_2':3.5*2/3,
 'chant_heal_cycle_4':3.5*4/5,
}
extra_targets=[20,164,8.2,350,1.25,1.75,2,2.8,250,.866667,3.7,10.5,1.81818,1.6,1.42857,1.5,2,2.4,2,1.75,2.333333,2.8]
assert len(extra_targets)==len(extra_calc)
for actual,wanted in zip(extra_calc.values(),extra_targets):assert abs(actual-wanted)<.001,(actual,wanted)
calc.update(extra_calc)
assert s.count('```')%2==0
assert not any(line.rstrip()!=line for line in s.splitlines())
for i,line in enumerate(s.splitlines(),1):
 if line.startswith('|'):assert line.endswith('|'),i

report={'document':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),
 'talents':100,'categories':10,'per_category':counts,'revised':85,'retained':15,
 'path_systems':10,'path_stage_names':100,'economic_reviews':66,'risk_reviews':10,'unique_supplemental_reviews':74,'arithmetic':calc,
 'scope':'Document structure and deterministic arithmetic only; no runtime, database, economic simulation or client verification.'}
(root/'.data/talent-review-20260908/verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'PASS: 100 talents / 10 per category; 100 review decisions; 10 paths / 100 stage names; 66 economic + 10 risk reviews; {len(calc)} arithmetic checks; Markdown tables and whitespace')
