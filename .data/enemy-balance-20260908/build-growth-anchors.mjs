import fs from 'node:fs';
const s=JSON.parse(fs.readFileSync('.data/enemy-balance-20260908/before.json','utf8'));
const anchors=Object.fromEntries(s.templates.filter(t=>['constitution','spirit','strength','intelligence','agility','perception'].some(k=>Number(t[k+'_growth'])>0)).sort((a,b)=>a.code.localeCompare(b.code)).map(t=>[t.code,Math.max(10,Number(t.level),...s.spawns.filter(r=>Number(r.template_id)===Number(t.id)&&Number(r.level)<=100).map(r=>Number(r.level)))]));
for(const code of Object.keys(anchors))if(code.startsWith('slime_'))anchors[code]=Math.max(16,anchors[code]);
fs.writeFileSync('src/config/monster-growth-anchors.ts',`/** 固定种类成长校准等级：2026-09-08模板与出现等级范围。不是每次刷新随机计算。 */\nexport const monsterGrowthAnchors: Record<string,number> = ${JSON.stringify(anchors,null,2)};\n`);
console.log({templates:Object.keys(anchors).length});
