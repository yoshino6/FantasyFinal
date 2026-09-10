import { Format } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { menuCardImage } from '../game/menu-card.service.js';

const sendMenu = async (page) => {
    const [message] = useGameMessage();
    const buttons = Format.createButtonGroup()
        .addRow()
        .addButton('核心功能', '/菜单', { type: 'command', autoEnter: true, style: page === 1 ? 'blue' : undefined })
        .addButton('进阶功能', '/菜单 进阶', { type: 'command', autoEnter: true, style: page === 2 ? 'blue' : undefined })
        .addButton('面板', '/面板', { type: 'command', autoEnter: true })
        .addButton('角色', '/角色', { type: 'command', autoEnter: true })
        .addButton('任务', '/任务', { type: 'command', autoEnter: true });
    await message.send({ format: Format.create().addImage(await menuCardImage(page)).addButtonGroup(buttons) });
};
var help = async () => sendMenu(1);
const advancedMenuHandler = async () => sendMenu(2);

export { advancedMenuHandler, help as default };
