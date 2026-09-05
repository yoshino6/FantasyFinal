import { useEvent, useMessage } from 'alemonjs';
import { battleStatus } from '../game/adventure.service.js';
import { messageFormat } from '../game/message.js';
import { battleOperationFormat } from './adventure.js';

var battleInfo = async () => {
    const [event] = useEvent();
    const [message] = useMessage();
    try {
        const battle = await battleStatus(event.current.UserId);
        await message.send({ format: battleOperationFormat(`第 ${battle.turn} 回合｜点击友方或敌方名称选择技能目标。`, battle) });
    }
    catch (error) {
        await message.send({ format: messageFormat('当前无战斗', '你不在战斗中。发送 /面板 返回冒险操作。') });
    }
};

export { battleInfo as default };
