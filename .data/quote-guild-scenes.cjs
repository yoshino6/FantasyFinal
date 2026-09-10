const fs=require('fs');
const file='src/response/opening-guild.ts';let s=fs.readFileSync(file,'utf8');
// These two scene literals contain multiple paragraphs; QQ quotes only the first line itself.
s=s.replace(/md\.addBlockquote\((view\.code==='world_tree'\?[^\n]+)\);/g,"md.addBlockquote(($1).replace(/\\r?\\n/g,'\\n> '));");
fs.writeFileSync(file,s);
for(const f of ['src/response/guild-shop.ts','src/response/guild-restaurant.ts']){
 let text=fs.readFileSync(f,'utf8');text=text.replaceAll('.addBlockquote(scene)',".addBlockquote(scene.replace(/\\r?\\n/g, '\\n> '))");fs.writeFileSync(f,text);
}
