import {readFileSync,writeFileSync} from 'node:fs';
import {achievementDefinitions,achievementCategories} from '../../src/game/achievement.config';
import {challengeAchievementDefinitions} from '../../src/game/achievement-challenge.config';
import {surpriseAchievementDefinitions} from '../../src/game/achievement-surprise.config';
import {achievementThreshold} from '../../src/game/achievement-rules';
const old=JSON.parse(readFileSync('.data/achievement-design-20260909/acceptance-v2.json','utf8')).rows;
const current=new Set(achievementDefinitions.map(d=>d.id));const removed=old.filter((d:any)=>!current.has(d.id));
const added=[...challengeAchievementDefinitions,...surpriseAchievementDefinitions];
if(removed.length!==18||added.length!==41||achievementDefinitions.length!==225)throw Error('数量不一致');
if(!current.has('ACH_B04')||current.has('ACH_B03'))throw Error('百战保留/十战删除不一致');
for(const d of added)if(!(achievementCategories as readonly string[]).includes(d.category))throw Error(d.id+'分类错误');
let md='# 成就难度调整与新增41项实装记录 V1\n\n日期：2026-09-10。按本轮要求删除18项容易顺手完成的条目；百战明确保留，千战保留，增加万战与五万战。本轮新增7条长期成就、34条彩蛋（先新增4条，再补30条），秘闻类合计46条。有效静态目录由202条变为225条，仍含暂缓种植1条及未开放仙路5条。Boss动态首杀目录不变。\n\n## 历史与统计\n\n- 停用条目不再新增达成、不再展示；未发送的旧公告由既有投递器取消。历史已得六维、奖励、名次和完成记录保留，注销重修也不扣回。\n- 新条目使用ACH_END01—END07、ACH_EGG13—EGG46，不复用旧编号，不把十战直接改成万战。\n- 新计数从新版本产生的合格事件开始；不通过扫描旧玩家自动补发，避免上线后批量公告。已有百战、千战等原条目的进度继续保留。\n- 玩家详情仍只公开凝练简介、奖励、稀有度、名次、完成率等；下面的具体条件只供维护审阅，不出现在玩家详情。\n- 仅共同条件的EGG21、EGG27使用同场合作首发；最后存活者、倒地贡献者等个人条件只奖符合本人条件的人。每项公告独立发送。\n\n## 本轮停用18项\n\n| 编号 | 名称 | 原条件 |\n| --- | --- | --- |\n';
for(const d of removed)md+=`| ${d.id} | ${d.name} | ${d.condition} |\n`;
md+='\n保留百战余温（B04，100场）、千战行者（B05，1000场），也保留组队百战与百次采集、百炉、百锻。首次Boss/各难度首杀、剧情终章等有内容意义的里程碑不在这次停用名单中。\n\n## 新增长期目标\n';
for(const group of [added.filter(d=>d.id.startsWith('ACH_END')),added.filter(d=>d.id.startsWith('ACH_EGG'))]){
 if(group[0]?.id.startsWith('ACH_EGG'))md+='\n## 新增34条彩蛋\n';
 for(const d of group)md+=`\n### ${d.id} ${d.name}\n\n> ${d.description}\n\n- 分类与奖励：${d.category}；${d.rarity}；永久${d.attribute}。\n- 具体要求：${d.condition}\n- 进度：${d.scope==='账'?'账号累计，注销重修保留':'按该场或连续事件状态判定'}；达成后的记录和属性永久保留。\n`;
}
md+='\n## 实装与验证范围\n\n新增41条均有正式服务观察入口，不只是目录文案。长期战斗接合格胜利结算，炼金接已支付个人订单，锻造接成功制作，采集接实际产物发放，和平条目接操作交涉者的成功结算。多次炼金/采集状态与发奖跟随同一业务事务，事件回执防重试多计。\n\nBoss秒杀使用第1回合、第1次敌方行动、单次损失前满HP、免死处理后真实归零的证据，再由正式Boss分类与战败结算校验；不会把残血入场、普通敌人或免死保留1HP当作秒杀。累计损失十倍HP专门累计实际HP变化，不拿过量伤害或护盾吸收凑数。\n\n测试覆盖225项现有效目录的逐项账本；新增战况逐条测试、无Boss/等级不足/零贡献排除、血蓝边界、组队人数与NPC排除；新增连续炸炉、同配方成功、同物品和不同地区采集另做真实MySQL回滚、重试、门槛前后测试。长计数使用边界状态及真实结算事件，不冒充已实际游玩五万场。其余旧成就的未完成验收事项继承V2，不因本轮增加内容而自动变为通过。\n\n所有数据库写入测试使用隔离库；本轮没有给真人补发、改名次或主动推送测试公告。源码已完成，机器人需加载新版本后生效，本轮未重启。\n';
writeFileSync('docs/成就难度调整与新增41项实装记录V1.md',md);
let final='# 成就最终信息与逐项验收记录 V3\n\n日期：2026-09-10。当前有效静态目录225项，替代V2的202项目录。百战保留。本轮变更、停用18项及新增41项的完整说明见[难度调整实装记录](成就难度调整与新增41项实装记录V1.md)。旧条目继承此前验收边界，不宣称全部业务端到端通过。\n\n';
const rows=achievementDefinitions.map(d=>{const previous=old.find((r:any)=>r.id===d.id);return {...d,status:previous?.status??'新入口已接；判定与账本测试通过',reason:previous?.reason??'本轮新增。正式观察器已接入，逐项账本及战况边界/跨次状态测试通过；长计数采用边界状态推进，未从零实际游玩到全部门槛。'};});
for(const category of [...new Set(rows.map(r=>r.category))]){final+=`## ${category}\n\n`;for(const d of rows.filter(r=>r.category===category))final+=`### ${d.id} ${d.name}\n\n${d.description}\n\n- 最终要求：${d.condition}\n- 最终奖励：${d.rarity}；永久${d.attribute}。\n- 验收：${d.status}。\n- 证据与边界：${d.reason}\n\n`;}
final+='## 共用保留规则\n\n所有已达成属性与记录注销重修后保留。未解锁成就及分类隐藏，详情不公开达成条件。？？？与仙路五艺仍未开放，种植仍暂缓。Boss预备目录仍不等于所有难度已开放；动态Boss验收沿用V2所述边界。\n';
writeFileSync('docs/成就最终信息与逐项验收记录V3.md',final);writeFileSync('.data/achievement-design-20260909/acceptance-v3.json',JSON.stringify({date:'2026-09-10',retiredThisTurn:removed.map((d:any)=>d.id),newThisTurn:added.map(d=>d.id),rows},null,2));
const oldPath='docs/成就最终信息与逐项验收记录V2.md';let previous=readFileSync(oldPath,'utf8');if(!previous.startsWith('> 当前目录'))writeFileSync(oldPath,'> 当前目录已更新至[最终记录V3](成就最终信息与逐项验收记录V3.md)，本文件保留上轮验收快照。\n\n'+previous);
console.log({active:achievementDefinitions.length,retired:removed.length,added:added.length,secrets:achievementDefinitions.filter(d=>d.category==='秘闻').length,battle100:achievementThreshold('ACH_B04'),battle10000:achievementThreshold('ACH_END01')});
