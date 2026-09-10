import fs from 'node:fs';
const report=JSON.parse(fs.readFileSync('.data/enemy-stat-migration/2026-09-08T14-53-50-517Z/preview.json','utf8'));
const differences=(a,b,path='')=>Object.keys({...a,...b}).flatMap(k=>a?.[k]&&b?.[k]&&typeof a[k]==='object'&&typeof b[k]==='object'?differences(a[k],b[k],path+k+'.'):a?.[k]!==b?.[k]?[{path:path+k,a:a?.[k],b:b?.[k]}]:[]);
console.log(JSON.stringify(report.profileChanges.slice(0,3).map(r=>({code:r.code,diffs:differences(typeof r.previous==='string'?JSON.parse(r.previous):r.previous,r.next)}))));
