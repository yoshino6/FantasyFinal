from pathlib import Path
p=Path('src/game/girl-gratitude.service.ts');s=p.read_text(encoding='utf-8')
for name in ['teleportToWorldTree','returnToBainaTown']:
 old=f'export const {name} = (qqUserId: string) => withTransaction(async connection => {{'
 start=s.index(old);end=s.index('\n});',start)
 body=s[start+len(old):end]
 new=f'export const {name} = (qqUserId: string) => withTransaction(connection => {name}In(connection, qqUserId));\nexport const {name}In = async (connection: PoolConnection, qqUserId: string) => {{'+body+'\n};'
 s=s[:start]+new+s[end+4:]
p.write_text(s,encoding='utf-8')
p=Path('src/game/opening-guild.service.ts');s=p.read_text(encoding='utf-8')
old='export const openingTransport=async(user:string,destination:string)=>withTransaction(async c=>{';start=s.index(old);end=s.index('\n});',start)
body=s[start+len(old):end]
new='export const openingTransport=async(user:string,destination:string)=>withTransaction(c=>openingTransportIn(c,user,destination));\nexport const openingTransportIn=async(c:PoolConnection,user:string,destination:string)=>{'+body+'\n};'
s=s[:start]+new+s[end+4:];p.write_text(s,encoding='utf-8')
