import { useMessage, useRoute } from 'alemonjs';
import { giftFormat, giftText, sendWithTextFallback } from '../game/message';

export default async () => {
  const [route] = useRoute(); const [message] = useMessage();
  const category = String(route.param('category')) === '神器' ? 'artifact' : 'ability';
  await sendWithTextFallback(message, giftFormat(category), giftText(category));
};

export const giftPageHandler = async () => {
  const [route] = useRoute(); const [message] = useMessage();
  const category = String(route.param('category')) === '神器' ? 'artifact' : 'ability';
  const page = Number(route.param('page') ?? 1); const keyword = String(route.param('keyword') ?? '').trim();
  await sendWithTextFallback(message, giftFormat(category, page, keyword), giftText(category, page, keyword));
};

export const giftSearchHandler = async () => {
  const [route] = useRoute(); const [message] = useMessage();
  const category = String(route.param('category')) === '神器' ? 'artifact' : 'ability';
  const keyword = String(route.param('keyword') ?? '').trim();
  await sendWithTextFallback(message, giftFormat(category, 1, keyword), giftText(category, 1, keyword));
};
