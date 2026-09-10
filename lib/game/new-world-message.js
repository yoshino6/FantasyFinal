import { Format } from 'alemonjs';
import { newWorldRewardText } from './new-world.config.js';

const newWorldFormat = (panel, notice) => {
    const md = Format.createMarkdown().addTitle('新世界旅途').addNewline().addNewline()
        .addBlockquote('当前仍为删档内测版本，不代表正式服数据。').addNewline()
        .addBlockquote('各位旅行者请慢慢享受沿途的风景。').addNewline().addNewline()
        .addText(`${panel.name} · Lv.${panel.level}\n每档奖励限领一次，达到等级后可随时补领。`).addNewline().addNewline();
    if (notice)
        md.addText(notice).addNewline().addNewline();
    for (const reward of panel.rewards) {
        md.addBold(`Lv.${reward.level} · ${reward.state}`).addNewline()
            .addText(newWorldRewardText[reward.level]).addNewline();
        if (reward.state === '可领取')
            md.addButton('[领取奖励]', { data: `/新世界领取 ${reward.level}`, autoEnter: false }).addNewline();
        md.addNewline();
    }
    md.addText('奖励个人绑定，发入背包；装备按领取时职业匹配，请自行穿戴。');
    const buttons = Format.createButtonGroup().addRow().addButton('背包', '/背包', { type: 'command', autoEnter: false });
    return Format.create().addMarkdown(md).addButtonGroup(buttons);
};

export { newWorldFormat };
