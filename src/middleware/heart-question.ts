import { useEvent, useRoute } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message';
import { activeHeartQuestion } from '../game/heart-question.service';
import { heartQuestionFormat } from '../response/heart-question';
import { isPriorityCommand } from './priority-commands';

export default async (_event: unknown, next: () => Promise<void>) => {
  const [event] = useEvent(), [route] = useRoute();
  if (!route.matched || isPriorityCommand(route.key) || /^(?:角色|角色详情|我|窥尘问心|问心选择|问心跳过)(?:$| )/.test(route.key)) { await next(); return; }
  const userId = event.current.UserId;
  if (!userId) { await next(); return; }
  const before = await activeHeartQuestion(userId);
  const [message] = useGameMessage();
  if (before) { await message.send({ format: heartQuestionFormat(before) }); return; }
  await next();
  const after = await activeHeartQuestion(userId);
  if (after) await message.send({ format: heartQuestionFormat(after) });
};
