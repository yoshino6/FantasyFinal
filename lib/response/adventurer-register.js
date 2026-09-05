import { useEvent, useMessage } from 'alemonjs';
import { registerAdventurer } from '../game/character.service.js';
import { messageFormat } from '../game/message.js';

var adventurerRegister = async () => {
    const [event] = useEvent();
    const [message] = useMessage();
    try {
        const registered = await registerAdventurer(event.current.UserId);
        await message.send({ format: messageFormat(registered ? '公会登记完成' : '已完成登记', registered ? '冒险者卡片泛起光芒。现在发送 /角色 可查看完整属性与成长。' : '你的冒险者身份已有效，发送 /角色 查看资料。') });
    }
    catch (error) {
        await message.send({ format: messageFormat('登记失败', error instanceof Error ? error.message : '请稍后重试。') });
    }
};

export { adventurerRegister as default };
