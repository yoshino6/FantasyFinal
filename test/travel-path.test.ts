import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { shortestMappedWalk, connectedTravelPath, type TravelPoint, type TravelLink } from '../src/game/travel-path';
import type { MappedTravelArea } from '../src/game/mapped-travel-route';

const area=(id:number,x1:number,x2:number,y1:number,y2:number,z=0,danger=1):MappedTravelArea=>({region_id:id,min_x:x1,max_x:x2,min_y:y1,max_y:y2,min_z:z,max_z:z,is_enabled:1,is_owner_only:0,danger_level:danger});
const p=(regionId:number,x:number,y:number,z=0):TravelPoint=>({regionId,x,y,z});
const link=(kind:'portal'|'guild',from:TravelPoint,to:TravelPoint):TravelLink=>({kind,from,to,distance:kind==='portal'?1:Math.abs(from.x-to.x)+Math.abs(from.y-to.y)+Math.abs(from.z-to.z)});

test('有地图的绕行按实际路径计时，不用曼哈顿直线穿过无图区',()=>{
  const areas=[area(1,0,4,0,4),area(2,2,2,0,3,0,9)];
  assert.equal(shortestMappedWalk(areas,new Set([1]),p(1,0,0),p(1,4,0)),12);
  assert.equal(shortestMappedWalk(areas,new Set([1,2]),p(1,0,0),p(1,4,0)),4);
  assert.equal(shortestMappedWalk([area(1,0,0,0,0),area(1,3,3,0,0)],new Set([1]),p(1,0,0),p(1,3,0)),null);
});
test('能步行时优先直接移动，即使界门更快也不弹确认',()=>{
  const start=p(1,0,0),target=p(1,10,0);
  const path=connectedTravelPath([area(1,0,10,0,0)],new Set([1]),start,target,[link('portal',start,target)]);
  assert.deepEqual(path?.map(l=>[l.kind,l.distance]),[['walk',10]]);
});
test('缺中间地图时走到界门、传送、再走到目标；缺目标地图仍拒绝',()=>{
  const areas=[area(1,0,4,0,4),area(2,20,24,0,4)];
  const path=connectedTravelPath(areas,new Set([1,2]),p(1,0,0),p(2,24,4),[link('portal',p(1,2,2),p(2,20,0))]);
  assert.deepEqual(path?.map(l=>[l.kind,l.distance]),[['walk',4],['portal',1],['walk',8]]);
  assert.equal(connectedTravelPath(areas,new Set([1]),p(1,0,0),p(2,24,4),[link('portal',p(1,2,2),p(2,20,0))]),null);
});
test('高处降落后可继续界门换乘，未授权的上行线路不凭空生成',()=>{
  const areas=[area(1,0,4,0,4,30),area(2,0,4,0,4),area(3,20,24,0,4)];
  const links=[link('guild',p(1,2,2,30),p(2,0,0)),link('portal',p(2,4,4),p(3,20,0))];
  const path=connectedTravelPath(areas,new Set([1,2,3]),p(1,0,0,30),p(3,24,4),links);
  assert.deepEqual(path?.map(l=>l.kind),['walk','guild','walk','portal','walk']);
  assert.equal(path?.find(l=>l.kind==='guild')?.distance,34);
  assert.equal(connectedTravelPath(areas,new Set([1,2,3]),p(2,0,0),p(1,0,0,30),links),null);
});
test('关闭、私有区域和界门后的断路不能被换乘绕过',()=>{
  const areas=[area(1,0,4,0,4),{...area(2,20,24,0,4),is_enabled:0}];
  const links=[link('portal',p(1,2,2),p(2,20,0))];
  assert.equal(connectedTravelPath(areas,new Set([1,2]),p(1,0,0),p(2,24,4),links),null);
  areas[1].is_enabled=1;areas[1].is_owner_only=1;
  assert.equal(connectedTravelPath(areas,new Set([1,2]),p(1,0,0),p(2,24,4),links),null);
});

test('压缩网格距离与逐格搜索一致，包含不同高度和覆盖优先级',()=>{
  let seed=32;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
  for(let trial=0;trial<40;trial++){
    const blocked=new Set<string>(),areas=[area(1,0,6,0,6)];
    for(let n=0;n<12;n++){const x=rand()%7,y=rand()%7;if(x===0&&y===0||x===6&&y===6)continue;blocked.add(`${x},${y}`);areas.push(area(2,x,x,y,y,0,9));}
    const queue=[[0,0,0]],seen=new Set(['0,0']);let expected:number|null=null;
    for(let i=0;i<queue.length;i++){const[x,y,d]=queue[i];if(x===6&&y===6){expected=d;break;}for(const[nx,ny]of[[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){const key=`${nx},${ny}`;if(nx<0||ny<0||nx>6||ny>6||blocked.has(key)||seen.has(key))continue;seen.add(key);queue.push([nx,ny,d+1]);}}
    assert.equal(shortestMappedWalk(areas,new Set([1]),p(1,0,0),p(1,6,6)),expected);
  }
});

test('正式地块：只有世界树与百纳镇地图可走界门，补齐草原和密林则直接走路',()=>{
  const source=readFileSync('src/database/bootstrap.ts','utf8').split('const worldRegionAreas:')[1].split('];')[0];
  const codes:string[]=[];
  const areas=[...source.matchAll(/\['([^']+)',\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\]/g)].map(m=>{if(!codes.includes(m[1]))codes.push(m[1]);return {...area(codes.indexOf(m[1]),+m[2],+m[3],+m[4],+m[5],+m[6],['world_tree','baina_town'].includes(m[1])?99:1),max_z:+m[7]};});
  const tree=codes.indexOf('world_tree'),town=codes.indexOf('baina_town'),owned=new Set([tree,town]);
  const links=[link('portal',p(tree,2,-2),p(town,14,-167))];
  const path=connectedTravelPath(areas,owned,p(tree,0,0),p(town,-2,-181),links);
  assert.deepEqual(path?.map(l=>[l.kind,l.distance]),[['walk',4],['portal',1],['walk',30]]);
  owned.add(codes.indexOf('worldtree_meadow'));owned.add(codes.indexOf('dark_forest'));
  const direct=connectedTravelPath(areas,owned,p(tree,0,0),p(town,-2,-181),links);
  assert.deepEqual(direct?.map(l=>[l.kind,l.distance]),[['walk',183]]);
});
