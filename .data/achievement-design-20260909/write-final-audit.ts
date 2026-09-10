import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {achievementDefinitions} from '../../src/game/achievement.config';
const walk=(p:string):string[]=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(p,e.name)):[join(p,e.name).replaceAll('\\','/')]);
const sources=walk('src').filter(p=>p.endsWith('.ts')&&!p.endsWith('.config.ts')&&!/achievement-(rules|events|retired|boss-flavour|boss-attributes)/.test(p)&&!p.includes('/database/')).map(p=>({p,lines:readFileSync(p,'utf8').split(/\r?\n/)}));
const ledger=JSON.parse(readFileSync('.data/achievement-design-20260909/ledger-audit-results.json','utf8'));
const boss=JSON.parse(readFileSync('.data/achievement-design-20260909/live-boss-audit.json','utf8'));
const issues:Record<string,string>={
 ACH_A12:'目前等级观察仅定位到冒险战斗升级入口；其他经验来源到级未见统一检查。',ACH_A13:'目前等级观察仅定位到冒险战斗升级入口；其他经验来源到级未见统一检查。',ACH_A14:'目前等级观察仅定位到冒险战斗升级入口；其他经验来源到级未见统一检查。',
 ACH_A18:'副职业等级检查接在炼金、锻造完成；解构等升级未见统一调用。',ACH_A19:'副职业等级检查接在炼金、锻造完成；解构等升级未见统一调用。',ACH_A20:'副职业等级检查接在炼金、锻造完成；解构等升级未见统一调用。',
 ACH_H11:'唯一收获事件 distinct 固定 living_wood，门槛要求3种，目前不可达。',
 ACH_E24:'当前仅炼金成功记录配方；其他亲手制作尚未统一计入。',
 ACH_K08:'目前书店和副职业商店记录实付；市场等入口与退款扣回未接齐。',
 ACH_K09:'目前只记录悬赏铜币奖励；正常卖货净收入与其他正式任务未统一计入。',
 ACH_G10:'当前额外要求至少两名贡献者；定义没有组队限制。receivedHits按命中计数，也不等于独立敌方行动次数。',
 ACH_H05:'代码将所有非植被采集归入此项，尚缺矿石/锻材白名单证明。',
 ACH_J22:'当前按所有可解构且有产物的物品去重，未明确限制材料定义。',
 ACH_E21:'物品识别只检查固定heal/restoreMp，百分比回复是否覆盖不足；需逐种药剂验收。',
 ACH_E12:'当前检查物品定义的稀有度与类型，尚未证明装备实例来源完整接入。'
};
const scope=(s:string)=>s==='世'?'未达成进度限本世；达成与奖励永久保留':s==='场'?'按对应战斗/事件条件；达成与奖励永久保留':'账号累计；达成与奖励永久保留';
const rows=achievementDefinitions.map(d=>{
 const evidence=sources.flatMap(({p,lines})=>lines.flatMap((line,i)=>line.includes("'"+d.id+"'")||line.includes('"'+d.id+'"')?[{p,line:i+1}]:[]));
 const blocked=/^ACH_L2[1-5]$/.test(d.id),tested=d.category==='PVP'||/^ACH_EGG0[1-6]$/.test(d.id);
 const status=d.id==='ACH_H11'?'暂缓：种植成就':blocked?'未开放':issues[d.id]?'未通过：条件或覆盖缺口':!evidence.length?'未通过：无触发入口':tested?'结算验收通过':'入口已接：待完整验收';
 const detail=d.id==='ACH_H11'?'用户已确认暂缓种植成就实装。现有观察仅记录living_wood一种，三种门槛不可达；本次不新增种植配方或补此项入口。':blocked?'仙路五艺尚未开放，服务层明确拦截；不属于当前可达成项目。':issues[d.id]??(!evidence.length?'扫描全src并核对统一观察器、动态编号及相关业务入口，未发现此编号的正式发奖事件；账本通过不代表能够达成。':tested?'逐项结算/边界测试及真实MySQL账本测试通过；未做生产玩家全流程操作。':'已定位正式事件引用，账本测试通过；支付、失败分支及完整玩家路径尚未逐项业务实测，不能标成完成。');
 return {...d,status,detail,ledger:ledger.find((r:any)=>r.id===d.id)?.ledger??'未测试',evidence};
});
const counts=Object.fromEntries([...new Set(rows.map(r=>r.status))].map(s=>[s,rows.filter(r=>r.status===s).length]));
writeFileSync('.data/achievement-design-20260909/final-audit-status.json',JSON.stringify({counts,rows},null,2));
let md='# 成就最终信息与逐项验收记录 V1\n\n核查日期：2026-09-09。此文档汇总当前源码和本次测试证据，替代旧文档中笼统的“已实装”说法；不是所有条目全部完成的证明。后续按同一编号更新结果，不另造一套成就编号。\n\n## 验收结论\n\n范围：202项有效静态定义，另核对正式库已生成的2项Boss首杀。已删除的135项低门槛成就不重新列为开放项目；？？？的10条路线不在本期开放范围。静态目录仍包含5项被服务层拦截的仙路五艺预备定义，下文单独标为未开放。\n\n| 结果 | 数量 | 含义 |\n| --- | ---: | --- |\n';
for(const [status,n] of Object.entries(counts))md+=`| ${status} | ${n} | ${status==='结算验收通过'?'真实结算函数和账本已测；不等于生产端到端验收':'详见每项说明'} |\n`;
md+='\n## 测试证据与边界\n\n本次合并运行261项测试，全部通过、零跳过；`npx tsc --noEmit`通过。测试通过不等于所有成就功能完成，具体证据范围如下。\n\n1. `test/achievement-catalogue-audit.integration.test.ts`：依目录顺序生成202个独立子测试。197项验证门槛前、跨门槛、事务回滚、同事件重试、重复达成、第一/第二名、奖励属性/稀有度、两群公告队列及同账号注销换角色保留；5项验证未开放拦截。输入是人工构造的合法成就事件，只证明账本，不证明玩法产生事件。\n2. `test/achievement-pvp-audit.test.ts`：25项逐项调用正式PVP成就结算函数，另验无效状态、零伤害、同身份、低等级对手、HP/等级/回合边界；数据库测试另外覆盖同对手同日去重。P24在存储回合号11时满足十回合，原因是正式战斗先将turn_no加1再结算。\n3. `test/achievement.integration.test.ts`：真实隔离MySQL验证合作首发、不同事件隔离、彩蛋连续失败与逆转、残血/元素/命中边界、新六项去重与门槛、道具匣单开/批量/回滚、Boss目录迁移等。战斗证据部分为构造输入，未模拟每次实际按技能。\n4. `test/achievement.test.ts`、`test/achievement-delivery.test.ts`、`test/opening-message.test.ts`：目录、稀有度、Boss204项预备文案、奖励平衡、QQ排版、消息结果分类及隐藏路线入口回归。\n5. 正式库仅只读统计Boss已生成定义及完成数量，没有给真人补发成就、改名次或主动发送测试公告。所有写库测试使用随机隔离数据库并在结束后删除该测试库。\n\n**最终通过条件**：还须由真实业务入口验证主条件、附加/排除条件、次数与时点、正常支付、失败回滚、重试、落库和完整玩家路径。面板永久属性已验证账本读取与重修保留；完整面板六维换算及PVP进入/退出还原未逐项验证。本次不改变既有成就数值或条件，不擅自简化未通过项。\n\n## 共用最终规则\n\n仅显示本人已解锁的成就与分类；列表每页10项。详情公开名称、凝练简介、永久属性、分类、稀有度、全服名次、完成率、达成时间和注销保留提示，不公开条件。本文中的条件供维护审核。\n\n稀有度由低到高：普通、优秀、精良、稀有、传说、史诗。属性以每项明确数值为准。全服第一位获得奇珍道具匣×1；受支持的同场合作成就由同一合作结算中的符合者共同获得首发奖励，其他个人成就仍为单人首位。每个成就独立消息，按群排队发送，不能保证各群同时抵达。奇珍道具匣支持随机批量打开；其中道具战斗使用仍未完成，不能把“匣子可开”当成战斗使用已完成。\n';
for(const category of [...new Set(rows.map(r=>r.category))]){
 md+='\n## '+category+'\n';
 for(const d of rows){if(d.category!==category)continue;
 md+=`\n### ${d.id} ${d.name}\n\n${d.description}\n\n- 最终奖励：${d.rarity}；永久${d.attribute}。\n- 最终达成要求：${d.condition}\n- 保存规则：${scope(d.scope)}。\n- 验收：**${d.status}**；账本：${d.ledger}。\n- 核查说明：${d.detail}\n- 入口证据：${d.evidence.length?d.evidence.slice(0,5).map(e=>`[${e.p}:${e.line}](../${e.p})`).join('、'):'无正式触发记录'}。\n`;
 }
}
md+='\n## 正式库已生成的Boss首杀\n\n只将下面两项列为本次确认已存在的动态记录。已有玩家完成记录是运行证据，但不代替每种难度的边界测试。它们使用通用Boss结算与合作首发机制，通用测试已通过；各自完整玩家复现仍未执行。\n';
for(const b of boss){const d=typeof b.definition_json==='string'?JSON.parse(b.definition_json):b.definition_json;md+=`\n### ${d.id} ${d.name}\n\n${d.description}\n\n- 模板与难度：${b.boss_code} / ${b.difficulty}。\n- 最终奖励：${d.rarity}；永久${d.attribute}。\n- 达成要求：${d.condition}\n- 正式库完成记录：${b.completed_count}人。\n- 验收：已有运行记录；通用结算测试通过，具体Boss端到端待验。\n`;}
md+='\n## Boss预备文案不等于已开放\n\n[Boss首杀目录V3](Boss首杀成就名称与简介V3.md)包含17组遭遇×12种标签共204项预备文案与奖励。它们是未来实际遇敌并获胜时使用的模板，不代表204个难度入口已经开放。不得将大学者·噶、旧迷宫镇守者或哥布林国王队伍的哈巴龙/护卫各自列作独立Boss成就。哥布林国王团队只算一组。\n\n## 后续验收顺序\n\n种植成就H11按用户要求暂缓，不进入本轮补全。先处理其余“条件或覆盖缺口”，再按A至L补齐“无触发入口”；每条补齐后增加真实入口测试，再把“入口已接”推进为完整验收通过。？？？与仙路五艺继续保持未开放。涉及改动达成要求或简化玩法时，先给具体改案由用户确认。\n';
writeFileSync('docs/成就最终信息与逐项验收记录V1.md',md);console.log(JSON.stringify(counts));
