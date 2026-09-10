import type { PoolConnection } from 'mysql2/promise';
import { randomUUID } from 'node:crypto';

export type AchievementFact = { metric: string; value?: number; distinct?: string; life?: boolean; maximum?: boolean; cooperationKey?: string };
export type AchievementEvent = { characterId: number; key: string; facts: AchievementFact[] };
export const isCooperativeAchievement=(id:string)=>id.startsWith('ACH_BOSS_')||['ACH_EGG21','ACH_EGG27','ACH_L13','ACH_L14','ACH_G12','ACH_G25','ACH_D24','ACH_EGG05','ACH_B08','ACH_B09','ACH_G02','ACH_G03','ACH_G04','ACH_G06','ACH_G07','ACH_G08','ACH_G09','ACH_G10'].includes(id);
const queued = new WeakMap<PoolConnection, AchievementEvent[]>();
/** 仅供完成支付与结算校验的服务调用。事务失败时与业务一同丢弃。 */
export const recordAchievement = (connection: PoolConnection, characterId: number, facts: AchievementFact[] | string[], key: string = randomUUID()) => {
  const events = queued.get(connection) ?? [];
  events.push({ characterId: Number(characterId), key, facts: facts.map(f => typeof f === 'string' ? { metric: f } : f) });
  queued.set(connection, events);
};
export const takeAchievementEvents = (connection: PoolConnection) => {
  const events = queued.get(connection) ?? [];
  queued.delete(connection);
  return events;
};
