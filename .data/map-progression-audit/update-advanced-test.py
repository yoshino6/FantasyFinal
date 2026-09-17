from pathlib import Path
p=Path('test/talent-journey.integration.test.ts')
s=p.read_text(encoding='utf-8')
old="await win('rubble_beast')"
assert s.count(old)==2
p.write_text(s.replace(old,"await win('stonevein_golem')"),encoding='utf-8')
