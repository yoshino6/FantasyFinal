import { randomUUID } from 'node:crypto';
import { Format } from 'alemonjs';
import { achievementBoxes } from './achievement-rewards.config.js';
import { createFormatWithoutGroupMention } from '../middleware/group-reply-mention.js';

const achievementAnnouncementFormat = (entry) => {
    const md = Format.createMarkdown().addTitle('世界的回响').addNewline().addNewline();
    md.addText(`${(entry.winners?.length ? entry.winners : [entry.winner]).map(name => `【${name}】`).join('、')}达成`).addNewline().addNewline()
        .addText(entry.name).addNewline().addNewline().addBlockquote(`${entry.description}\n>\n>`).addNewline().addNewline()
        .addText('获得：奇珍道具匣 ×1').addNewline().addNewline();
    return createFormatWithoutGroupMention().addMarkdown(md);
};
const numbers = '①②③④⑤⑥⑦⑧⑨⑩';
const achievementListFormat = (data) => {
    const md = Format.createMarkdown().addTitle('足迹').addNewline().addNewline();
    data.visibleCategories.forEach((category, i) => { md.addButton(`[${category}]`, { data: `/足迹 ${category} 1`, autoEnter: false }); if ((i + 1) % 5 === 0)
        md.addNewline(); });
    md.addNewline().addNewline().addText(`当前分类：${data.category}`).addNewline().addNewline();
    if (!data.entries.length)
        md.addText('这里还没有属于你的成就记录。').addNewline();
    data.entries.slice(0, 10).forEach((entry, i) => { md.addText(`${numbers[i]} `).addButton(entry.name, { data: `/成就详情 ${entry.id}`, autoEnter: false }).addNewline().addBlockquote(`全服第${entry.rank}位达成 · 全服完成率 ${entry.percentage}`).addNewline().addNewline(); });
    md.addText(`第 ${data.page}/${data.totalPages} 页`).addNewline();
    if (data.page > 1)
        md.addButton('[上一页]', { data: `/足迹 ${data.category} ${data.page - 1}`, autoEnter: false });
    if (data.page < data.totalPages)
        md.addButton('[下一页]', { data: `/足迹 ${data.category} ${data.page + 1}`, autoEnter: false });
    md.addNewline().addNewline().addButton('[足迹奖励]', { data: '/成就奖励', autoEnter: false });
    return Format.create().addMarkdown(md);
};
const achievementDetailFormat = (entry) => Format.create().addMarkdown(Format.createMarkdown().addTitle(entry.name).addNewline().addNewline()
    .addText(entry.description).addNewline().addNewline()
    .addBlockquote(`**永久属性：${entry.attribute}**`).addNewline()
    .addBlockquote(`分类：${entry.category}`).addNewline()
    .addBlockquote(`稀有度：${entry.rarity}　全服第${entry.rank}位达成`).addNewline()
    .addBlockquote(`全服完成率：${entry.percentage}`).addNewline()
    .addBlockquote(`达成时间：${entry.completedAt}`).addNewline().addNewline()
    .addText('注销重修后仍然保留').addNewline().addNewline()
    .addButton('[返回足迹]', { data: `/足迹 ${entry.category} 1`, autoEnter: false }));
const achievementBoxCommand = { odd_box: '打开奇异道具匣', rare_box: '打开奇珍道具匣', collector_box: '打开珍藏道具匣' };
const appendAchievementBox = (md, key, quantity) => {
    if (quantity <= 0)
        return md;
    const box = achievementBoxes[key], command = achievementBoxCommand[key];
    return md.addBold(`${box.name} ×${quantity}`).addNewline().addBlockquote(box.description).addNewline()
        .addButton('[打开]', { data: `/${command} ${randomUUID()}`, autoEnter: false }).addText(' ')
        .addButton('[批量打开]', { data: `/${command} ${randomUUID()} `, autoEnter: false }).addNewline().addNewline();
};
const achievementRewardsFormat = (data) => {
    const md = Format.createMarkdown().addTitle('足迹奖励').addNewline().addNewline();
    for (const key of Object.keys(achievementBoxes))
        appendAchievementBox(md, key, data.boxes[key]);
    if (!Object.values(data.boxes).some(Boolean))
        md.addText('目前没有尚未打开的道具匣。').addNewline().addNewline();
    if (data.items.length) {
        md.addText('永久道具：').addNewline();
        for (const item of data.items)
            md.addBlockquote(`${item.name} ×${item.quantity}｜${item.description}`).addNewline();
        md.addNewline();
    }
    md.addText('道具匣与开出的道具都会同时保存在足迹和背包中，注销重修后仍保留，且全部无法交易。').addNewline().addNewline()
        .addText('批量打开：在指令末尾填写数量（1～100）。').addNewline().addNewline()
        .addButton('[返回足迹]', { data: '/足迹', autoEnter: false });
    return Format.create().addMarkdown(md);
};

export { achievementAnnouncementFormat, achievementBoxCommand, achievementDetailFormat, achievementListFormat, achievementRewardsFormat, appendAchievementBox };
