import { logger, useEvent, useRoute } from 'alemonjs';
import { completePvpDefeatProtection } from '../game/pvp.service';

// 只有推进角色位置、战斗或采集等世界状态的行动，才会消耗战败保护；查询与配置指令不算操作。
const actionKeys = new Set([
  '移动', '前往', '前往地图', '寻怪', '下迷宫', '地下的秘密', '地宫下行', '地宫上行', '离开迷宫', '脱离', '开启地宫宝箱',
  '地宫攻击', '玩家攻击', '确认攻击', '取消移动', '取消寻怪', '刷新行动', '开采', '刷新开采', '取消开采',
  '目标', '怪物攻击', '偷袭', '伏击', '离开战斗', '躲避', '交涉', '建筑进入', '建筑离开', '探索', '休息', '行动',
  '攻击', '技能', '道具', '逃跑'
]);

/** 受击方的大型游戏操作结束后才解除保护；战败通知由任意消息的顶层中间件负责。 */
export default async (_event: unknown, next: () => Promise<void>) => {
  const [event] = useEvent();
  const [route] = useRoute();
  const userId = String(event.current.UserId ?? '');
  if (!route.matched || !actionKeys.has(route.key)) { await next(); return; }
  try {
    await next();
  } finally {
    if (userId) {
      try {
        await completePvpDefeatProtection(userId);
      } catch (error) {
        logger.warn({ err: error, userId }, '解除 PvP 战败保护失败');
      }
    }
  }
};
