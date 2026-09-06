/** 只读导出现有道具定义；不加载正式数据库初始化。 */
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createConnection} from 'mysql2/promise';
import {itemUsePolicy} from '../src/game/item-use-policy';
const require=createRequire(import.meta.url);const config=require('yaml').parse(readFileSync('alemon.config.yaml','utf8'));const database=config.FantasyFinal?.database??config.mysql;
const connection=await createConnection({...database,connectTimeout:5000});
try{
  await connection.query('SET TRANSACTION READ ONLY');await connection.beginTransaction();
  const[rows]=await connection.query<any[]>("SELECT id,code,name,item_category,required_level,effect_json,description FROM item_definitions WHERE item_type='consumable' ORDER BY code");
  const items=rows.map(row=>{const item={...row,effect_json:typeof row.effect_json==='string'?JSON.parse(row.effect_json):row.effect_json??{}};return{...item,usePolicy:itemUsePolicy(item)};});
  writeFileSync('docs/现存道具使用审计.json',JSON.stringify({date:new Date().toISOString(),items},null,2)+'\n');
  const groups=new Map<string,{count:number;examples:string[]}>();for(const item of items){const key=Object.keys(item.effect_json).filter(key=>!['alchemyOutput','quality','requiredLevel','tacticPotency'].includes(key)).sort().join(',')||'无效果字段';const group=groups.get(key)??{count:0,examples:[]};group.count++;if(group.examples.length<4)group.examples.push(`${item.code}:${item.name}`);groups.set(key,group);}
  console.log(JSON.stringify({count:items.length,groups:Object.fromEntries(groups)},null,2));await connection.rollback();
}finally{await connection.end();}
