import { useMessage } from 'alemonjs';
import { messageFormat } from '../game/message';

export default async () => {
  const [message] = useMessage();
  await message.send({ format: messageFormat('异界指南', '注册｜开始异世界之旅\n/角色｜查看个人属性\n/地图｜查看当前位置\n\n互动按钮不可用时，可直接发送对应命令。') });
};
