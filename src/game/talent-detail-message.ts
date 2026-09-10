import { logger, ResultCode, setTimeout, useClient, useEvent, type useMessage } from 'alemonjs';
import { useGameMessage } from './use-game-message';

type Result = Awaited<ReturnType<ReturnType<typeof useMessage>[0]['send']>>[number];
type RecallClient = Record<'grouMessageDelte' | 'userMessageDelete' | 'dmsMessageDelete' | 'channelsMessagesDelete', (target: string, id: string) => Promise<Result[]>>;
type RecallEvent = { Platform?: string; IsPrivate?: boolean; SpaceId?: string; OpenId?: string; ChannelId?: string; Target?: { scope: string; targetId: string } };

/** QQ's generic message.delete hook omits scope; use the connector's matching API. */
export const talentRecallTarget = (event: RecallEvent) => {
  if (event.Target?.targetId) return event.Target;
  if (event.IsPrivate) {
    const match = /^(C2C|DIRECT):(.+)$/.exec(event.OpenId ?? '');
    if (match) return { scope: match[1] === 'C2C' ? 'c2c' : 'direct', targetId: match[2]! };
  } else {
    const match = /^(GROUP|GUILD):(.+)$/.exec(event.SpaceId ?? '');
    if (match) return { scope: match[1] === 'GROUP' ? 'group' : 'channel', targetId: match[2]! };
  }
  return undefined;
};

export const scheduleTalentRecall = (results: Result[], recall: (id: string) => Promise<Result[]>, schedule = setTimeout) => {
  const ids = [...new Set(results.filter(r => r.code === ResultCode.Ok && typeof r.data?.id === 'string' && r.data.id).map(r => r.data.id as string))];
  if (!ids.length) return;
  schedule(async () => {
    for (const id of ids) {
      try {
        const result = await recall(id);
        if (!result.some(r => r.code === ResultCode.Ok)) logger.warn('天赋详情自动撤回未成功。');
      } catch { logger.warn('天赋详情自动撤回失败。'); }
    }
  }, 60_000);
};

export const useTalentDetailMessage = () => {
  const [event] = useEvent(), [message] = useGameMessage(), [client] = useClient<RecallClient>();
  const target = talentRecallTarget(event.current);
  const methods = { group: 'grouMessageDelte', c2c: 'userMessageDelete', direct: 'dmsMessageDelete', channel: 'channelsMessagesDelete' } as const;
  const method = target && methods[target.scope as keyof typeof methods];
  const recall = async (id: string): Promise<Result[]> => {
    if (event.current.Platform === 'qq-bot') {
      if (!target || !method) return [{ code: ResultCode.FailParams, message: '无法确定详情消息会话', data: null }];
      return client[method](target.targetId, id);
    }
    return [await message.delete({ messageId: id })];
  };
  return { async send(params: Parameters<typeof message.send>[0]) {
    const results = await message.send(params);
    scheduleTalentRecall(results, recall);
    return results;
  } };
};
