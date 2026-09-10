import { useEvent, useRoute, Format } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { achievementList, achievementDetail, achievementRewards, openAchievementBox } from '../game/achievement.service.js';
import { achievementListFormat, achievementDetailFormat, achievementRewardsFormat } from '../game/achievement-message.js';
import { achievementBoxes } from '../game/achievement-rewards.config.js';
import { messageFormat } from '../game/message.js';

var achievement = async () => {
    const [event] = useEvent(), [route] = useRoute(), [message] = useGameMessage();
    try {
        await message.send({ format: achievementListFormat(await achievementList(event.current.UserId, String(route.param('category') ?? '全部'), Number(route.param('page') ?? 1))) });
    }
    catch (error) {
        await message.send({ format: messageFormat('足迹', error instanceof Error ? error.message : '暂时无法查看足迹。') });
    }
};
const achievementDetailHandler = async () => {
    const [event] = useEvent(), [route] = useRoute(), [message] = useGameMessage();
    try {
        await message.send({ format: achievementDetailFormat(await achievementDetail(event.current.UserId, String(route.param('id')))) });
    }
    catch (error) {
        await message.send({ format: messageFormat('足迹', error instanceof Error ? error.message : '暂时无法查看足迹。') });
    }
};
const achievementRewardsHandler = async () => {
    const [event] = useEvent(), [message] = useGameMessage();
    try {
        await message.send({ format: achievementRewardsFormat(await achievementRewards(event.current.UserId)) });
    }
    catch (error) {
        await message.send({ format: messageFormat('足迹奖励', error instanceof Error ? error.message : '暂时无法查看足迹奖励。') });
    }
};
const openAchievementBoxHandler = async (boxKey) => {
    const [event] = useEvent(), [route] = useRoute(), [message] = useGameMessage();
    try {
        const token = String(route.param('token') ?? '');
        if (!token) {
            const rewards = await achievementRewards(event.current.UserId);
            await message.send({ format: achievementRewardsFormat(rewards) });
            return;
        }
        const reward = await openAchievementBox(event.current.UserId, boxKey, token, Number(route.param('quantity') ?? 1));
        const md = Format.createMarkdown().addTitle(reward.boxName).addNewline().addNewline().addText(`已打开${reward.boxName} ×${reward.quantity}`).addNewline().addNewline();
        for (const item of reward.items)
            md.addBold(`${item.name} ×${item.quantity}`).addNewline().addBlockquote(item.description).addNewline().addNewline();
        md.addText('已同时存入足迹与当前角色背包，注销重修后仍保留，且无法交易。').addNewline().addNewline().addButton('[返回背包]', { data: '/背包 道具', autoEnter: false });
        await message.send({ format: Format.create().addMarkdown(md) });
    }
    catch (error) {
        await message.send({ format: messageFormat(achievementBoxes[boxKey].name, error instanceof Error ? error.message : '暂时无法打开。') });
    }
};
const openOddAchievementBoxHandler = () => openAchievementBoxHandler('odd_box');
const openRareAchievementBoxHandler = () => openAchievementBoxHandler('rare_box');
const openCollectorAchievementBoxHandler = () => openAchievementBoxHandler('collector_box');

export { achievementDetailHandler, achievementRewardsHandler, achievement as default, openCollectorAchievementBoxHandler, openOddAchievementBoxHandler, openRareAchievementBoxHandler };
