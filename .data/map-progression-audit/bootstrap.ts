import { createPool } from 'mysql2/promise';
import { initializeSchema } from '../../src/database/bootstrap';
async function main() {
  const pool = createPool({ host:'127.0.0.1',port:33317,user:'root',database:'ff_map_audit',charset:'utf8mb4',connectionLimit:3 });
  const admin = createPool({host:'127.0.0.1',port:33317,user:'root'});
  await admin.query('CREATE DATABASE IF NOT EXISTS ff_map_audit CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await admin.end();
  // Isolated fixture only: legacy unique skill names collide with newer Boss codes.
  const originalQuery = pool.query.bind(pool);
  pool.query = (async (sql: any, values?: any) => {
    if (typeof sql === 'string' && sql.startsWith('INSERT INTO skill_definitions')) {
      for (const match of sql.matchAll(/\('([^']+)','([^']+)',/g))
        await pool.execute('UPDATE skill_definitions SET name=CONCAT(LEFT(name,50),\'·\',id) WHERE name=? AND code<>?', [match[2],match[1]]);
    }
    if(typeof sql==='string' && sql.startsWith('INSERT INTO skill_effects') && sql.includes('threehead_')) {
      const [skills]:any=await originalQuery('SELECT code FROM skill_definitions');
      const known=new Set(skills.map((s:any)=>s.code));
      sql=sql.split('\n').filter(line=>{const code=line.match(/SELECT id FROM skill_definitions WHERE code='([^']+)'/);if(code&&!known.has(code[1])){console.log('Fixture omitted absent skill effect:',code[1]);return false;}return true;}).join('\n').replace(/,\s*ON DUPLICATE/, '\n ON DUPLICATE');
    }
    return originalQuery(sql, values);
  }) as any;
  try { await initializeSchema(pool); console.log('AUDIT_SCHEMA_READY'); } finally { await pool.end(); }
}
main().then(()=>process.exit(0)).catch(e=>{ console.error(e);process.exit(1); });
