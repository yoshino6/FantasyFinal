import {createConnection} from 'mysql2/promise';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module'; const {parseDocument,parse,stringify}=createRequire(import.meta.url)('yaml');
const doc=parseDocument(readFileSync('alemon.config.yaml','utf8'));const cfg=parse(stringify(doc.getIn(['FantasyFinal','database'])??doc.get('mysql')));
const db=await createConnection({host:cfg.host,port:Number(cfg.port??3306),user:cfg.user,password:cfg.password,database:cfg.database});
try{const [rows]=await db.query("SELECT d.boss_code,d.difficulty,COUNT(a.identity_key) AS completions FROM achievement_boss_definitions d LEFT JOIN achievement_completions a ON a.achievement_id=d.id WHERE d.boss_code IN ('scholar_ga','habadragon') GROUP BY d.boss_code,d.difficulty");writeFileSync('.data/achievement-design-20260909/boss-exclusion-audit.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));}finally{await db.end();}

