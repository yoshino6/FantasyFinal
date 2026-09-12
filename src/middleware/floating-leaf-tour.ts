import { useEvent, useRoute } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message';
import { currentFloatingTour, floatingTourState, startFloatingTour } from '../game/floating-leaf.service';
import { floatingSceneFormat } from '../response/floating-leaf';

const movement = /^(?:移动|前往|前往地图|前往怪物|寻怪|初行离会|初行接驳|建筑离开|建筑忽略)(?:$| )/;
const harmless = /^(?:浮叶游览|任务|任务分类|主线|面板|地图|地图区域|角色|角色详情|状态|背包|物品|物品详情|技能列表|帮助|菜单)(?:$| )/;

export default async (_event: unknown, next: () => Promise<void>) => {
  const [event] = useEvent(); const [route] = useRoute();
  if (!route.matched) { await next(); return; }
  const state = await floatingTourState(event.current.UserId);
  if (!state) { await next(); return; }
  if (state.stage >= 1 && state.stage < 6 && !harmless.test(route.key)) {
    const [message] = useGameMessage();
    await message.send({ format: floatingSceneFormat((await currentFloatingTour(event.current.UserId))!) });
    return;
  }
  if (state.stage === 0 && state.ready && state.atGuild && movement.test(route.key)) {
    const started = await startFloatingTour(event.current.UserId);
    if (started) { const [message] = useGameMessage(); await message.send({ format: floatingSceneFormat(started) }); return; }
  }
  await next();
};
