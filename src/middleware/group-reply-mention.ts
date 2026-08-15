import { Format, useEvent } from 'alemonjs';

const installedKey = Symbol.for('fantasy-final.group-reply-mention-installed');

/**
 * 统一为群聊回复添加首行 @。通过包装 Format.create，现有所有消息格式都无需逐个修改。
 */
export const installGroupReplyMention = () => {
  const runtime = globalThis as typeof globalThis & { [installedKey]?: boolean };
  if (runtime[installedKey]) return;
  runtime[installedKey] = true;

  const create = Format.create;
  Format.create = () => {
    const format = create.call(Format);
    try {
      const [event] = useEvent();
      const { IsPrivate, UserId } = event.current;
      if (!IsPrivate && UserId) format.addMention(UserId).addText('\n');
    } catch {
      // 定时任务、主动消息等没有事件上下文，不附加 @。
    }
    return format;
  };
};
