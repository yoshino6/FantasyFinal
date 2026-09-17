import { useEvent, useRoute, logger } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { trackMonster, trackedMonsters, untrackMonster } from '../game/adventure.service.js';
import { messageFormat } from '../game/message.js';

const errorText = (error) => error instanceof Error ? error.message : '请稍后重试。';
const trackMonsterHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        const result = await trackMonster(event.current.UserId, Number(route.param('id')));
        const target = result.marked;
        await message.send({ format: messageFormat('追迹标记', `已记录【${target.name}】最后确认位置：(${target.x}, ${target.y}, ${target.z})\n剩余 ${target.remainingMoves} 次本人移动｜标记 ${result.tracked.length}/${result.maxTargets}\n目标离开感知后坐标不会自动更新。`) });
    }
    catch (error) {
        logger.warn({ err: error }, 'track monster failed');
        await message.send({ format: messageFormat('无法追迹', errorText(error)) });
    }
};
const trackedMonsterListHandler = async () => {
    const [event] = useEvent();
    const [message] = useGameMessage();
    try {
        const result = await trackedMonsters(event.current.UserId);
        if (!result.active)
            throw new Error('当前没有装备可用的追迹卡片；旧标记已经失效。');
        const text = result.tracked.length
            ? `${result.tracked.map(target => `#${target.spawnId}【${target.name}】最后确认 (${target.x}, ${target.y}, ${target.z})｜剩余${target.remainingMoves}次本人移动`).join('\n')}\n\n标记 ${result.tracked.length}/${result.maxTargets}；这里只保存最后确认坐标，不会持续暴露目标。`
            : `当前没有有效标记。可同时标记 ${result.maxTargets} 只怪物。`;
        await message.send({ format: messageFormat('追迹列表', text) });
    }
    catch (error) {
        logger.warn({ err: error }, 'tracked monster list failed');
        await message.send({ format: messageFormat('追迹列表', errorText(error)) });
    }
};
const untrackMonsterHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        const tracked = await untrackMonster(event.current.UserId, Number(route.param('id')));
        await message.send({ format: messageFormat('取消追迹', `追迹标记已取消。当前剩余 ${tracked.length} 个标记。`) });
    }
    catch (error) {
        logger.warn({ err: error }, 'untrack monster failed');
        await message.send({ format: messageFormat('无法取消追迹', errorText(error)) });
    }
};

export { trackMonsterHandler, trackedMonsterListHandler, untrackMonsterHandler };
