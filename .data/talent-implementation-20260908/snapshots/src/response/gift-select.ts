import { logger, useEvent, useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { chooseGift } from '../game/character.service';
import { messageFormat } from '../game/message';
import { giftSelectionFormat, completedRegistrationFormat } from '../game/registration-message';

export default async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const character = await chooseGift(event.current.UserId, String(route.param('gift')), event.current.UserName);
    await message.send({ format: character ? giftSelectionFormat(character) : await completedRegistrationFormat(event.current.UserId) });
  } catch (error) {
    logger.warn({ err: error, userId: event.current.UserId }, 'gift selection rejected');
    await message.send({ format: messageFormat('无法选择恩赐', error instanceof Error ? error.message : '请稍后重试。') });
  }
};
