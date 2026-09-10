from pathlib import Path
import re, json, subprocess
root=Path('E:/猫拉瑞亚/FantasyFinal')
work=root/'.data/talent-implementation-20260908'
(work/'snapshots').mkdir(parents=True, exist_ok=True)
for folder in ['src','test']:
 for p in (root/folder).rglob('*.ts'):
  target=work/'snapshots'/p.relative_to(root)
  if not target.exists():
   target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(p.read_bytes())
s=(root/'docs/初始天赋重设计方案V2.md').read_text(encoding='utf-8')
entries=[]
for n,title,body in re.findall(r'### 3\.(\d+) ([^\n]+)\n([\s\S]*?)(?=\n### 3\.|\n## 4\.)',s):
 if int(n)==10: continue
 group=title.split('：')[0]
 for code,name,effect,boundary in re.findall(r'^\| ([A-Z]\d{2}) ([^|]+)\| ([^|]+)\| ([^|]+)\|$',body.split('\n#### ')[0],re.M):
  flavour=re.search('“([^”]+)”',effect)
  summary=re.sub(r'^“[^”]+”[。；]?','',effect).strip().replace('**','')
  entries.append(dict(code=('divine_' if code.startswith('G') else 'talent_')+code.lower(),number=code,name=name.strip(),group=group,summary=summary,description=summary+'\n'+boundary.strip().replace('**',''),flavour=flavour.group(1) if flavour else '命运从此多了一种可能。'))
assert len(entries)==90 and len({e['number'] for e in entries})==90
text="// Initial talents use a separate catalog; story generation must never overwrite these definitions.\nexport const talentGroups = ['战斗','探索','成长','社交','生产','血脉','体魄','孤注','奇异'] as const;\nexport type TalentGroup = typeof talentGroups[number];\nexport type TalentDefinition = { code: string; number: string; name: string; group: TalentGroup; summary: string; description: string; flavour: string };\nexport const divineSkillDefinitions: readonly TalentDefinition[] = "+json.dumps(entries,ensure_ascii=False,indent=2)+";\nexport const talentByCode = new Map(divineSkillDefinitions.map(t => [t.code,t]));\nexport const talentCode = (input: string) => divineSkillDefinitions.find(t => t.code === input || t.number.toLowerCase() === input.toLowerCase())?.code;\n"
(root/'src/game/talent.config.ts').write_text(text,encoding='utf-8')
(work/'coverage.json').write_text(json.dumps({e['number']:{'name':e['name'],'status':'pending','entrypoints':[]} for e in entries},ensure_ascii=False,indent=2),encoding='utf-8')
print('Captured source baseline; generated independent 90-talent catalog without U routes.')
