import { readFileSync, writeFileSync } from 'node:fs';
import { playerGrowthShares, standardPlayerAttribute } from '../../src/game/growth-rules';
import { forgedEquipmentBase } from '../../src/game/constants';
import { armorSlots, armorPanelPercent, armorPiecePercent } from '../../src/game/armor-class';
import { armorSetFromRows, armorSetDescription } from '../../src/game/armor-set';
const root='.data/stat-balance-migration/2026-09-08T14-08-43-763Z';
const backup=JSON.parse(readFileSync(`${root}/backup.json`,'utf8')), after=JSON.parse(readFileSync(`${root}/after.json`,'utf8')), plan=JSON.parse(readFileSync(`${root}/preview.json`,'utf8'));
const f=(n:number)=>Number(n.toFixed(2)).toString();
const birthKeys=['constitution','spirit','strength','intelligence','agility','perception'];
for(const row of backup.characters){const next=after.characters.find((r:any)=>r.id===row.id);for(const key of [...birthKeys,...birthKeys.map(key=>`${key}_growth`)])if(Number(row[key])!==Number(next[key]))throw Error(`出生/成长被改变 ${row.id}/${key}`);}
const median=(values:number[])=>{values.sort((a,b)=>a-b);return values.length%2?values[(values.length-1)/2]!:((values[values.length/2-1]??0)+(values[values.length/2]??0))/2;};
const classes=['布甲','皮甲','轻甲','重甲','板甲'];
const keys=['accuracyPct','evasionPct','critResistPct','critDamageReductionPct','tenacityPct','speedPct'];
let doc=`# 人物成长与装备属性改动实施记录

日期：2026-09-08。代码、当前配置数据库迁移及本机开发服务重启已完成。

## 1. 已执行范围

- 六维成长改为每十级提高一档：2—10级每级1倍、11—20级2倍、21—30级3倍、31—40级4倍，后续依此类推。出生六维与数据库固定成长字段保持原样，职业已写入成长字段的加成参与倍率。
- 六维转战斗属性公式不变。普通满品质单攻武器为标准躯体攻击的一半；五件防具合计每项双防等于标准躯体防御。双持额外武器继续沿用原规则。
- 五甲基础双防相同；上装、下装分别占整套24%，头肩、腰部、脚部分别占13/75。稀有度与品质沿用现有规则。
- 六项甲类附带属性按实际部位与品质逐件相乘；5件套覆盖3件套。命中、闪避、暴免、暴抗套装修正进入最终概率，板甲减伤进入已有80%上限。
- 新锻造、商店、开局装备、主人测试装备、导师毕业构筑使用共同基准。盾牌按武器预算；匕首保留双攻各90%。副词条上限保留旧基准，未随主词条一起缩放。
- 普通怪物自身六维仍按旧线性成长，虚拟武器与整套防具分别使用新标准躯体的50%预算；玩家实物防具翻倍不传给怪物。普通怪物生命副词条预算保持，存活怪物不重掷出生或特性。
- 人物面板及战斗、PvP、NPC切磋的玩家感知读取同步新成长。NPC自身普通虚拟构筑仍保留原线性成长；导师毕业构筑按新玩家成长，并同步单件、套装与版本。
- 机巧和随从的标准玩家参照曲线同步更新。机巧保留原种子、性格、材料向量和技能历史；旧机巧按原记录确定性重放成长。当前数据库无机巧，迁移路径完成单元测试，未虚称已有实物迁移验收。

## 2. 成长与普通满品质主词条基准

Lv.1为出生面板；到等级L的累计份数为从2到L的ceil(等级/10)之和。标准角色出生六维总和100，固定成长总和10。

| 等级 | 累计成长份数 | 标准躯体单项攻防B | 单攻武器 | 上装/下装每件双防各 | 其他三部位每件双防各 | 五件双防合计各 |
|---|---:|---:|---:|---:|---:|---:|
`;
for(const level of [1,10,11,20,21,30,31,40,41,50,100]){const body=8+4.3*standardPlayerAttribute(level);doc+=`| ${level} | ${playerGrowthShares(level)} | ${f(body)} | ${f(forgedEquipmentBase(level,'武器'))} | ${f(forgedEquipmentBase(level,'防具','upper'))} | ${f(forgedEquipmentBase(level,'防具','shoulder'))} | ${f(body)} |\n`;}
doc+=`
具体人物出生与成长有差异，且会受职业、进化、精通、神器、副词条等影响；表中比例是生成装备的标准锚点，不是强制把每个人的最终面板拆成相同比例。

## 3. 每件防具附带属性（品质100%）

以下为人物属性数值的百分比，不是直接增加同等百分点概率。品质系数为0.6+品质/250，正负项都按此发挥；等级、稀有度不再额外乘这张百分比表。

| 甲类 | 部位 | 命中 | 闪避 | 暴免 | 暴抗 | 韧性 | 速度 |
|---|---|---:|---:|---:|---:|---:|---:|
`;
for(const name of classes)for(const[slot,label]of [['upper','上装、下装（每件）'],['shoulder','头肩、腰部、脚部（每件）']]){const effect=armorPiecePercent(name,slot);doc+=`| ${name} | ${label} | ${keys.map(key=>f(effect[key]??0)+'%').join(' | ')} |\n`;}
doc+=`
## 4. 3/5件套与五件累计效果

| 甲类 | 3件效果 | 5件效果（覆盖3件） |
|---|---|---|
`;
for(const name of classes){const rows=armorSlots.map(slot=>({slot,weapon_type:name}));doc+=`| ${name} | ${armorSetDescription(armorSetFromRows(rows.slice(0,3))!)} | ${armorSetDescription(armorSetFromRows(rows)!)} |\n`;}
doc+=`
五件满品质的逐件乘算结果如下。生命/魔力来自上表套装，最终概率修正单独计算，不能与下表数值百分比相加。

| 甲类 | 命中累计 | 闪避累计 | 暴免累计 | 暴抗累计 | 韧性累计 | 速度累计 |
|---|---:|---:|---:|---:|---:|---:|
`;
for(const name of classes){const effects=armorPanelPercent(armorSlots.map(slot=>({slot,weapon_type:name,quality:100})));doc+=`| ${name} | ${keys.map(key=>f(effects[key]??0)+'%').join(' | ')} |\n`;}
doc+=`
概率使用原基础对抗公式。设原命中率p、攻击者命中修正H、目标闪避修正E，则最终命中率为(p+(1-p)H)(1-E)；暴击概率乘(1-暴免修正)，额外暴伤乘(1-暴抗修正)，强制命中/暴击的优先级保留。

## 5. 存量迁移结果

${Object.entries(plan.counts).map(([key,value])=>'- '+key+'：'+value).join('\n')}

35件无法完整溯源的旧装备已按用户确认方式重设主词条。其他词条保持原值；熔铸只保留原定义与实例差额、台账共同能证明的增量。一次性迁移保持生命/魔力比例，零生命不会复活；普通重算或穿卸装备只截断上限，不免费治疗。

首次提交因寄售保护触发器被拒，事务完整回滚。完善后同步更新1条寄售展示快照；订单状态、卖家、价格、所有权保持。原触发器保留，维护事务锁住订单与实例，中间状态不对外开放。

当前存量未引用的、无法核实早期配方的孤立打造定义保留为历史记录，不作为新打造数据源；所有本次库存/穿戴/实例引用的装备均已检查。寄售实例仍保有原ID。未改价格、掉率、升级经验或神器独有效果。

迁移前后47个人物的出生六维与固定成长逐字段比较一致。以下是同批玩家的缓存面板中位数；迁移前部分角色已通过重算读过新成长，因此这不是“纯旧公式对新公式”的实验对比。

| 玩家等级 | 人数 | 生命：前→后 | 物攻：前→后 | 物防：前→后 | 命中：前→后 |
|---|---:|---|---|---|---|
`;
for(const [low,high]of [[1,10],[11,20],[21,30],[31,100]]){const old=backup.characters.filter((r:any)=>!r.npc_code&&r.level>=low&&r.level<=high);if(!old.length)continue;const next=old.map((r:any)=>after.characters.find((a:any)=>a.id===r.id));doc+=`| ${low}—${high} | ${old.length} | ${['hp_max','physical_attack','physical_defense','accuracy'].map(key=>f(median(old.map((r:any)=>Number(r[key]))))+'→'+f(median(next.map((r:any)=>Number(r[key]))))).join(' | ')} |\n`;}
doc+=`
## 6. 验证与运维记录

- TypeScript：npx tsc --noEmit通过。
- 62项自动测试全部通过，覆盖成长边界至100级、甲类乘算、套装概率、共享减伤上限、盾牌/匕首预算、旧副词条、机巧培养与Boss部位伤害回归。
- 数据库事务集成测试1项通过且全部回滚：真实穿卸装备、重算15项面板、HP/MP不白送、PvE/PvP适配器和装备摘要。
- 迁移后重新预览待修改为0；服务启动后再次核对也为0。补齐开局奖励装备初始化的版本标记，避免启动后重复标记迁移。
- 备份回滚工具已做只读一致性检查，通过；没有在在线玩家身上实际执行回滚。
- 本机开发服务已恢复，数据库初始化完成，QQ连接恢复，17117/17118监听正常。未以此替代长周期玩家实战平衡验收。

备份目录：${root}。backup.json保留迁移前记录，after.json保留提交后人物面板，preview.json保留逐件方案；applied.json证明批次已提交。包含私有游戏数据，仅本地保管。

运维命令（在项目根目录）：

\
\
默认只读预览：npx tsx scripts/migrate-stat-balance.ts --reset-legacy-primary

停服后应用：npx tsx scripts/migrate-stat-balance.ts --reset-legacy-primary --apply

回滚预检：npx tsx scripts/rollback-stat-balance.ts ${root}

回滚需先停服并回退本次数值代码，再加--apply。工具遇到人物、装备归属、寄售状态或属性已变化会拒绝覆盖，应先人工核对；不能拿数小时前的备份覆盖玩家后续活动。

## 7. 后续平衡观察

本次落实了用户确定的数值，未私自把五甲调成同等收益。布甲的命中/闪避、板甲的速度损失仍会形成明显流派差异。1—10级没有新增成长份数；是否减少神器依赖，还受普通装备实际获取、品质、技能威力和怪物组合影响。需按真实战斗观察普通怪击杀行动数、失败率、耗药量及各甲类选择率，再决定是否调整掉落供给或后续数值。
`;
writeFileSync('docs/人物属性组成改动实施记录.md',doc);
console.log('implementation report written; birth and fixed growth unchanged for '+backup.characters.length+' characters');
