import {writeFileSync, readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {openingRouteVersions} from '../src/game/opening-content';
import * as graph from '../src/game/lamplight-content.generated';
import {lamplightWork} from '../src/game/lamplight-work';
const nodes = Object.values(graph).flatMap(value => Array.isArray(value) ? value : Object.values(value).flat());
const snapshot = {opening:openingRouteVersions, graph, work:nodes.map(node => {
 const {object, ...work} = lamplightWork(node); return {code:node.code, ...work};
})};
if (process.argv.includes('--before')) writeFileSync('.data/story-titles-before.json', JSON.stringify(snapshot));
else {
 const before = JSON.parse(readFileSync('.data/story-titles-before.json','utf8'));
 const pairs: [string,string][] = JSON.parse(readFileSync('.data/story-title-renames.json','utf8'));
 const normalize = (value:any, key=''):any => {
   if (typeof value === 'string') {for (const [old,title] of pairs) {
     if (['title','quest'].includes(key) && value === old) value = title;
     value = value.replaceAll(`《${old}》`, `《${title}》`);
   } return value;}
   if (Array.isArray(value)) return value.map(v=>normalize(v));
   if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v,k)]));
   return value;
 };
 assert.deepEqual(normalize(before), JSON.parse(JSON.stringify(snapshot)), 'Only titles and their explicit references may change; work mechanics must match');
 const titles:string[]=[];
 const collect=(value:any)=>{if(!value||typeof value!=='object')return;for(const [k,v] of Object.entries(value)){if(['title','quest'].includes(k)&&typeof v==='string')titles.push(v);else collect(v);}};
 collect({opening:snapshot.opening,graph});
 assert.deepEqual(titles.filter(t=>[...t].length>9),[]);
 console.log(`Verified ${openingRouteVersions.length} opening versions, ${nodes.length} sequel nodes, ${titles.length} titles <= 9 characters; content and work mechanics preserved.`);
}
