import { useEvent, useRoute, Format } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { executeSkillReset, previewSkillReset } from '../game/skill-reset.service.js';
import { cancelCraftPreview } from '../game/alchemy-journal.service.js';
import { messageFormat } from '../game/message.js';

const skillResetHandler = async (forcedAction) => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        const action = forcedAction ?? String(route.param('action') ?? 'preview');
        const token = String(route.param('token') ?? '');
        if (action === 'cancel') {
            await cancelCraftPreview(event.current.UserId, token, 'skill_reset');
            await message.send({ format: messageFormat('已取消洗练', '未消耗归悟洗练露。') });
            return;
        }
        if (action === 'confirm' && token) {
            const result = await executeSkillReset(event.current.UserId, token);
            await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('归悟洗练完成').addNewline().addText(`${result.mode === 'level' ? '无历史明细，已按角色等级重置。' : `按记录返还 ${result.restoredPoints} 技能点。`}\n当前可用 ${result.availablePoints} 点。\n已遗忘 ${result.removedSkills} 个付费学习技能，已移入可领悟（未学习）列表，可重新花费技能点学习。\n已整理快捷技能与自动战斗配置。`)).addButtonGroup(Format.createButtonGroup().addRow().addButton('可领悟', '/技能列表 未学习', { type: 'command', autoEnter: true })) });
            return;
        }
        const plan = await previewSkillReset(event.current.UserId);
        const rule = plan.mode === 'level' ? '无技能点历史明细：可用点数重置为角色等级，同时撤销普通付费技能学习和强化；遗忘后移入可领悟（未学习）列表，保留绑定、免费及职业赠送基础能力。' : '付费学习的技能将遗忘，保留发现记录并移入可领悟（未学习）列表；按尚未退款的记录返还点数，缺失的旧花费不估算。';
        const md = Format.createMarkdown().addTitle('归悟洗练').addNewline().addText(`消耗：归悟洗练露 ×1\n${rule}\n角色等级：${plan.level}\n当前可用：${plan.available} 技能点\n本次增加：${plan.refund} 技能点\n重置后可用：${plan.targetPoints} 技能点（不超过等级）${plan.mode === 'ledger' && plan.recordedRefund > plan.refund ? '\n记录中的可退投入超过等级额度，超出部分不再发放。' : ''}\n重置范围：${plan.changes.map(change => change.name).join('、') || '技能点余额'}${plan.preserved.length ? `\n保留项：${plan.preserved.join('、')}` : ''}\n快捷技能与自动战斗配置将整理为当前可用状态。`);
        await message.send({ format: Format.create().addMarkdown(md).addButtonGroup(Format.createButtonGroup().addRow().addButton('确认洗练', `/洗练操作 confirm ${plan.token}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('取消', `/洗练操作 cancel ${plan.token}`, { type: 'command', autoEnter: true })) });
    }
    catch (error) {
        await message.send({ format: messageFormat('洗练提示', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
var skillReset = async () => skillResetHandler();
const skillResetConfirmHandler = async () => skillResetHandler('confirm');

export { skillReset as default, skillResetConfirmHandler, skillResetHandler };
