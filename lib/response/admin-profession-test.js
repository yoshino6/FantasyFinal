import { useEvent, useRoute, Format } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { adminTestProfession, professionTestOptions } from '../game/admin-profession-test.service.js';
import { requireAdministrator } from '../game/permission.service.js';
import { messageFormat } from '../game/message.js';

const professionTestFormat = () => {
    const md = Format.createMarkdown().addTitle('测试二转').addNewline().addNewline()
        .addText('点击职业填入命令，发送后为自己的角色模拟成长至 Lv.30、开化，完成二转并穿上适配的史诗套装。').addNewline()
        .addText('成长模拟会随机结算生长结注射、变异和问心；测试入口免经验、材料、位置及转职冷却要求。').addNewline();
    for (const group of new Set(professionTestOptions.map(p => p.group))) {
        md.addNewline().addBlockquote(`**${group}**`).addNewline();
        const options = professionTestOptions.filter(p => p.group === group);
        for (const [index, p] of options.entries()) {
            md.addButton(`[${p.name}]`, { data: `测试二转 ${p.code}`, autoEnter: false }).addText(' ');
            if ((index + 1) % 3 === 0 || index === options.length - 1)
                md.addNewline();
        }
    }
    md.addNewline().addText('只补当前所缺的成长进度；切换职业时重新配装。战斗或交涉结束后才能使用。');
    return Format.create().addMarkdown(md).addButtonGroup(Format.createButtonGroup().addRow()
        .addButton('返回管理', '管理', { type: 'command', autoEnter: true, style: 'blue' }));
};
var adminProfessionTest = async () => {
    const [event] = useEvent(), [route] = useRoute(), [message] = useGameMessage();
    try {
        const user = event.current.UserId;
        await requireAdministrator(user);
        const code = String(route.param('code') ?? '').trim();
        if (!code) {
            await message.send({ format: professionTestFormat() });
            return;
        }
        const result = await adminTestProfession(user, code);
        const md = Format.createMarkdown().addTitle(result.changed ? '测试二转完成' : '转职资料已补齐').addNewline().addNewline()
            .addBlockquote(`**${result.name} · ${result.profession}**`).addNewline()
            .addText(`Lv.${result.growth.level} · 开化；本次完成${result.growth.injections}次生长结注射、${result.answeredHeartQuestions}道随机问心。`).addNewline()
            .addText(`对应二转任务已完成，职业技能共${result.skillCount}项。${result.changed ? `本次返还${result.restoredPoints}点技能点。` : '当前职业未改变，保留已有技能加点。'}${result.equipment.length ? `已换上${result.equipment.length}件史诗装备。` : '已保留现有史诗测试套装。'}`).addNewline()
            .addText('属性面板已重算，可重新配置战斗技能。');
        await message.send({ format: Format.create().addMarkdown(md).addButtonGroup(Format.createButtonGroup().addRow()
                .addButton('继续测试二转', '测试二转', { type: 'command', autoEnter: true, style: 'blue' })
                .addButton('我的技能', '技能列表 已学习', { type: 'command', autoEnter: true })
                .addButton('返回管理', '管理', { type: 'command', autoEnter: true })) });
    }
    catch (error) {
        await message.send({ format: messageFormat('测试二转失败', error instanceof Error ? error.message : '请稍后重试。') });
    }
};

export { adminProfessionTest as default, professionTestFormat };
