from pathlib import Path
import re,json
root=Path(__file__).resolve().parents[2]
p=root/'src/game/talent.config.ts';source=p.read_text(encoding='utf-8')
entries=[json.loads(m.group()) for m in re.finditer(r'  \{\n    "code":.*?\n  \}',source,re.S)]
assert len(entries)==90
groups=['战斗','探索','成长','社交','生产','血脉','体魄','孤注','奇异','？？？']
keys=['combat','exploration','growth','social','production','bloodline','physique','gambit','peculiar','path']
doc=(root/'docs/初始天赋重设计方案V2.md').read_text(encoding='utf-8')
for m in re.finditer(r'^\| (U\d{2}) ([^|]+) \| ([^|]+) \| ([^|]+) \|$',doc,re.M):
    number,name,effect,note=[v.strip() for v in m.groups()]
    if any(entry['number']==number for entry in entries):continue
    entries.append(dict(code='talent_'+number.lower(),number=number,name=name,group='？？？',summary=effect,description=effect+'\n'+note,flavour='连女神也无法替你走完的道路。'))
assert len(entries)==100
short={};full={};counts={g:0 for g in groups}
for entry in entries:
    group=entry['group'];index=groups.index(group);counts[group]+=1;n=counts[group]
    old_number,old_code=entry['number'],entry['code']
    entry['number']=chr(65+index)+f'{n:02d}';entry['code']=f'talent_{keys[index]}_{n:02d}';entry['implemented']=index<9
    short[old_number]=entry['number'];full[old_code]=entry['code']
assert all(n==10 for n in counts.values())
(root/'.data/talent-implementation-20260908/number-map.json').write_text(json.dumps(dict(short=short,full=full),ensure_ascii=False,indent=2),encoding='utf-8')
# Full persisted codes are unambiguous; short IDs are only rewritten in talent modules and talent calls.
full_pattern=re.compile('|'.join(re.escape(code) for code in sorted(full,key=len,reverse=True)))
short_pattern=re.compile(r'(?<![A-Za-z0-9_])('+ '|'.join(short)+r')(?![A-Za-z0-9_])')
for directory in ['src','test']:
    for file in (root/directory).rglob('*.ts'):
        if file==p or file.name=='opening-content.generated.ts':continue
        s=file.read_text(encoding='utf-8');updated=full_pattern.sub(lambda m:full[m.group()],s)
        if file.name.startswith('talent'):
            updated=short_pattern.sub(lambda m:short[m.group()],updated)
        else:
            updated=re.sub(r"(hasTalent\([^\n]*?,\s*['\"])([A-Z]\d{2})(['\"])",lambda m:m[1]+short.get(m[2],m[2])+m[3],updated)
            updated=re.sub(r"(\.number\s*[!=]==?\s*['\"])([A-Z]\d{2})(['\"])",lambda m:m[1]+short.get(m[2],m[2])+m[3],updated)
        updated=updated.replace('divineSkillDefinitions','talentDefinitions')
        if updated!=s:file.write_text(updated,encoding='utf-8')
header='''// The only initial-talent catalog: ten categories, ten entries each.
export const talentGroups = %s as const;
export type TalentGroup = typeof talentGroups[number];
export type TalentDefinition = { code: string; number: string; name: string; group: TalentGroup; summary: string; description: string; flavour: string; implemented: boolean };
export const talentDefinitions: readonly TalentDefinition[] = '''%json.dumps(groups,ensure_ascii=False)
footer=''';
export const selectableTalents = talentDefinitions.filter(t => t.implemented);
export const talentByCode = new Map(talentDefinitions.map(t => [t.code,t]));
export const talentCode = (input: string) => talentDefinitions.find(t => t.code === input || t.number.toLowerCase() === input.toLowerCase())?.code;
'''
p.write_text(header+json.dumps(entries,ensure_ascii=False,indent=2)+footer,encoding='utf-8')
# Remove the obsolete generated 18-entry catalog. Story routes remain untouched.
p=root/'src/game/opening-content.generated.ts';s=p.read_text(encoding='utf-8');marker='export const divineSkillDefinitions =';assert marker in s;p.write_text(s[:s.index(marker)].rstrip()+'\n',encoding='utf-8')
p=root/'src/game/talent-combat.ts';s=p.read_text(encoding='utf-8');line=next(line for line in s.splitlines() if line.startswith('export const hasTalent ='))
s=s.replace(line,"export const hasTalent = (unit: RuleUnit, id: string) => !unit.companion && unit.opening?.pve === true && unit.opening.divines.includes(talentCode(id) ?? '');")
s="import { talentCode } from './talent.config';\n"+s;p.write_text(s,encoding='utf-8')
# An explicit migration map is not accepted as a command alias.
legacy={old:new for old,new in full.items() if not old.startswith('talent_u')}
(root/'src/database/talent-code-map.ts').write_text('/** One-time stored-data migration only; never use these as command aliases. */\nexport const retiredTalentCodes: Readonly<Record<string,string>> = '+json.dumps(legacy,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
doc=short_pattern.sub(lambda m:short[m.group()],doc)
doc=doc.replace('旧G01～G18各出现一次；保留18项、新增82项。','统一采用新版分类编号，不再保留旧神技目录。')
doc+='\n## 16. 统一天赋编号\n\n新版目录固定100项：A战斗、B探索、C成长、D社交、E生产、F血脉、G体魄、H孤注、I奇异、J？？？，每类01～10。内部代码使用talent_分类英文_两位序号。旧编号只在数据迁移表中出现，不再作为查询或选择别名。J类可查阅方案，本期尚不能选择或获得效果；其余90项接入玩法。\n'
(root/'docs/初始天赋重设计方案V2.md').write_text(doc,encoding='utf-8')
