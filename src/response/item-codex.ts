import { logger, useEvent, useMessage, useRoute } from 'alemonjs';
import { itemCodex } from '../game/adventure.service';
import { messageFormat } from '../game/message';

export default async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const item = await itemCodex(event.current.UserId, Number(route.param('id'))); await message.send({ format: messageFormat('物品图鉴', `[${item.item_category}]${item.name}\nID：${item.id}\n类型：${item.item_type}\n重量：${item.weight}\n${item.stackable ? '可堆叠' : '不可堆叠'}\n\n${item.description}\n${item.effect_json ? `\n效果：${item.effect_json}` : ''}`) }); } catch (error) { logger.warn({ err: error }, 'item codex failed'); await message.send({ format: messageFormat('物品图鉴', error instanceof Error ? error.message : '请稍后重试。') }); } };
