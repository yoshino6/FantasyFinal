import {writeFileSync,readFileSync} from 'node:fs';
import {achievementDefinitions} from '../../src/game/achievement.config';
let md='# 当前有效成就目录V4\n\n删除135项低门槛条目，新增6项秘闻彩蛋。有效静态定义共196项（165项原基础成就、25项PVP、6项秘闻），另有动态Boss首杀。定义清单不代表全部原有入口已完成验收。\n\n具体条件仅供维护审核，游戏只展示已解锁的名称与简介；删除历史及资产处理见[删减记录](低门槛成就删减记录.md)，彩蛋规则见[彩蛋成就第一期](彩蛋成就第一期.md)，Boss映射见[Boss首杀目录](Boss首杀成就名称与简介V3.md)。\n';
for(const category of [...new Set(achievementDefinitions.map(d=>d.category))]){md+='\n## '+category+'\n\n| 编号 | 名称 | 简介 | 稀有度 | 永久属性 | 审核条件 |\n| --- | --- | --- | --- | --- | --- |\n';for(const d of achievementDefinitions.filter(d=>d.category===category))md+=`| ${d.id} | ${d.name} | ${d.description} | ${d.rarity} | ${d.attribute} | ${d.condition} |\n`;}
writeFileSync('docs/当前有效成就目录V4.md',md);
for(const p of ['docs/成就目录310项V1.md','docs/成就玩家介绍310项V1.md']){const s=readFileSync(p,'utf8');writeFileSync(p,'> 此文件为历史审核稿。135项低门槛成就已退出有效目录，最新清单以[当前有效成就目录V4](当前有效成就目录V4.md)为准。\n\n'+s);}
