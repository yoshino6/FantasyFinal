import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {calculateDerivedStats} from '../../src/game/constants';
const document=readFileSync('docs/玩家成长与装备战斗数值改动整合方案.md','utf8');
const coeffSection=document.split('## 附录B：')[1].split('## 附录C：')[0];
const rows=coeffSection.split('\n').filter(s=>s.startsWith('|')).slice(2).map(s=>s.split('|').slice(1,-1).map(x=>x.trim()));
const keys=['hpMax','mpMax','physicalAttack','magicAttack','physicalDefense','magicDefense','accuracy','evasion','critRateBp','critDamageBp','critResistBp','critDamageReductionBp','tenacity','tenacityPierce','speed'];
const attrs=['constitution','spirit','strength','intelligence','agility','perception'];
assert.equal(rows.length,15);
const fixtures=[Array(6).fill(0),...attrs.map((_,i)=>attrs.map((__,j)=>i===j?1:0)),[17.3,24.8,13.6,42.1,39.4,15.7],Array(6).fill(115)];
for(const f of fixtures){
 const source:any=calculateDerivedStats(Object.fromEntries(attrs.map((k,i)=>[k,f[i]])) as any);
 rows.forEach((row,i)=>{const [constant,...coefficients]=row.slice(1).map(Number);let expected=constant+coefficients.reduce((n,c,k)=>n+c*f[k],0);if(keys[i]==='tenacityPierce')expected=Math.floor(expected);assert.ok(Math.abs(expected-source[keys[i]])<1e-8,`${row[0]} differs from source`);});
}
const metadata=JSON.parse(readFileSync('.data/balance-review-20260908/consolidated-plan-checks.json','utf8'));
metadata.coefficientComparisons=rows.length*fixtures.length;metadata.sourceCoefficientCheck='passed';
writeFileSync('.data/balance-review-20260908/consolidated-plan-checks.json',JSON.stringify(metadata,null,2));
console.log(JSON.stringify(metadata));
