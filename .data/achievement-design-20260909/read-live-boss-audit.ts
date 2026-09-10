import {createConnection} from 'mysql2/promise';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const y=createRequire(import.meta.url)('yaml'),doc=y.parseDocument(readFileSync('alemon.config.yaml','utf8'));const cfg=y.parse(y.stringify(doc.getIn(['FantasyFinal','database'])??doc.get('mysql')));
const c=await createConnection({host:cfg.host,port:Number(cfg.port??3306),user:cfg.user,password:cfg.password,database:cfg.database});
try{const [rows]=await c.query('SELECT d.id,d.boss_code,d.difficulty,d.definition_json,COUNT(a.identity_key) AS completed_count FROM achievement_boss_definitions d LEFT JOIN achievement_completions a ON a.achievement_id=d.id GROUP BY d.id,d.boss_code,d.difficulty,d.definition_json');writeFileSync('.data/achievement-design-20260909/live-boss-audit.json',JSON.stringify(rows,null,2));console.log('已落库Boss定义数：'+(rows as any[]).length);}finally{await c.end();}
