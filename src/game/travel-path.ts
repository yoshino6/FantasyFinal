import type { MappedTravelArea } from './mapped-travel-route';

export type TravelPoint = { x: number; y: number; z: number; regionId: number };
export type TravelLeg = { kind: 'walk' | 'portal' | 'guild'; from: TravelPoint; to: TravelPoint; distance: number; fromCode?: string; toCode?: string; name?: string; seconds?: number };
export type TravelLink = TravelLeg & { kind: 'portal' | 'guild' };

class Queue {
  private items: [number, number][] = [];
  push(cost: number, id: number) {
    const a=this.items; a.push([cost,id]); let i=a.length-1;
    while(i>0){const p=(i-1)>>1;if(a[p][0]<=cost)break;a[i]=a[p];i=p;}a[i]=[cost,id];
  }
  pop() {
    const a=this.items, first=a[0], last=a.pop(); if(!first||!last)return undefined;
    if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1][0]<a[c][0])c++;if(a[c][0]>=last[0])break;a[i]=a[c];i=c;}a[i]=last;}return first;
  }
}

/** 在所有矩形边界和目标坐标处压缩网格，边权为真实格数，空隙与覆盖区仍逐段阻断。 */
export const shortestMappedWalk = (areas: MappedTravelArea[], owned: ReadonlySet<number>, from: TravelPoint, to: TravelPoint): number | null => {
  if(from.z!==to.z)return null;
  const surface=areas.filter(a=>from.z>=a.min_z&&from.z<=a.max_z).sort((a,b)=>b.danger_level-a.danger_level);
  const axis=(key:'x'|'y')=>[...new Set(surface.flatMap(a=>[a[`min_${key}`]-1,a[`min_${key}`],a[`max_${key}`],a[`max_${key}`]+1]).concat([from[key],to[key]]))].sort((a,b)=>a-b);
  const xs=axis('x'),ys=axis('y'),w=xs.length;
  const covering=(x:number,y:number)=>surface.find(a=>x>=a.min_x&&x<=a.max_x&&y>=a.min_y&&y<=a.max_y);
  if(Number(covering(from.x,from.y)?.region_id)!==from.regionId||Number(covering(to.x,to.y)?.region_id)!==to.regionId)return null;
  const passable=ys.flatMap(y=>xs.map(x=>{const a=covering(x,y);return Boolean(a&&a.is_enabled&&!a.is_owner_only&&owned.has(Number(a.region_id)));}));
  const start=ys.indexOf(from.y)*w+xs.indexOf(from.x),end=ys.indexOf(to.y)*w+xs.indexOf(to.x);
  if(!passable[start]||!passable[end])return null;
  const distances=new Float64Array(passable.length).fill(Infinity),queue=new Queue();distances[start]=0;queue.push(0,start);
  for(let entry=queue.pop();entry;entry=queue.pop()){
    const [cost,id]=entry;if(cost!==distances[id])continue;if(id===end)return cost;
    const x=id%w,y=Math.floor(id/w);
    for(const next of [x>0?id-1:-1,x+1<w?id+1:-1,y>0?id-w:-1,y+1<ys.length?id+w:-1]){
      if(next<0||!passable[next])continue;
      const nextCost=cost+Math.abs(xs[next%w]-xs[x])+Math.abs(ys[Math.floor(next/w)]-ys[y]);
      if(nextCost<distances[next]){distances[next]=nextCost;queue.push(nextCost,next);}
    }
  }
  return null;
};

export const connectedTravelPath = (areas: MappedTravelArea[], maps: ReadonlySet<number>, start: TravelPoint, target: TravelPoint, links: TravelLink[]): TravelLeg[] | null => {
  if(!maps.has(target.regionId))return null;
  const owned=new Set(maps);owned.add(start.regionId);
  const direct=shortestMappedWalk(areas,owned,start,target);
  if(direct!==null)return [{kind:'walk',from:start,to:target,distance:direct}];
  links=links.filter(l=>shortestMappedWalk(areas,owned,l.from,l.from)!==null&&shortestMappedWalk(areas,owned,l.to,l.to)!==null);
  const points=[start,target,...links.flatMap(l=>[l.from,l.to])];
  const walkCache=new Map<string,number|null>();
  const walk=(i:number,j:number)=>{const key=[JSON.stringify(points[i]),JSON.stringify(points[j])].sort().join('|');if(!walkCache.has(key))walkCache.set(key,shortestMappedWalk(areas,owned,points[i],points[j]));return walkCache.get(key)!;};
  const costs=points.map(()=>Infinity),previous:(undefined|{index:number;leg:TravelLeg})[]=points.map(()=>undefined);
  costs[0]=0;const queue=new Queue();queue.push(0,0);
  for(let entry=queue.pop();entry;entry=queue.pop()){
    const[cost,i]=entry;if(cost!==costs[i])continue;if(i===1)break;
    for(let j=0;j<points.length;j++){
      if(i===j)continue;
      const distance=walk(i,j);
      let leg:TravelLeg|undefined=distance===null?undefined:{kind:'walk',from:points[i],to:points[j],distance};
      for(const link of links)if(samePoint(link.from,points[i])&&samePoint(link.to,points[j])&&(!leg||link.distance<leg.distance))leg=link;
      if(!leg)continue;const next=cost+leg.distance;
      if(next<costs[j]){costs[j]=next;previous[j]={index:i,leg};queue.push(next,j);}
    }
  }
  if(!Number.isFinite(costs[1]))return null;
  const result:TravelLeg[]=[];let index=1;
  while(index!==0){const prev=previous[index];if(!prev)return null;result.unshift(prev.leg);index=prev.index;}
  return result.filter(leg=>leg.kind!=='walk'||leg.distance>0);
};
export const samePoint = (a:TravelPoint,b:TravelPoint)=>a.regionId===b.regionId&&a.x===b.x&&a.y===b.y&&a.z===b.z;
