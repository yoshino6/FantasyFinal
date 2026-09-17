// Read-only source-based equipment benchmark; produces documentation data, never opens a database.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function source(relative) {
  const file = path.resolve(root, relative.endsWith('.ts') ? relative : relative + '.ts');
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const requireLocal = name => { if (!name.startsWith('.')) throw Error('Unexpected dependency: ' + name); return source(path.relative(root, path.resolve(path.dirname(file), name))); };
  vm.runInNewContext(code, { module, exports: module.exports, require: requireLocal });
  return module.exports;
}
const C = source('src/game/constants');
const G = source('src/game/growth-rules');
const A = source('src/game/armor-class');
const F = source('src/game/panel-stat-formula');
const stats = ['hpMax','mpMax','physicalAttack','magicAttack','physicalDefense','magicDefense','accuracy','evasion','critRateBp','critDamageBp','critResistBp','critDamageReductionBp','tenacity','tenacityPierce','speed'];
const elements = ['水','火','土','木','风','冰','雷','光','暗'];
// Expected clamp(.62 + Normal(0,.16), .08, 1), normal CDF approximation.
function cdf(x) { const z=Math.abs(x),t=1/(1+.2316419*z),p=1-Math.exp(-z*z/2)/Math.sqrt(2*Math.PI)*t*(.319381530+t*(-.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));return x<0?1-p:p; }
const phi=x=>Math.exp(-x*x/2)/Math.sqrt(2*Math.PI), lo=(.08-.62)/.16, hi=(1-.62)/.16;
const rollMean=.08*cdf(lo)+.62*(cdf(hi)-cdf(lo))+.16*(phi(lo)-phi(hi))+1*(1-cdf(hi));
function piece(category,subtype,slot,level,rarity,quality) {
  const primary=C.forgedPrimaryStats(category,subtype,level,rarity,category);
  const kind=(category==='武器'||category==='副手')&&subtype!=='盾牌'?'武器':'防具';
  const all=[...stats,...elements.map(e=>(kind==='武器'?'elementMastery_':'elementResistance_')+e)];
  const keys=all.filter(k=>!Object.hasOwn(primary,k)&&!(category==='武器'&&['physicalAttack','magicAttack'].includes(k))&&C.forgedAffixCap(kind,k,level,rarity)>0);
  const ws=keys.map(k=>!k.startsWith('element')?1:/_(光|暗)$/.test(k)?.25:.5),total=ws.reduce((a,b)=>a+b,0);
  const count=rarity==='普通'?0:rarity==='优秀'?1:2;
  const out={...primary};
  keys.forEach((k,i)=>{let prob=count?ws[i]/total:0;if(count===2)for(let j=0;j<keys.length;j++)if(j!==i)prob+=ws[j]/total*ws[i]/(total-ws[j]);out[k]=(out[k]??0)+prob*C.forgedAffixCap(kind,k,level,rarity)*rollMean;});
  const scale=C.equipmentQualityMultiplier(quality)*(slot==='offhand'?.5:1);
  return Object.fromEntries(Object.entries(out).map(([k,v])=>[k,v*scale]));
}
function model(level,rarity='精良',quality=80,armor='轻甲') {
  const gearLevel=Math.max(1,Math.floor(level/5)*5),x=G.standardPlayerAttribute(level);
  const body=C.calculateDerivedStats(Object.fromEntries(['constitution','spirit','strength','intelligence','agility','perception'].map(k=>[k,x])));
  const profiles=[['剑盾','长剑','盾牌','physicalAttack'],['法杖法书','法杖','法书','magicAttack'],['双匕首','匕首','匕首','physicalAttack']];
  const armorRows=[['upper','上装'],['lower','下装'],['shoulder','头肩'],['waist','腰部'],['feet','脚部']];
  const builds=profiles.map(([name,main,off,attackKey])=>{
    const pieces=[piece('武器',main,'weapon',gearLevel,rarity,quality),piece('副手',off,'offhand',gearLevel,rarity,quality),...armorRows.map(([slot,cat])=>piece(cat,armor,slot,gearLevel,rarity,quality)),...['项链','手镯','戒指'].map(cat=>piece(cat,cat,cat,gearLevel,rarity,quality))];
    const flat={};for(const p of pieces)for(const[k,v]of Object.entries(p))flat[k]=(flat[k]??0)+v;
    const armorPct=A.armorPanelPercent(armorRows.map(([slot])=>({slot,weapon_type:armor,quality})));
    const setPct=armor==='轻甲'?{hpPct:15,mpPct:15}:armor==='皮甲'?{mpPct:20}:armor==='重甲'||armor==='板甲'?{hpPct:25}:{};
    const unrounded=Object.fromEntries(stats.map(k=>[k,(body[k]+(flat[k]??0))*(1+(armorPct[F.panelPercentKeys[k]]??0)/100)*(1+(setPct[F.panelPercentKeys[k]]??0)/100)]));
    return {name,attackKey,stats:unrounded,armorPct,setPct,flat};
  });
  const mean=Object.fromEntries(stats.map(k=>[k,builds.reduce((a,b)=>a+b.stats[k],0)/3]));
  // Fixed card points enter before armor and set percentages: benchmark their pre-multiplier base.
  const neutral=Object.fromEntries(stats.map(k=>[k,builds.reduce((a,b)=>a+body[k]+(b.flat[k]??0),0)/3]));
  const weapon=C.forgedPrimaryStats('武器','法杖',gearLevel,rarity).magicAttack*C.equipmentQualityMultiplier(quality);
  return {level,gearLevel,rarity,quality,armor,weapon,mean,neutral,builds:builds.map(b=>({name:b.name,attack:b.stats[b.attackKey],hp:b.stats.hpMax,def:b.stats.physicalDefense})),mainAttack:builds.reduce((a,b)=>a+b.stats[b.attackKey],0)/3};
}
const result={rollMean,levels:Array.from({length:50},(_,i)=>model(i+1)),sensitivity:[model(30,'普通',50),model(30,'优秀',70),model(30),model(30,'精良',100),model(30,'精良',80,'布甲'),model(30,'精良',80,'板甲')]};
if(require.main===module)console.log(JSON.stringify(result,null,2));
module.exports=result;
