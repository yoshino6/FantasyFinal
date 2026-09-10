import { useEvent, useRoute, Format } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { selectPvpBattleOption } from '../game/pvp.service.js';
import { battleStatus, selectCombatEnchantment } from '../game/adventure.service.js';
import { startNpcSparring, npcSparringView } from '../game/npc-sparring.service.js';
import { residentSkillByCode } from '../game/resident-skill.config.js';
import { battleStartFormat, battleOperationFormat } from './adventure.js';
import { messageFormat } from '../game/message.js';

const enchantmentHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        const element = String(route.param('element'));
        let battle;
        try {
            battle = await battleStatus(event.current.UserId);
        }
        catch {
            battle = await selectPvpBattleOption(event.current.UserId, { element });
            await message.send({ format: battleOperationFormat(`三相附锋已选择 ${element} 元素。`, battle) });
            return;
        }
        await selectCombatEnchantment(event.current.UserId, element);
        await message.send({ format: battleOperationFormat(`三相附锋已选择 ${element} 元素。`, await battleStatus(event.current.UserId)) });
    }
    catch (error) {
        await message.send({ format: messageFormat('附锋元素', error instanceof Error ? error.message : '请选择有效元素。') });
    }
};
var npcSparring = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        const code = String(route.param('code'));
        if (route.param('action') === '开始') {
            const { profile } = await startNpcSparring(event.current.UserId, code);
            await message.send({ format: battleStartFormat(`与【${profile.name}】切磋 · Lv.${profile.level}\n手动出招｜不消耗体力与道具｜结束后恢复 HP、MP`, await battleStatus(event.current.UserId)) });
            return;
        }
        const { profile, used } = await npcSparringView(event.current.UserId, code);
        const professions = { warrior: '战士', mage: '法师', rogue: '盗贼', priest: '牧师' };
        const md = Format.createMarkdown().addTitle(`切磋 · ${profile.name}`).addNewline().addNewline()
            .addText(`Lv.${profile.level}｜${profile.advancedName || professions[profile.profession] || '未转职'}\n今日次数 ${used ? 1 : 0}/1`).addNewline().addNewline()
            .addBlockquote('详细战斗属性可在切磋中使用鉴识查看。').addNewline().addNewline()
            .addText('携带主动：' + (profile.rotation.map(code => residentSkillByCode(code)?.name ?? code).join('、') || '基础攻防')).addNewline()
            .addText('链接被动：' + (profile.passives.map(code => residentSkillByCode(code)?.name ?? code).join('、') || '无')).addNewline().addNewline()
            .addBlockquote('只可能领悟本局携带的上述技能。单人手动切磋，开始即消耗今日次数；结束只判定一次领悟，不获得经验与掉落。');
        const buttons = Format.createButtonGroup().addRow();
        if (!used)
            buttons.addButton('开始切磋', `/切磋 ${code} 开始`, { type: 'command', autoEnter: true, style: 'blue' });
        buttons.addButton('返回面板', '/面板', { type: 'command', autoEnter: true });
        await message.send({ format: Format.create().addMarkdown(md).addButtonGroup(buttons) });
    }
    catch (error) {
        await message.send({ format: messageFormat('切磋', error instanceof Error ? error.message : '域民暂时无法回应。') });
    }
};

export { npcSparring as default, enchantmentHandler };
