import { useEvent, useClient, setTimeout, ResultCode, logger } from 'alemonjs';
import { useGameMessage } from './use-game-message.js';

const talentRecallTarget = (event) => {
    if (event.Target?.targetId)
        return event.Target;
    if (event.IsPrivate) {
        const match = /^(C2C|DIRECT):(.+)$/.exec(event.OpenId ?? '');
        if (match)
            return { scope: match[1] === 'C2C' ? 'c2c' : 'direct', targetId: match[2] };
    }
    else {
        const match = /^(GROUP|GUILD):(.+)$/.exec(event.SpaceId ?? '');
        if (match)
            return { scope: match[1] === 'GROUP' ? 'group' : 'channel', targetId: match[2] };
    }
    return undefined;
};
const scheduleTalentRecall = (results, recall, schedule = setTimeout) => {
    const ids = [...new Set(results.filter(r => r.code === ResultCode.Ok && typeof r.data?.id === 'string' && r.data.id).map(r => r.data.id))];
    if (!ids.length)
        return;
    schedule(async () => {
        for (const id of ids) {
            try {
                const result = await recall(id);
                if (!result.some(r => r.code === ResultCode.Ok))
                    logger.warn('天赋详情自动撤回未成功。');
            }
            catch {
                logger.warn('天赋详情自动撤回失败。');
            }
        }
    }, 60_000);
};
const useTalentDetailMessage = () => {
    const [event] = useEvent(), [message] = useGameMessage(), [client] = useClient();
    const target = talentRecallTarget(event.current);
    const methods = { group: 'grouMessageDelte', c2c: 'userMessageDelete', direct: 'dmsMessageDelete', channel: 'channelsMessagesDelete' };
    const method = target && methods[target.scope];
    const recall = async (id) => {
        if (event.current.Platform === 'qq-bot') {
            if (!target || !method)
                return [{ code: ResultCode.FailParams, message: '无法确定详情消息会话', data: null }];
            return client[method](target.targetId, id);
        }
        return [await message.delete({ messageId: id })];
    };
    return { async send(params) {
            const results = await message.send(params);
            scheduleTalentRecall(results, recall);
            return results;
        } };
};

export { scheduleTalentRecall, talentRecallTarget, useTalentDetailMessage };
