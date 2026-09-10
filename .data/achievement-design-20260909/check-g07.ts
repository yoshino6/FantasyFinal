import {createConnection} from 'mysql2/promise';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module'; const {parseDocument,parse,stringify}=createRequire(import.meta.url)('yaml');
const doc=parseDocument(readFileSync('alemon.config.yaml','utf8'));const cfg=parse(stringify(doc.getIn(['FantasyFinal','database'])??doc.get('mysql')));
const db=await createConnection({host:cfg.host,port:Number(cfg.port??3306),user:cfg.user,password:cfg.password,database:cfg.database});
try{const [rows]=await db.query("SELECT a.achievement_id,a.name_snapshot,a.created_at,d.bot_id,RIGHT(d.group_id,6) AS group_suffix,d.status,d.attempts,d.updated_at FROM achievement_announcements a JOIN achievement_deliveries d ON d.achievement_id=a.achievement_id WHERE a.achievement_id='ACH_G07' ORDER BY d.bot_id,d.group_id");writeFileSync('.data/achievement-design-20260909/g07-announcement-audit.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));}finally{await db.end();}

