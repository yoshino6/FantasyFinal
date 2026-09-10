import {writeFileSync,appendFileSync,readFileSync} from 'node:fs';
import {achievementDefinitions} from '../../src/game/achievement.config';
import {easterAchievementDefinitions} from '../../src/game/achievement-easter.config';
let intro='# 彩蛋成就第二期\n\n新增6项，秘闻合计12项。以下条件仅用于维护审核，游戏不展示条件、未解锁条目或进度。所有新增成就均为个人达成，稀有品质、永久单项属性+5，本批六维各+5；成就、进度及奖励绑定账号，注销重修后保留。\n\n从更新生效后的真实操作开始累计，不回填历史行为。沿用全服名次、完成率、首位奇珍道具匣和公告机制。\n\n| 编号 | 名称 | 简介 | 属性 | 具体条件 |\n| --- | --- | --- | --- | --- |\n';
for(const d of easterAchievementDefinitions.slice(6))intro+=`| ${d.id} | ${d.name} | ${d.description} | ${d.attribute} | ${d.condition} |\n`;
intro+='\n## 入口与结算\n\n- 炼金三项：个人三槽炼金正式完成请求后记录，与材料支付、炼金手记、产物及请求回执共用事务。一次多批按实际大成功批数计；炸炉按整单判定，一次最多计一次。配方只计成功，槽位顺序参与去重。\n- 交涉：和平结算并将怪物生命标记已解决后，仅给实际操作人记录模板；赠礼支付和战利品结算沿用原规则。\n- 解构：个人解构实际扣除投入物并发放产物后记录；构造物回拆、商店代工不参与。物品定义去重，数量不加速。\n- 采集：到时完成、成功占用资源实例并入包后记录；不同刷新实例可计入，重复同一资源实例不计。\n\n没有额外成就费用。累计及去重由账号成就账本持久化，跟业务事务一同提交；回滚不计，炼金请求令牌、交涉会话、采集实例及解构物品去重防止重试推进。上述入口原有支付与资源竞争检查保持有效。\n\n## 验证\n\n实际 MySQL 隔离测试库验证六项门槛前不解锁、精确跨门槛解锁、重复事件、重复种类、事务回滚、重试及奖励落库。既有成就测试同时回归。正式游戏入口已接入并核查调用位置；未在生产服消耗玩家材料、模拟交涉或发送测试公告，也未手动重启机器人。\n';
writeFileSync('docs/彩蛋成就第二期.md',intro);
let md='# 当前有效成就目录V4\n\n删除135项低门槛条目，新增12项秘闻彩蛋。有效静态定义共202项（165项原基础成就、25项PVP、12项秘闻），另有动态Boss首杀。定义清单不代表全部原有入口已完成验收。\n\n具体条件仅供维护审核，游戏只展示已解锁的名称与简介。彩蛋见[第一期](彩蛋成就第一期.md)与[第二期](彩蛋成就第二期.md)，历史删除见[删减记录](低门槛成就删减记录.md)。\n';
for(const category of [...new Set(achievementDefinitions.map(d=>d.category))]){md+='\n## '+category+'\n\n| 编号 | 名称 | 简介 | 稀有度 | 永久属性 | 审核条件 |\n| --- | --- | --- | --- | --- | --- |\n';for(const d of achievementDefinitions.filter(d=>d.category===category))md+=`| ${d.id} | ${d.name} | ${d.description} | ${d.rarity} | ${d.attribute} | ${d.condition} |\n`;}
writeFileSync('docs/当前有效成就目录V4.md',md);
appendFileSync('docs/成就系统第一期实装记录.md','\n\n## 2026-09-09 彩蛋第二批\n\n新增 ACH_EGG07～12，个人炼金、交涉、解构、采集正式事务已接入。秘闻合计12项，有效静态定义202项。具体要求与结算边界见[彩蛋成就第二期](彩蛋成就第二期.md)。沿用账号永久保存及个人首位公告；没有回填历史计数。\n');
