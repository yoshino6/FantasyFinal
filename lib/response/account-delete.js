import { useEvent, Format, useRoute } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { requestAccountDeletion, deletePlayerAccount } from '../game/account.service.js';
import { messageFormat } from '../game/message.js';

var accountDelete = async () => {
    const [event] = useEvent();
    const [message] = useGameMessage();
    try {
        const request = await requestAccountDeletion(event.current.UserId);
        const markdown = Format.createMarkdown().addTitle('注销账户').addNewline().addNewline()
            .addText('注销会删除当前账号的角色、背包、装备、任务、邮件、图鉴、战斗与副职业等全部游戏数据。').addNewline().addNewline()
            .addBlockquote('确认前请仔细核对。系统会保留一份注销快照，管理员可在误操作时恢复。确认后仍可发送“注册”重新开始。').addNewline().addNewline()
            .addText(`验证码：${request.code}`).addNewline()
            .addBlockquote(`请在 ${request.expiresMinutes} 分钟内手动输入“确认注销 <验证码>”完成注销。`);
        const buttons = Format.createButtonGroup().addRow()
            .addButton('取消', '/菜单', { type: 'command', autoEnter: true })
            .addButton('填写验证码', '/确认注销 ', { type: 'command', autoEnter: false, style: 'blue' });
        await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
    }
    catch (error) {
        await message.send({ format: messageFormat('注销账户不可用', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const confirmAccountDeleteHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        const result = await deletePlayerAccount(event.current.UserId, String(route.param('code') ?? ''));
        const extra = [
            result.endedCombats ? `已结束 ${result.endedCombats} 场关联战斗。` : '',
            result.transferredParties ? `已将 ${result.transferredParties} 支队伍移交给其他队员。` : '',
            result.disbandedParties ? `已解散 ${result.disbandedParties} 支无其他成员的队伍。` : ''
        ].filter(Boolean).join('\n');
        await message.send({ format: messageFormat('账户已注销', `${result.characterName ? `【${result.characterName}】的` : ''}全部游戏数据已删除，并已保留注销快照。\n现在可发送“注册”重新创建角色；如需恢复，请联系管理员。${extra ? `\n\n${extra}` : ''}`) });
    }
    catch (error) {
        await message.send({ format: messageFormat('注销失败', error instanceof Error ? error.message : '请稍后重试。') });
    }
};

export { confirmAccountDeleteHandler, accountDelete as default };
