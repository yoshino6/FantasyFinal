import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {monsterGrowthAnchors} from '../../src/config/monster-growth-anchors';
import {advancedMentorTrialBuild} from '../../src/game/advanced-mentor-trial.config';
import {worldTreeAdvancedProfessions,inheritancePassiveFor} from '../../src/game/advanced-profession.config';
import {regionalBossComponentsFor} from '../../src/game/regional-boss-components.config';
const s=JSON.parse(readFileSync('.data/enemy-balance-20260908/verified-before.json','utf8'));
const c=JSON.parse(readFileSync('.data/enemy-balance-20260908/comparison.json','utf8'));
const root='.data/enemy-stat-migration';
const runs=readdirSync(root).filter(dir=>{try{return JSON.parse(readFileSync(`${root}/${dir}/result.json`,'utf8')).committed}catch{return false}}).sort();
const first=JSON.parse(readFileSync(`${root}/${runs[0]}/result.json`,'utf8'));
const last=JSON.parse(readFileSync(`${root}/${runs.at(-1)}/after.json`,'utf8'));
const parse=(v:any)=>typeof v==='string'?JSON.parse(v):v;
const n=(x:number)=>Math.round(x*1000)/1000;
const change=(old:number,next:number)=>`${old} → ${next}`;
const mentors=worldTreeAdvancedProfessions.map(p=>({code:p.code,name:p.mentor.name,build:advancedMentorTrialBuild(p,inheritancePassiveFor(p.code))}));
writeFileSync('.data/enemy-balance-20260908/mentor-audit.json',JSON.stringify(mentors,null,2));
const lines=[
'# 怪物与域民属性重算实施记录',
'',
'日期：2026-09-08。已修改源码、迁移当前配置数据库并重启本机开发服务。本文件更新上一版“怪物与普通域民仍线性成长”的口径。',
'',
'## 结论',
'',
'怪物和域民现均使用人物的分段成长：2—10级每级1份固定成长、11—20级2份、21—30级3份、31—40级4份，后续每十级加1份。Lv.1是出生面板，没有额外虚构0升1。六维转战斗属性公式保持不变。',
'',
'怪物同时下调各自的有效固定成长基数，保留种类差异与出生随机六维。当前4,774只非居民活体样本中，生命平均下降5.64%，物攻下降4.51%，魔攻下降5.38%，双防下降约3.5%，命中和闪避下降约6.15%；这些项目没有上涨的样本。这是逐只新旧比值的算术平均，不代表战斗胜率。另有2只居民型剧情试炼实体单独处理，不能算进“怪物全面减弱”的结论。',
'',
'域民按完整人物成长和完整人物虚拟防具预算计算，高等级域民会明显增强。这是用户确认的结果；普通怪物难度预算与域民角色配装预算仍分开。',
'',
'## 1. 覆盖范围与落库结果',
'',
'| 对象 | 本次覆盖 | 结果 |','| --- | ---: | --- |',
`| 怪物模板 | ${s.templates.length}种 | 每种重算六维、战斗面板及虚拟装备；固定成长校准表191项 |`,
`| 怪物历史实体 | ${s.spawns.length}条 | 全部计算检查；已结束遭遇保留历史记录 |`,
`| 存活怪物 | ${first.liveSpawns}只 | ${first.spawnChanges}只修正当前血量，剩余血量已符合新标准；攻击、防御等实时派生 |`,
'| 地图人物/设施入口 | 116个 | 64个可切磋入口，各验算玩家等级1/10/20/30/40/50，共384份构筑 |',
'| 持久化域民切磋构筑 | 49份 | 全量刷新六维、虚拟装备和甲类效果；保留原等级、装备档次与技能选择 |',
'| 角色表中的NPC队友 | 3名 | 已按新公式重算15项战斗属性；重启后复算一致 |',
`| 导师毕业试炼 | ${mentors.length}套职业构筑 | 原实现已使用G(30)=59；本次重新生成核对，继续使用职业专属装备、套装与传承 |`,
'| 活动切磋/导师/部位快照 | 本次迁移时0场活动战斗 | 不改写已结束战斗；新切磋与Boss部位由新面板生成 |',
'',
'存活实体的模板ID、等级、出生六维逐条回读保持一致。地图位置、随机特性、掉落、技能、遭遇归属与交涉历史未重掷。NPC队友已在开发服务自动重载时升至版本4，所以手工迁移报告中的characterChanges=0并非漏改；数据库集成验收再次逐名验证。',
'',
'## 2. 怪物成长如何校准',
'',
'设G(L)=从2到L的ceil(k/10)之和。每种怪物固定一个校准等级A：取此次模板等级、已出现等级范围的上沿，至少10级；地牢史莱姆范围补齐至16级。配置固定写入src/config/monster-growth-anchors.ts，刷新时不重新抽取，不随怪物当前等级改变。未知新种类默认按新标准成长系数1。',
'',
'- 有效固定成长 g新 = g原 × (A−1)/G(A)。',
'- 最终六维 = floor((出生六维 + g新 × G(L)) × 原六维特性倍率)。',
'- 在校准等级A处，躯体六维与原线性成长相同；低于A时相同或更低，高于A后按分段成长继续增加。',
'- 数据库原始growth字段继续作为种类配置输入，运行时乘固定校准系数；不将最终六维写回出生字段，也不反复缩放数据库growth，避免初始化覆盖或重复成长。',
'- city_*执法居民、scholar_ga及导师身份不使用怪物降档系数，按完整人物G(L)成长。固定等级队友原有0成长不另行随机生成成长值。',
'',
'| 校准等级A | G(A) | 有效成长/原成长 |','| ---: | ---: | ---: |',
'| 10 | 9 | 100% |','| 20 | 29 | 65.517% |','| 30 | 59 | 49.153% |','| 40 | 99 | 39.394% |','| 50 | 149 | 32.886% |',
'',
'以上系数是种类的固定基数调整，不是取消用户确定的1/2/3/4倍升级规则。将来主动扩大某种怪物的出现等级范围，应重新核对其固定校准等级，不能默认为超范围高等级仍保持旧难度。',
'',
'## 3. 虚拟装备与域民配装',
'',
'设B(L)=8+4.3×(100+10G(L))/6，档位系数R=稀有度倍率×品质发挥。',
'',
'| 对象 | 主武器主词条 | 五件防具合计：每项双防 | 单件/套装 |','| --- | --- | --- | --- |',
'| 普通怪物/精英/Boss | 0.5B×R | 0.5B×R | 不套用玩家五甲百分比与套装 |',
'| 域民切磋虚拟配装 | 0.5B×R | B×R | 按职业甲类、实际品质逐件乘算，并使用5件套 |',
'| 执法/剧情居民模板 | 0.5B×R | B×R | 原未指定甲类，保留其特性，不凭空增添套装 |',
'| 角色表固定NPC队友 | 0.5B×R | B×R | 原无具体甲类，仅补全15项虚拟装备属性，不凭空增添套装 |',
'',
'怪物的主攻方向依据原构筑维持，避免体质/智力等成长权重改变后，将整把虚拟武器突然切换到另一攻击侧。副词条数量、原上限及期望发挥沿用已有规则；防具主词条翻倍不把生命、命闪等副词条再翻倍。',
'',
'| 域民基础职业 | 默认五件甲类 | 主要5件套效果 |','| --- | --- | --- |',
'| 战士 | 重甲 | 生命+25%，暴免/暴抗修正各+16% |',
'| 法师 | 布甲 | 命中/闪避修正各+33% |',
'| 盗贼 | 皮甲 | 命中修正+25%，魔力+20% |',
'| 牧师 | 轻甲 | 生命/魔力各+15% |',
'',
'导师仍采用各职业原先明确指定的甲类，含板甲，不强制套上述普通域民默认表。所有套装5件覆盖3件，不叠两次。命中、闪避等修正由敌方战斗适配器传入原最终概率公式；“+33%修正”不是简单增加33个百分点。',
'',
'## 4. 同步修复的旧路径',
'',
'1. 地牢小怪、刷新补怪和Boss出生HP原先另用旧公式，现统一调用实际战斗计算器，计入新六维、虚拟装备及特性。',
'2. 剧情怪物出生HP统一按实际保存的遭遇特性计算，避免出生血量与战斗上限不一致。',
'3. 进化试炼的无展示名标记原先被过滤，导致既定三倍生命在实战上限中漏算，现与出生规则统一。当前两只22级噶的计算上限2191→8297；其中一只旧当前HP为9584、另一只2191，均统一为新上限8297。这个剧情试炼属于显著增强例外，必须单独观察通关情况。',
'4. Boss标准化、世界Boss衰减及战斗查询统一携带模板种类码，确保使用同一固定成长系数。',
'5. Boss部位直接从新本体最终面板按原比例生成，不再另加虚拟装备；旧已结束部位快照保留历史。',
'6. NPC队友原虚拟装备只加双攻双防，遗漏HP、MP及命闪等，现补全15项；初始化不再用旧种子面板覆盖已重算NPC、无条件回满血。',
'7. 域民成长与训练六维统一到一位小数，消除JSON存储浮点差异导致的重复迁移。',
'8. 切磋与导师的鉴识六维改为读取实际构筑快照，避免战斗属性已更新、六维展示仍使用占位模板。',
'',
'## 5. 验证、备份与边界',
'',
'- npx tsc --noEmit通过。53项相关自动回归全部通过，覆盖固定成长、全校准种类、装备预算、人物面板、套装与Boss部位。',
'- 2项数据库事务集成测试通过且回滚：人物穿卸装备/双战斗适配器；全活体血量、49份域民构筑幂等、3名NPC角色复算与域民敌方套装传递。',
'- 改动前计算器与迁移用旧HP计算器逐一比较4,776只活体，差异0；204模板及18,406历史实体的新面板均无NaN或负数。',
'- 迁移前PVE/PVP/交涉活动数均为0；备份后事务提交。重启后再次预览：怪物0项、域民构筑0项、角色NPC0项待修改。',
'- 本机服务已恢复，管理后台http://127.0.0.1:17118/admin返回200。没有进行线上客户端完整通关或长期胜率统计。',
'',
`首次迁移备份：${root}/${runs[0]}/backup.json。域民精度修正备份：${root}/${runs.at(-1)}/backup.json。改动前全量只读快照：.data/enemy-balance-20260908/before.json。出生空值依照运行时COALESCE模板补齐后用于计算的快照：verified-before.json；未改写数据库出生空值。`,
'',
'逐怪新旧对比与384份域民场景数据见.data/enemy-balance-20260908/comparison.json；逐模板有效成长六维见最新迁移preview.json的templateAudit；导师毕业面板见mentor-audit.json。脚本scripts/migrate-enemy-stat-balance.ts默认只读，首次执行要求提供改动前快照，重复执行由game_data_migrations记录避免再次按比例缩血。',
'',
'## 6. 建议',
'',
'当前方案能降低常规刷怪压力，同时让11级以后的人物成长更有价值；1—10级成长份数没有增加，低级体验主要依靠防具双防提升与怪物成长基数下调。不能据此断言神器依赖已经解决。',
'',
'建议下一步分别记录无神器同级普通装备角色的击杀行动数、失败率、耗药量；普通怪、精英、Boss、域民切磋和进化试炼分别统计。优先观察22级噶的主线门槛、高等级布甲域民的命闪，以及重/板甲速度损失。若主线明显变难，应单独调整剧情生命倍率或该NPC基础值；不要再次统一抬高所有怪物来追平人物成长。',
'',
'## 附表A：所有模板的标准计算面板',
'',
'以下按模板出生六维和标称等级计算，不含刷新随机出生分配、随机特性与遭遇专属倍率，不能当成所有活体的实际面板。部位/导师模板的实战由各自快照构筑覆盖，表中明确标注。成长系数保留三位小数，运行时不按此展示精度截断。',
'',
'| 怪物名称/代码 | 等级 | 校准等级 | 成长系数 | 生命：旧→新 | 主攻：旧→新 | 物防/魔防：新 |',
'| --- | ---: | ---: | ---: | ---: | ---: | ---: |'
];
const parts=new Set(['gruen_mountainheart','valk_forge_overseer'].flatMap(code=>regionalBossComponentsFor(code).map(p=>p.templateCode)));
for(const t of c.templates){const special=t.code.startsWith('mentor_trial_')?'导师构筑':parts.has(t.code)?'本体派生':'';lines.push(`| ${t.name}（${t.code}） | ${t.level} | ${monsterGrowthAnchors[t.code]??10} | ${n(t.coefficient)} | ${special||change(t.before.hpMax,t.after.hpMax)} | ${special||change(Math.max(t.before.physicalAttack,t.before.magicAttack),Math.max(t.after.physicalAttack,t.after.magicAttack))} | ${special||`${t.after.physicalDefense}/${t.after.magicDefense}`} |`)}
lines.push('','## 附表B：49份持久化域民构筑重算结果','','保留的是每份缓存原先的等级、品质、装备等级与技能。未来查看时仍按原有玩家进度/世界阶段生成稳定构筑，因此不承诺这里每个缓存等级永远不变。','','| 域民 | 等级 | 甲类 | 生命：旧→新 | 魔力：旧→新 | 主攻：旧→新 | 新双防 | 新命中/闪避 |','| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |');
for(const r of last.profiles){const p=parse(r.profile_json),old=parse(s.profiles.find((v:any)=>v.npc_code===r.npc_code).profile_json).stats;lines.push(`| ${p.name}（${r.npc_code}） | ${p.level} | ${p.armorType} | ${change(old.hpMax,p.stats.hpMax)} | ${change(old.mpMax,p.stats.mpMax)} | ${change(Math.max(old.physicalAttack,old.magicAttack),Math.max(p.stats.physicalAttack,p.stats.magicAttack))} | ${p.stats.physicalDefense}/${p.stats.magicDefense} | ${p.stats.accuracy}/${p.stats.evasion} |`)}
lines.push('','## 附表C：固定NPC队友与导师毕业面板','','| NPC队友 | 等级 | 生命：旧→新 | 魔力：旧→新 | 新双攻 | 新双防 | 新命中/闪避 |','| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
for(const r of last.characters){const old=s.npcCharacters.find((v:any)=>v.id===r.id);lines.push(`| ${r.name} | ${r.level} | ${change(old.hp_max,r.hp_max)} | ${change(old.mp_max,r.mp_max)} | ${r.physical_attack}/${r.magic_attack} | ${r.physical_defense}/${r.magic_defense} | ${r.accuracy}/${r.evasion} |`)}
lines.push('','| 导师 | 职业 | 甲类 | 生命/魔力 | 双攻 | 双防 |','| --- | --- | --- | ---: | ---: | ---: |');
for(const r of mentors){const a=r.build.stats;lines.push(`| ${r.name} | ${r.code} | ${r.build.equipment.armor} | ${a.hpMax}/${a.mpMax} | ${a.physicalAttack}/${a.magicAttack} | ${a.physicalDefense}/${a.magicDefense} |`)}
writeFileSync('docs/怪物与域民属性重算实施记录.md',lines.join('\n')+'\n');
console.log(JSON.stringify({templates:c.templates.length,profiles:last.profiles.length,mentors:mentors.length,lines:lines.length}));
process.exit(0);
