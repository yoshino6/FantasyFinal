const fs = require('node:fs');
const yaml = require('yaml');
const mysql = require('mysql2/promise');
(async () => {
  const cfg = yaml.parse(fs.readFileSync('alemon.config.yaml', 'utf8'));
  const c = await mysql.createConnection(cfg.FantasyFinal?.database ?? cfg.mysql);
  const report = {capturedAt: new Date().toISOString(), mode: 'read-only', tables: {}, data: {}};
  try {
    await c.query('START TRANSACTION READ ONLY');
    for (const table of ['item_definitions','map_npcs','map_regions','monster_templates','shop_stock','npc_shop_items','resource_points','player_secondary_professions']) {
      const [cols] = await c.execute('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION', [table]);
      report.tables[table] = cols.map(x=>x.COLUMN_NAME);
    }
    const [items] = await c.query("SELECT id,code,name,item_type,item_category,rarity,required_level,effect_json FROM item_definitions WHERE required_level<=30 OR required_level IS NULL ORDER BY id");
    report.data.items = items;
    const [npcs] = await c.query('SELECT * FROM map_npcs ORDER BY id');
    report.data.npcs = npcs;
    const [regions] = await c.query('SELECT id,code,name FROM map_regions ORDER BY id');
    report.data.regions = regions;
    const [tables] = await c.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND (TABLE_NAME LIKE '%shop%' OR TABLE_NAME LIKE '%resource%' OR TABLE_NAME LIKE '%recipe%') ORDER BY TABLE_NAME");
    report.relatedTables = tables.map(x=>x.TABLE_NAME);
    await c.rollback();
    fs.writeFileSync('.data/xiandao-early-design-20260909/live-catalog.json', JSON.stringify(report,null,2));
    console.log(JSON.stringify({mode:report.mode,itemCount:items.length,npcCount:npcs.length,regionCount:regions.length,tables:report.tables,relatedTables:report.relatedTables},null,2));
  } finally { await c.end(); }
})().catch(e=>{console.error(e.code??e.message);process.exitCode=1;});
