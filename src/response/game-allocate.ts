import { Format, logger, useEvent, useMessage, useRoute } from 'alemonjs';
import { addPoints, confirmAllocation, resetAllocation } from '../game/character.service';
import { attributeAliases } from '../game/constants';
import { allocationFormat, characterText } from '../game/message';

const errorText = (error: unknown) => error instanceof Error ? error.message : '操作失败，请稍后重试。';

export const add = async () => {
  const [event] = useEvent();
  const [route] = useRoute();
  const [message] = useMessage();
  try {
    const attribute = attributeAliases[String(route.param('attribute') ?? '')];
    const points = Number(route.param('points'));
    if (!attribute || !Number.isInteger(points)) throw new Error('属性或点数无效。');
    await message.send({ format: allocationFormat(await addPoints(event.current.UserId, attribute, points)) });
  } catch (error) {
    logger.warn({ err: error, userId: event.current.UserId }, 'allocation add rejected');
    await message.send({ format: Format.create().addText(errorText(error)) });
  }
};

export const reset = async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  try {
    await message.send({ format: allocationFormat(await resetAllocation(event.current.UserId)) });
  } catch (error) {
    logger.warn({ err: error, userId: event.current.UserId }, 'allocation reset rejected');
    await message.send({ format: Format.create().addText(errorText(error)) });
  }
};

export const confirm = async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  try {
    const character = await confirmAllocation(event.current.UserId, event.current.UserName);
    await message.send({ format: Format.create().addText(`穿越完成！\n\n${characterText(character.name, character, character, character.regionName, character.x, character.y, character.z)}`) });
  } catch (error) {
    logger.warn({ err: error, userId: event.current.UserId }, 'allocation confirm rejected');
    await message.send({ format: Format.create().addText(errorText(error)) });
  }
};
