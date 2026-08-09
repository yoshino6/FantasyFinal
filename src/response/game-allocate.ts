import { useMessage } from 'alemonjs';
import { messageFormat } from '../game/message';

const disabled = async () => {
  const [message] = useMessage();
  await message.send({ format: messageFormat('命运已固定', '本世界的六维与成长由转生时随机固定，不能手动加点。请发送 /注册，完成剧情后用 /选择恩赐 代号 开始冒险。') });
};

export const add = disabled;
export const reset = disabled;
export const confirm = disabled;
