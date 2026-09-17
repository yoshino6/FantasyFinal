import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureMapRegions, progressionMapRegions, progressionMapReceipt } from '../src/game/progression-map.service';

test('登记保底与剧情地图分阶段发放，不顺带开放全部低危或高危地图', () => {
  const state={adventurer_registered:1,opening_state:'completed',region_code:'frost_dragon_inn',realm_stage:1,goblin_stage:0,advanced_trial:0};
  assert.deepEqual(progressionMapRegions({...state,adventurer_registered:0}),[]);
  assert.deepEqual(progressionMapRegions({...state,opening_state:'choice'}),[]);
  assert.deepEqual(progressionMapRegions(state),['world_tree','worldtree_meadow','dark_forest','baina_town','frost_dragon_inn']);
  assert.ok(progressionMapRegions({...state,goblin_stage:1}).includes('dark_forest_deep'));
  assert.ok(progressionMapRegions({...state,realm_stage:3}).includes('dark_forest_deep'));
  const trial=progressionMapRegions({...state,advanced_trial:1,advanced_profession_code:'bulwark_guard'});
  assert.ok(trial.includes('gravelwind_shore')&&trial.includes('ridge_foothills'));
  assert.ok(!trial.includes('rediron_pass')&&!trial.includes('mistalgae_marsh')&&!trial.includes('fallenstar_swamp'));
});

test('背包和家园仓库均判重，零库存可补，关闭与主人地图不能发放', async () => {
  const writes:any[]=[];
  let locked=false;
  const items:Record<string,any>={held:{id:1,name:'已有',is_enabled:1,is_owner_only:0},stored:{id:2,name:'仓库',is_enabled:1,is_owner_only:0},empty:{id:3,name:'补发',is_enabled:1,is_owner_only:0},closed:{id:4,name:'停用',is_enabled:0,is_owner_only:0},private:{id:5,name:'私有',is_enabled:1,is_owner_only:1}};
  const c={execute:async(sql:string,p:any[])=>{
    if(sql==='SELECT id FROM characters WHERE id=? FOR UPDATE'){locked=true;return [[{id:1}]];}
    assert.ok(locked);
    if(sql.startsWith('SELECT i.id,i.name,r.is_enabled'))return [[items[p[0]]].filter(Boolean)];
    if(sql.startsWith('SELECT 1 FROM player_inventory'))return [p[1]===1?[{}]:[]];
    if(sql.startsWith('SELECT 1 FROM player_home_storage_items'))return [p[1]===2?[{}]:[]];
    if(sql.startsWith('INSERT')){writes.push({sql,p});return [{affectedRows:1}];}
    throw new Error(sql);
  }} as any;
  const result=await ensureMapRegions(c,1,['held','stored','empty','empty','closed','private','absent']);
  assert.deepEqual(result,{granted:['补发'],stored:['仓库'],unavailable:['停用','私有','absent']});
  assert.equal(writes.length,2);
  assert.deepEqual(writes[0].p,[1,3,1,0,1]);
  assert.match(progressionMapReceipt(result),/取回背包/);
});
