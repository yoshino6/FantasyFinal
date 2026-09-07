import { Format } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { menuCardImage } from '../game/menu-card.service';

const sendMenu = async (page: 1 | 2) => {
  const [message] = useMessage();
  const buttons = Format.createButtonGroup()
    .addRow()
    .addButton('核心功能', '/菜单', { type: 'command', autoEnter: true, style: page === 1 ? 'blue' : undefined })
    .addButton('进阶功能', '/菜单 进阶', { type: 'command', autoEnter: true, style: page === 2 ? 'blue' : undefined })
    .addButton('面板', '/面板', { type: 'command', autoEnter: true })
    .addButton('角色', '/角色', { type: 'command', autoEnter: true })
    .addButton('任务', '/任务', { type: 'command', autoEnter: true });
  await message.send({ format: Format.create().addImage(await menuCardImage(page)).addButtonGroup(buttons) });
};

export default async () => sendMenu(1);

export const advancedMenuHandler = async () => sendMenu(2);
