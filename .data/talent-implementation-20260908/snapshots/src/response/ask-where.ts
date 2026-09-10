import { useEvent } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { askWhereAmI } from '../game/character.service';
import { registrationScene } from '../game/divine-message';
import { messageFormat } from '../game/message';

export default async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    const stage = await askWhereAmI(event.current.UserId);
    await message.send({ format: await registrationScene(stage, event.current.UserId) });
  } catch (error) { await message.send({ format: messageFormat('无法询问', error instanceof Error ? error.message : '请稍后重试。') }); }
};
