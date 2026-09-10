import { retiredAchievementIds } from '../src/game/achievement-retired.config';
import { bossAchievementFlavours } from '../src/game/achievement-boss-flavour';
import test from 'node:test';
import assert from 'node:assert/strict';
import { achievementDefinitions } from '../src/game/achievement.config';
import { achievementThreshold, completionPercent } from '../src/game/achievement-rules';
import { recordAchievement, takeAchievementEvents } from '../src/game/achievement-events';
import { achievementListFormat, achievementDetailFormat, achievementAnnouncementFormat } from '../src/game/achievement-message';
import { achievementSchema } from '../src/database/achievements';
import { bossAchievementDefinition, bossAchievementDifficulties } from '../src/game/achievement-boss';

test('目录为223项非隐藏路线成就，史诗高于传说，条件仅服务端保留',()=>{
  assert.equal(achievementDefinitions.length,223);assert.equal(new Set(achievementDefinitions.map(d=>d.id)).size,223);
  assert.ok(achievementDefinitions.every(d=>!d.id.includes('SECRET')&&d.condition&&d.description));
  assert.ok(achievementDefinitions.filter(d=>d.rarity==='传说').every(d=>d.attribute.endsWith('+8')));
  assert.equal(achievementThreshold('ACH_B05'),1000);assert.equal(achievementThreshold('ACH_H13'),20);
});
test('结算队列只属于当前事务连接，取出后清除，重试不能继承失败队列',()=>{
  const a={} as any,b={} as any;recordAchievement(a,1,['ACH_B01'],'kill:1');
  assert.equal(takeAchievementEvents(b).length,0);assert.equal(takeAchievementEvents(a)[0]?.key,'kill:1');assert.equal(takeAchievementEvents(a).length,0);
});
test('完成率处理零分母、小百分比与上限',()=>{
  assert.equal(completionPercent(0,0),'0.00%');assert.equal(completionPercent(1,100000),'<0.01%');assert.equal(completionPercent(1,4),'25.00%');assert.equal(completionPercent(4,3),'100.00%');
});
const entry={id:'ACH_B01',name:'第一滴血',category:'战斗',description:'刃上的红，是命运第一次回答。',rarity:'普通',attribute:'力量+1',rank:2,percentage:'25.00%',completedAt:'2256/9/9 12:00:00'};
const serialized=(value:any)=>JSON.stringify(value.value);
test('首位公告公开角色名、成就名与引用简介，不公开条件，每条只显示一项',()=>{
  const definitions=[achievementDefinitions[0],achievementDefinitions.find(d=>d.category==='PVP')!,bossAchievementDefinition('wolf','狼王','dreamlike')];
  for(const definition of definitions){
    const output=serialized(achievementAnnouncementFormat({...definition,winner:'哥布林刺客',condition:'SECRET_REQUIREMENT'} as any));
    assert.ok(output.includes('世界的回响'));assert.ok(output.includes('【哥布林刺客】达成'));
    assert.ok(output.includes(JSON.stringify({type:'MD.text',value:definition.name})));
    assert.ok(output.includes(JSON.stringify({type:'MD.text',value:'获得：奇珍道具匣 ×1'})));
    assert.ok(output.includes(JSON.stringify({type:'MD.blockquote',value:`${definition.description}\n>\n>`})));assert.ok(!output.includes('SECRET_REQUIREMENT'));
  }

});
test('空列表顶部仅有全部；10条编号与蓝色链接不自动发送',()=>{
  const empty=serialized(achievementListFormat({category:'全部',page:1,totalPages:1,visibleCategories:['全部'],entries:[]}));
  assert.ok(empty.includes('[全部]'));assert.ok(!empty.includes('[战斗]'));
  const full=serialized(achievementListFormat({category:'战斗',page:1,totalPages:2,visibleCategories:['全部','战斗'],entries:Array.from({length:11},(_,i)=>({...entry,id:`test${i}`}))}));
  assert.ok(full.includes('⑩'));assert.ok(!full.includes('test10'));assert.ok(full.includes('25.00%'));assert.ok(full.includes('第2位'));
  assert.ok(!full.includes('enter=true'));assert.ok(!full.includes('show='));
});
test('详情采用白名单字段，即使输入附带条件也不能渲染',()=>{
  const detail=serialized(achievementDetailFormat({...entry,condition:'SECRET_REQUIREMENT',scope:'INTERNAL_SCOPE'} as any));
  assert.ok(detail.includes(JSON.stringify({type:'MD.text',value:entry.description})));
  assert.ok(detail.includes(JSON.stringify({type:'MD.blockquote',value:'**永久属性：力量+1**'})));
  assert.ok(detail.includes(JSON.stringify({type:'MD.blockquote',value:'稀有度：普通　全服第2位达成'})));
  assert.ok(detail.includes(JSON.stringify({type:'MD.text',value:'注销重修后仍然保留'})));
  assert.ok(!detail.includes('SECRET_REQUIREMENT'));assert.ok(!detail.includes('INTERNAL_SCOPE'));
});
test('永久表不向人物表设置外键，达成名次与身份成就都有唯一约束',()=>{
  assert.ok(achievementSchema.every(sql=>!sql.includes('REFERENCES characters')&&!sql.includes('REFERENCES players')));
  assert.ok(achievementSchema.some(sql=>sql.includes('UNIQUE KEY achievement_rank(achievement_id,ordinal)')));
});
test('PVP23项独立分类；首领各难度分开且改名不重编成就编号',()=>{
  assert.equal(achievementDefinitions.filter(d=>d.category==='PVP').length,23);
  const low=bossAchievementDefinition('wolf','狼王','ordinary'),high=bossAchievementDefinition('wolf','狼王','dreamlike');
  assert.notEqual(low.id,high.id);assert.equal(low.id,bossAchievementDefinition('wolf','改名狼王','ordinary').id);
  assert.equal(high.rarity,'史诗');assert.ok(high.attribute.endsWith('+12'));assert.equal(bossAchievementDifficulties.length,12);
  assert.throws(()=>bossAchievementDefinition('wolf','狼王','invented'));
});

test('17组首领的12档文案完整独立，替换文案不改变编号',()=>{
  const bosses=Object.entries(bossAchievementFlavours);assert.equal(bosses.length,17);
  const names=new Set<string>(),descriptions=new Set<string>();
  for(const [code,tiers] of bosses){assert.equal(Object.keys(tiers).length,12);for(const [difficulty,flavour] of Object.entries(tiers)){
    assert.ok(flavour.name&&flavour.description);assert.ok(!names.has(flavour.name));assert.ok(!descriptions.has(flavour.description));names.add(flavour.name);descriptions.add(flavour.description);
    const definition=bossAchievementDefinition(code,'原名',difficulty);assert.equal(definition.name,flavour.name);assert.equal(definition.description,flavour.description);assert.equal(definition.id,bossAchievementDefinition(code,'改名',difficulty).id);
  }}
});
test('合作首发公告把全队名字合并为一行，成就名普通文本、简介引用留空行、奖励普通文本',()=>{
  const output=serialized(achievementAnnouncementFormat({winner:'哥布林刺客',winners:['哥布林刺客','xx','xxx'],name:'切磋有度',description:'锋芒相逢，也可以点到为止。'}));
  assert.ok(output.includes('世界的回响'));
  assert.ok(output.includes('【哥布林刺客】、【xx】、【xxx】达成'));
  assert.ok(output.includes(JSON.stringify({type:'MD.text',value:'切磋有度'})));
  assert.ok(output.includes(JSON.stringify({type:'MD.blockquote',value:'锋芒相逢，也可以点到为止。\n>\n>'})));
  assert.ok(output.includes(JSON.stringify({type:'MD.text',value:'获得：奇珍道具匣 ×1'})));
});

test('Boss新难度奖励与六维目录总量符合确认表',()=>{
  assert.deepEqual(bossAchievementDifficulties.map(d=>[d[1],d[2],d[3]]),[['普通','普通',1],['强大','优秀',2],['英雄','优秀',2],['深渊','精良',3],['地狱','精良',3],['猩红','稀有',3],['腐化','稀有',5],['神圣','稀有',5],['黄金','传说',8],['璀璨','传说',8],['梦幻','史诗',12],['固定','普通',1]]);
  const totals:Record<string,number>={};
  for(const code of Object.keys(bossAchievementFlavours)){
    const counts:Record<string,number>={};
    for(const tier of bossAchievementDifficulties){const [attribute,points]=bossAchievementDefinition(code,'首领',tier[0]).attribute.split('+');totals[attribute]=(totals[attribute]??0)+Number(points);counts[attribute]=(counts[attribute]??0)+1;}
    assert.equal(Object.keys(counts).length,6);assert.ok(Object.values(counts).every(n=>n===2));
  }
  assert.equal(Object.values(totals).reduce((a,b)=>a+b,0),901);assert.equal(Math.max(...Object.values(totals))-Math.min(...Object.values(totals)),1);
});

test('低门槛条目已退出有效目录，保留合作Boss并加入四十六个秘闻',()=>{
  const active=new Set(achievementDefinitions.map(d=>d.id));assert.equal(retiredAchievementIds.length,155);
  assert.ok(retiredAchievementIds.every(id=>!active.has(id)));assert.ok(active.has('ACH_G07'));
  assert.equal(achievementDefinitions.filter(d=>d.category==='秘闻').length,46);
});
