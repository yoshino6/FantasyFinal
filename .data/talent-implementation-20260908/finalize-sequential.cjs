const fs=require('node:fs'),assert=require('node:assert/strict');
const master='docs/新版天赋逐项验收记录.md',sequence='docs/新版天赋顺序验收通过记录.md',implementation='docs/新版天赋第一期实装记录.md';
let text=fs.readFileSync(master,'utf8');
const rows=text.split(/\r?\n/).filter(line=>/^\| [A-I]\d{2} [^|]+\|/.test(line));assert.equal(rows.length,90);assert.ok(rows.every(row=>row.split('|')[2].trim()==='已通过'));assert.equal(new Set(rows.map(row=>row.split('|')[1].trim().slice(0,3))).size,90);
text=text.replace(/这是逐项检查与续核记录，[\s\S]*?\n\n状态口径：/,'已按 **A01→I10** 顺序逐条核对、修复、验证并记录，**90项均已通过服务端验收**。每类10项，共九类；J类“？？？”10项仍暂缓。完整逐项证据见 [新版天赋顺序验收通过记录](./新版天赋顺序验收通过记录.md)。\n\n状态口径：');
text=text.replace(/上一版把客户端待测[^\n]+/,'本轮按约定完成每条主效果、附加效果、排除条件、次数/时点、支付、重试与落库核对；涉及常驻面板变化的另跑PVP进入、退出和重新进入PVE还原。通过项保留扩展组合说明，不再用未穷举组合或未实发QQ阻止服务端通过。');
text=text.replace('每项剩余组合仍在下表列出，不将“缺陷已修复”写成“所有分支通过”。','此后已依次完成90项核心验收；逐项记录保留更广组合的扩展边界。');
const evidence=`## 自动化证据与限制

以下为本次顺序验收后的最终检查，原closure-*结果仅为此前历史。

| 检查 | 结果 | 输出文件 |
| --- | --- | --- |
| A01～I10实际服务连续旅程 | **91/91通过**，含90项子测试和父测试 | sequential-all-final.txt |
| 最小隔离MySQL：事务、材料、绑定、额度、重放与迁移 | **42/42通过** | sequential-db-final.txt |
| 天赋、选项、详情撤回、机巧、Boss部位与初始装备相关规则 | **101/101通过** | sequential-unit-final.txt |
| 扩展常驻/原生/隐藏战斗规则 | **114/115通过**；1条NPC面板预期不一致，单列下文 | sequential-combat-final.txt |
| TypeScript | npx tsc --noEmit通过 | sequential-tsc-final.txt |
| 本次范围差异检查 | git diff --check通过，仅CRLF转换提示 | sequential-diff-final.txt |

实际服务旅程使用真实服务函数、SQL事务和物品/配方定义，涵盖开战、行动、胜利一次结算、重复请求，以及各条目的专属入口；战斗、时间和库存由明确隔离夹具控制。F01、F02、F03、F10、G03、G05、G06、H01另走实际PVP开战、退出、重复退出拒绝与重新进入PVE，核对HP和元素精通还原。首次连续回归发现F02旅行到镇后触发新手剧情锁，已把Lv.10测试人物设为完成新手剧情，再次连续91/91通过，未改动正式剧情限制。

扩展失败为test/resident-combat.test.ts的“NPC profiles use the player formula once…”：当前NPC公式包含护甲类型/套装修正及resident装备口径，该测试仍按旧公式计算。对应src/game/npc-sparring.config.ts已有工作区修改，本轮没有修改它或用改预期方式掩盖差异。此项不是天赋主效果失败，后续NPC面板任务需单独更新其测试和公式核对；不宣称整个仓库测试全绿。

输出位于.data/talent-implementation-20260908/，单条证据为sequential-A01.txt等，部分合并文件在顺序记录中明确列出。每份测试均检查TAP通过/失败数，不以命令最后打印文件的退出码代替结果。

测试随机建库并清理，运行库无测试写入。旅程库CREATE TABLE LIKE复制列与索引，**不复制外键**，不能视为完整生产迁移演练。仅在隔离库执行初始化/迁移；未单独迁移运行库、重启机器人或发送QQ消息。QQ列表5条分页、分类蓝色按钮、详情显示和60秒撤回的实发效果仍属客户端验收；规则/消息测试通过不能代替实发。

### 两项已确认调整的通过条件`;
text=text.replace(/## 自动化证据与限制[\s\S]*?### 两项已确认调整的通过条件/,evidence);
text=text.replace(/^\| C04 \|.*$/m,'| C04 | 个人成功换配方熟练×4，首次/同方×1.50；旧旁通余额可投当前副职业 | 失败不推进记录，代工及派生奖励排除 | 真实材料实扣、令牌重放和满级余额通过 | 其他配方组合另作扩展 |');
text=text.replace(/^\| E05 \|.*$/m,'| E05 | 经确认新增糖水屋普通恢复药剂五折，与公会共用每日5000铜额度 | 仅合格普通商品，补给额度优先；不重上旧公会商品 | 实际购买、余额不足回滚、绑定及回售拒绝通过 | 稀有及混合库存组合另作扩展 |');
text=text.replace(/按A→I顺序处理剩余条目[^\n]+/,'A01～I10顺序验收已完成。后续仅保留各行明确列出的扩展组合、上述NPC面板测试差异、生产迁移及QQ实际客户端验证；任何新增机制简化仍先请用户确认，J类继续暂缓。');
fs.writeFileSync(master,text);
let log=fs.readFileSync(sequence,'utf8');const codes=[...log.matchAll(/^## ([A-I]\d{2}) /gm)].map(m=>m[1]);assert.equal(codes.length,90);assert.deepEqual(codes,[...'ABCDEFGHI'].flatMap(g=>Array.from({length:10},(_,i)=>g+String(i+1).padStart(2,'0'))));
log=log.replace('从A01起依次收尾。','2026-09-09：A01～I10共90项已按顺序完成服务端验收。');log+='\n## 最终联合回归\n\n90项连续服务旅程91/91、隔离MySQL42/42、天赋及相关规则101/101通过；TypeScript与范围内diff检查通过。扩展战斗测试114/115，单独记录1条NPC旧面板预期差异；详见主验收文档。QQ实发与生产迁移未执行，J类暂缓。\n';fs.writeFileSync(sequence,log);
let impl=fs.readFileSync(implementation,'utf8');const start=impl.indexOf('## 2026-09-09 后续实装与展示调整');assert.ok(start>0);
impl=`# 新版天赋第一期实装记录

目录统一100项，**A～I九类共90项已按编号逐项通过服务端验收**，每类10项。J类“？？？”10项仍仅保留目录和说明，选择入口拒绝，留待下一期；旧18项神技不再作为可选目录。

## 2026-09-09 顺序验收完成

按A01→I10依次核主效果、附加效果、排除条件、次数/时点、支付、重试与落库，并补实际服务玩家路径；涉及面板的另验PVP进入/退出/PVE还原。每条验证后单独记录，不以公共开战路径替代专属效果证据。完整记录见 [逐项验收](./新版天赋逐项验收记录.md) 与 [顺序通过记录](./新版天赋顺序验收通过记录.md)。

本轮修复：机巧包装器漏传主动直击标志；B09调查3/3提示；B10实际抵达后的路线提交；D04负好感存储迁移；E03料理返回实际增益；E06普通修理包累计实扣与预览；F01朱雀灼烧破韧/火抗、净化和Boss清除；G05软减益提示与过期状态去重；H07未实际恢复药剂误取消资格；I04预备施法资源返还/回响；I09普通药剂换盾不扣药。均保持已确认效果，无新增未经确认的机制简化。

C04按已确认配方切换方案，E05按已确认糖水屋折扣方案；各条详细数值、支付和排除条件在顺序记录中。

最终结果：实际服务连续旅程91/91、最小隔离数据库42/42、天赋及相关规则101/101通过，npx tsc --noEmit通过。扩展常驻/原生/隐藏战斗规则114/115：1条NPC面板旧预期未包含现有护甲套装公式，独立列在主验收文档，不宣称全仓测试全绿。

只在随机隔离库执行测试和初始化，未对运行库单独迁移、重启机器人或QQ实发。生产外键/迁移演练及客户端分页、蓝色分类按钮、详情、60秒撤回需另验。下方保留此前实施过程；90项当前状态列已同步为服务端验收通过。

`+impl.slice(start);impl=impl.split(/\r?\n/).map(line=>/^\| [A-I]\d{2} \|/.test(line)?line.replace('入口已接入，待逐项验收','服务端验收通过'):line).join('\n');fs.writeFileSync(implementation,impl);
console.log('Verified 90 unique ordered acceptance records; all three documents updated.');
