import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {parse}=createRequire(import.meta.url)('yaml');
import {createConnection} from 'mysql2/promise';
const config=parse(readFileSync('alemon.config.yaml','utf8'));const d=config.FantasyFinal?.database??config.mysql;
const c=await createConnection({...d,port:Number(d.port??3306)});
try{
 console.log((await c.query("SELECT code,item_type,item_category,is_tradeable,stackable,trade_price,effect_json FROM item_definitions WHERE code IN ('energy_core','magic_gear','flesh_atrium','shadow_filament')"))[0]);
 console.log((await c.query('SHOW INDEX FROM player_secondary_professions'))[0]);
 console.log((await c.query("SELECT code,rarity,item_category FROM item_definitions WHERE code IN ('living_wood','meteor_iron','ridge_core','fire_crystal','marsh_heart')"))[0]);
 console.log((await c.query("SELECT i.code,i.rarity,i.item_category,i.trade_price,s.buy_price,s.is_active FROM guild_shop_items s JOIN item_definitions i ON i.id=s.item_id WHERE i.item_type='consumable' LIMIT 12"))[0]);
}finally{await c.end();}
