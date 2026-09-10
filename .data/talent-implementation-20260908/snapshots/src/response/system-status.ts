import { logger, useMessage } from 'alemonjs';
import { systemStatusPanelImage } from '../game/system-status-card.service';
import { systemStatusSnapshot } from '../game/system-status.service';
import { messageFormat } from '../game/message';
import { createFormatWithoutGroupMention } from '../middleware/group-reply-mention';

export default async () => {
  const [message] = useMessage();
  try {
    const snapshot = await systemStatusSnapshot();
    await message.send({ format: createFormatWithoutGroupMention().addImage(await systemStatusPanelImage(snapshot)) });
  } catch (error) {
    logger.error({ err: error }, 'render system status panel failed');
    await message.send({ format: messageFormat('状态面板不可用', error instanceof Error ? error.message : '请稍后重试。') });
  }
};
