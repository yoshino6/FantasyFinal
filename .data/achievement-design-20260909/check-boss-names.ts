import {createConnection} from 'mysql2/promise';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module'; const {parseDocument,parse,stringify}=createRequire(import.meta.url)('yaml');
const doc=parseDocument(readFileSync('alemon.config.yaml','utf8'));const cfg=parse(stringify(doc.getIn(['FantasyFinal','database'])??doc.get('mysql')));
const db=await createConnection({host:cfg.host,port:Number(cfg.port??3306),user:cfg.user,password:cfg.password,database:cfg.database});
try{const [rows]=await db.query("SELECT code,name FROM monster_templates WHERE monster_class='boss' ORDER BY level,code");writeFileSync('.data/achievement-design-20260909/boss-names-current.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));}finally{await db.end();}

