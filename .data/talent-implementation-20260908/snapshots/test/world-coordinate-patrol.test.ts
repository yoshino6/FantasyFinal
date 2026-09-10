import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { pointBelongsToRegion, validWorldSitePoint, type WorldArea } from '../src/game/world-site-geometry';
import { dynamicWorldRegions } from '../src/game/world-dynamics.content';
import { buildPatrolEncounter, patrolKindFor, patrolObjective, patrolPositionMatches, type PatrolContext, type PatrolKind } from '../src/game/patrol-encounters';

const area = (id:number,danger:number,x0:number,x1:number,y0:number,y1:number):WorldArea => ({region_id:id,danger_level:danger,min_x:x0,max_x:x1,min_y:y0,max_y:y1,min_z:0,max_z:0});
test('地图：城镇覆盖林地时，不把城镇坐标当作密林入口',()=>{
  const areas=[area(1,1,-50,0,-200,-100),area(2,99,-35,-10,-190,-150)];
  const preferred={x:-25,y:-180,z:0};
  assert.equal(pointBelongsToRegion(areas,1,preferred),false);
  const actual=validWorldSitePoint(areas,1,preferred);
  assert.equal(pointBelongsToRegion(areas,1,actual),true);
  assert.notDeepEqual(actual,preferred);
});
test('地图：L 形区域的缺口不作为区域入口；有效点与附加属性不变',()=>{
  const areas=[area(1,1,0,2,0,8),area(1,1,3,8,0,2),area(2,2,3,8,3,8)];
  assert.equal(pointBelongsToRegion(areas,1,{x:6,y:6,z:0}),false);
  const actual=validWorldSitePoint(areas,1,{x:6,y:6,z:0,name:'渡口'});
  assert.equal(actual.name,'渡口'); assert.equal(pointBelongsToRegion(areas,1,actual),true);
  const valid={x:1,y:6,z:0};assert.equal(validWorldSitePoint(areas,1,valid),valid);
});
test('地图：全部候选点的修复结果合法且为最近曼哈顿距离',()=>{
  const areas=[area(1,1,0,4,0,4),area(2,4,1,3,1,3)];
  for(let x=-2;x<=6;x++)for(let y=-2;y<=6;y++){
    const point=validWorldSitePoint(areas,1,{x,y,z:0});
    const legal=[];for(let a=0;a<=4;a++)for(let b=0;b<=4;b++)if(pointBelongsToRegion(areas,1,{x:a,y:b,z:0}))legal.push(Math.abs(a-x)+Math.abs(b-y));
    assert.equal(Math.abs(point.x-x)+Math.abs(point.y-y),Math.min(...legal));
  }
  assert.throws(()=>validWorldSitePoint([area(1,1,0,0,0,0),area(2,2,0,0,0,0)],1,{x:0,y:0,z:0}));
});
test('巡游：路段查线，观察点四类事件均可轮转',()=>{
  for(let n=0;n<3;n++){
    assert.equal(patrolKindFor(1,4,n),'clue');
    assert.equal(new Set([0,1,2,3].map(r=>patrolKindFor(2,r,n))).size,4);
  }
});
test('巡游：42 名域民五类分支全部可达、可终结，奖励资格快照不串用',()=>{
  const titles=new Set<string>();let count=0;
  for(const region of dynamicWorldRegions)for(const npc of region.npcs)for(const kind of ['clue','observe','rescue','sample','escort'] as PatrolKind[]){
    const content=buildPatrolEncounter(npc.code,kind,'公共驿站',0,0,3,12);
    const zero=buildPatrolEncounter(npc.code,kind,'公共驿站',0,0,3,0);
    assert(!titles.has(content.title));titles.add(content.title);
    assert(content.reason.includes('正在'));assert(!content.opening.includes('undefined'));assert(content.opening.length<=800);
    assert.notEqual(content.opening,buildPatrolEncounter(npc.code,kind,'公共驿站',250,6,3,12).opening);
    const nodes=content.definition.nodes; const visited=new Set<string>();const queue=['opening'];let terminals=0;
    while(queue.length){
      const key=queue.shift()!;if(visited.has(key))continue;visited.add(key);const node=nodes[key];assert(node);
      assert.equal(new Set(node.choices.map(c=>c.code)).size,node.choices.length);
      for(const c of node.choices){
        if(c.nextNode){assert(nodes[c.nextNode]);queue.push(c.nextNode);}else{terminals++;assert.equal(c.worldline,region.worldline);assert([0,12].includes(c.copper!));assert([0,1].includes(c.stage!));}
      }
      for(const c of zero.definition.nodes[key].choices)assert.equal(Number(c.copper??0),0);
    }
    assert(terminals>=2);assert.equal(visited.size,Object.keys(nodes).length);count++;
  }
  assert.equal(count,210);
});
test('护送：只能在正确区域、楼层、目标坐标交接，不能原地结算',()=>{
  const context:PatrolContext={npcCode:'test',revision:1,kind:'escort',rewarded:true,origin:{regionId:1,name:'原处',x:2,y:3,z:0},target:{regionId:1,name:'驿站',x:4,y:6,z:0}};
  assert.equal(patrolObjective(context,'opening').location,context.origin);
  assert.equal(patrolObjective(context,'handoff').location,context.target);
  assert(!patrolPositionMatches({region_id:1,pos_x:2,pos_y:3,pos_z:0},context.target));
  assert(!patrolPositionMatches({region_id:2,pos_x:4,pos_y:6,pos_z:0},context.target));
  assert(!patrolPositionMatches({region_id:1,pos_x:4,pos_y:6,pos_z:1},context.target));
  assert(patrolPositionMatches({region_id:1,pos_x:4,pos_y:6,pos_z:0},context.target));
});
test('界面接线：世界地图不读取巡游实体，任务保留提交与继续入口',()=>{
  const map=readFileSync('src/response/map.ts','utf8');
  assert(!map.includes('world_dynamic_npc_states'));assert(map.includes("n.interaction_kind='building'"));
  const tasks=readFileSync('src/response/bounty.ts','utf8');assert(tasks.includes('/提交站点委托'));assert(tasks.includes('encounter.objective'));assert(tasks.includes('/奇遇'));
  const routes=readFileSync('src/index.ts','utf8');assert(routes.includes("path: '巡游奇遇'"));assert(routes.includes("path: '提交站点委托'"));
});
