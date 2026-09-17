from pathlib import Path
p=Path('src/response/adventure.ts')
with p.open('r',encoding='utf-8',newline='') as f:s=f.read()
old='已获得一次地图兑换机会，可到公会集结区兑换已开放的 Lv.30 及以下地图。'
assert s.count(old)==1
s=s.replace(old,'已补齐世界树、草原环带、幽暗密林与百纳镇的保底通行地图；另有一次免费自选额度，可到公会集结区领取已开放的 Lv.30 及以下地图。')
with p.open('w',encoding='utf-8',newline='') as f:f.write(s)
