const fs=require('node:fs');
const entry=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if(!/^[A-I]\d{2}$/.test(entry.code))throw Error('Invalid talent');
const file='docs/新版天赋逐项验收记录.md';let content=fs.readFileSync(file,'utf8');
const rows=content.split(/\r?\n/);let found=false;
for(let i=0;i<rows.length;i++)if(rows[i].split('|')[1]?.trim().startsWith(entry.code+' ')){
 const fields=rows[i].split('|');fields[2]=' 已通过 ';fields[3]+='；顺序专项：'+entry.evidence+' ';fields[4]=' 核心缺口：无。另列扩展：'+entry.extra+' ';rows[i]=fields.join('|');found=true;
}
if(!found)throw Error('Talent row missing');content=rows.join('\n');
const passed=rows.filter(row=>/^[A-I]\d{2} \S/.test(row.split('|')[1]?.trim()??'')&&row.split('|')[2].trim()==='已通过').map(row=>row.split('|')[1].trim());
content=content.replace(/当前已确认 \*\*.*?\*\*。其余条目/,'当前已确认 **'+passed.length+'项已通过服务端验收：'+passed.join('、')+'**。其余条目');
fs.writeFileSync(file,content);
const log='docs/新版天赋顺序验收通过记录.md';
if(!fs.existsSync(log))fs.writeFileSync(log,'# 新版天赋顺序验收通过记录\n\n从A01起依次收尾。每条先验证再记录；源码核对、规则测试与隔离数据库实际服务路径共同作为证据，QQ客户端与上线验证另列。J类暂缓。\n');
fs.appendFileSync(log,'\n## '+entry.code+' '+entry.name+'：已通过\n\n'+entry.criteria.map((line,i)=>(i+1)+'. '+line).join('\n')+'\n\n证据：'+entry.evidence+'\n\n扩展检查（不阻止本条服务验收）：'+entry.extra+'\n');
