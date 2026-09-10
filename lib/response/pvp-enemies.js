import { useEvent, Format } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { personalPvpEnemies } from '../game/pvp.service.js';
import { messageFormat } from '../game/message.js';

var pvpEnemies = async () => {
    const [event] = useEvent();
    const [message] = useGameMessage();
    try {
        const enemies = await personalPvpEnemies(event.current.UserId);
        const markdown = Format.createMarkdown().addTitle('我的仇人').addNewline().addNewline();
        if (!enemies.length)
            markdown.addBlockquote('暂无攻击过你且仍持有未返还赃物的玩家。');
        for (const [index, enemy] of enemies.entries()) {
            markdown.addText(`${'①②③④⑤⑥⑦⑧⑨⑩'.charAt(index) || `${index + 1}.`}【${enemy.name}】｜ID：${enemy.gameId}`).addNewline()
                .addBlockquote(`攻击记录：${enemy.attacks} 次｜未返还物品：${enemy.loot}`).addNewline()
                .addBlockquote(enemy.warrantCities ? `悬赏城镇：${enemy.warrantCities}` : '悬赏城镇：暂无生效通缉，暂无法追加赏金。').addNewline();
            if (enemy.warrantId)
                markdown.addButton('[追加赏金]', { data: `/通缉上赏 ${enemy.warrantId} 铜币 `, autoEnter: false }).addNewline()
                    .addBlockquote(`指令：/通缉上赏 ${enemy.warrantId} 铜币 <金额>\n或 /通缉上赏 ${enemy.warrantId} 物品 <物品编号> [数量]`).addNewline();
            markdown.addNewline();
        }
        await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回 PvP 面板', '/PVP', { type: 'command', autoEnter: true, style: 'blue' })) });
    }
    catch (error) {
        await message.send({ format: messageFormat('仇人列表不可用', error instanceof Error ? error.message : '请稍后重试。') });
    }
};

export { pvpEnemies as default };
