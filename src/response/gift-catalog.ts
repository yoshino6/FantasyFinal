import { useMessage, useRoute } from 'alemonjs';
import { giftFormat, giftText, sendWithTextFallback } from '../game/message';

export default async () => {
  const [route] = useRoute(); const [message] = useMessage();
  const category = String(route.param('category')) === '能力' ? 'ability' : 'artifact';
  await sendWithTextFallback(message, giftFormat(category), giftText(category));
};
