import { logger, useEvent, useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { monsterDetail } from '../game/adventure.service';
import { messageFormat } from '../game/message';

export default async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const monster = await monsterDetail(event.current.UserId, Number(route.param('id')));
    const attr = monster.attributes; const stats = monster.stats;
    const text = `【${monster.name}】Lv.${monster.level}\n词条：${monster.traits.length ? monster.traits.join('、') : '无'}\n\n六维\n体质 ${attr.constitution}｜精神 ${attr.spirit}｜力量 ${attr.strength}\n智力 ${attr.intelligence}｜敏捷 ${attr.agility}｜感知 ${attr.perception}\n\n属性\nHP ${stats.hpMax}｜MP ${stats.mpMax}\n物攻 ${stats.physicalAttack}｜魔攻 ${stats.magicAttack}\n物防 ${stats.physicalDefense}｜魔防 ${stats.magicDefense}\n命中 ${stats.accuracy}｜闪避 ${stats.evasion}\n暴击 ${stats.crit}｜暴免 ${stats.critResist}\n暴伤 ${stats.critDamage}｜暴抗 ${stats.critReduction}\n破韧 ${stats.tenacityPierce}｜韧性 ${stats.tenacity}\n速度 ${stats.speed}`;
    await message.send({ format: messageFormat('怪物鉴识', text) });
  } catch (error) { logger.warn({ err: error }, 'monster detail failed'); await message.send({ format: messageFormat('怪物鉴识', error instanceof Error ? error.message : '请稍后重试。') }); }
};
