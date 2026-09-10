import { useEvent, Format } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { inspectCombat } from '../game/adventure.service.js';
import { messageFormat } from '../game/message.js';

var combatAppraisal = async () => {
    const [event] = useEvent();
    const [message] = useGameMessage();
    try {
        const result = await inspectCombat(event.current.UserId);
        const lines = result.text.split('\n');
        const enemyIndex = lines.indexOf('敌方状态');
        const allyLines = lines.slice(1, enemyIndex).filter(Boolean);
        const enemyLines = lines.slice(enemyIndex + 1).filter(Boolean);
        const markdown = Format.createMarkdown().addTitle('鉴识').addNewline().addNewline()
            .addText('我方状态').addNewline().addBlockquote(allyLines.join('\n')).addNewline().addNewline()
            .addText('敌方状态').addNewline().addBlockquote(enemyLines.join('\n'));
        await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('战斗面板', '/面板', { type: 'command', autoEnter: true, style: 'blue' })) });
    }
    catch (error) {
        await message.send({ format: messageFormat('鉴识失败', error instanceof Error ? error.message : '请稍后重试。') });
    }
};

export { combatAppraisal as default };
