import { useEvent, useMessage } from 'alemonjs';
import { battleStatus } from '../game/adventure.service';
import { messageFormat } from '../game/message';

export default async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { const battle = await battleStatus(event.current.UserId); await message.send({ format: messageFormat('战斗信息', `第 ${battle.turn} 回合\n你：HP ${battle.playerHp}/${battle.playerHpMax}｜MP ${battle.playerMp}/${battle.playerMpMax}\n目标：#${battle.targetId} ${battle.targetName}｜HP ${battle.targetHp}/${battle.targetHpMax}\n\n发送 /面板 返回快捷操作。`) }); }
  catch (error) { await message.send({ format: messageFormat('当前无战斗', '你不在战斗中。发送 /面板 返回冒险操作。') }); }
};
