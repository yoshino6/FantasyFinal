import { logger, useEvent, useMessage, useRoute } from 'alemonjs';
import { itemCodex } from '../game/adventure.service';
import { messageFormat } from '../game/message';

export default async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const item = await itemCodex(event.current.UserId, String(route.param('id'))); await message.send({ format: messageFormat('物品图鉴', `【${item.item_category}】${item.name}\n图鉴ID：${item.codex_id}\n重量：${item.weight}\n\n简介：\n${item.description}\n\n获取来源：${item.obtain_source}`) }); } catch (error) { logger.warn({ err: error }, 'item codex failed'); await message.send({ format: messageFormat('物品图鉴', error instanceof Error ? error.message : '请稍后重试。') }); } };
