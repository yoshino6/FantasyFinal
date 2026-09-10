import {createConnection} from 'mysql2/promise';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module'; const {parseDocument,parse,stringify}=createRequire(import.meta.url)('yaml');
const doc=parseDocument(readFileSync('alemon.config.yaml','utf8'));const cfg=parse(stringify(doc.getIn(['FantasyFinal','database'])??doc.get('mysql')));
const db=await createConnection({host:cfg.host,port:Number(cfg.port??3306),user:cfg.user,password:cfg.password,database:cfg.database});
try{
 const {ids}=JSON.parse(readFileSync('.data/achievement-design-20260909/retired-achievements.json','utf8'));
 if(ids.length!==135||!ids.every((id:string)=>/^ACH_[A-L][0-9]{2}$/.test(id)))throw new Error('删减清单校验失败');
 await db.beginTransaction();
 const [rows]=await db.query("SELECT * FROM achievement_deliveries WHERE achievement_id IN (?) AND status IN ('pending','blocked','uncertain') FOR UPDATE",[ids]);
 writeFileSync('.data/achievement-design-20260909/retired-pending-announcements-before.json',JSON.stringify(rows,null,2));
 const [result]=await db.query<any>("UPDATE achievement_deliveries SET status='cancelled',updated_at=NOW() WHERE achievement_id IN (?) AND status IN ('pending','blocked','uncertain')",[ids]);
 await db.commit();console.log(JSON.stringify({cancelled:result.affectedRows}));
}catch(error){await db.rollback();throw error;}finally{await db.end();}
