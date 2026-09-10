import type { RuleUnit } from './combat-rule-registry';
import { hiddenProfession, hiddenSkill, type HiddenProfessionCode } from './hidden-profession.config';
import type { ActiveDeviceSkill } from './device.service';
import type { MixCatalyst } from './hidden-particles';

export type HiddenChoice = { particles?: string[]; weapons?: number[]; devices?: { id: number; skill: string }[]; donor?: number; mode?: string; target?: string };
export type HiddenWeapon = { id: number; name: string; type: string; attack: number; magic: number; element: string };
export type HiddenDevice = { id: number; code: string; name: string; energy: number; max: number; skills: ActiveDeviceSkill[] };
export type HiddenTick = { turn: number; source: string; target: string; kind: 'damage' | 'heal' | 'shield'; amount: number; power?: number; magic?: boolean; element?: string; attack?: number; label: string; growthShield?: number; healLimit?: number; noHit?: boolean; failure?: boolean };
export type HiddenState = { profession?: HiddenProfessionCode; resource: number; incomeTurn: number; income: number; action: number; active?: string; consumes?: boolean; lastPrimary?: string; lastType?: string; lastCapability?: string; driverTurn?: number; inheritance?: boolean; catalyst?: { mode: MixCatalyst; until: number }; ticks: HiddenTick[]; order?: { target: string; delta: number; turn: number; side: string }; };
export const hiddenState = (unit: Pick<RuleUnit, 'cooldowns'>): HiddenState => {
  const existing = unit.cooldowns.__hidden as HiddenState | undefined;
  if (existing && typeof existing === 'object') { existing.ticks ??= []; return existing; }
  const state: HiddenState = { resource: 0, incomeTurn: -1, income: 0, action: 0, ticks: [] };
  unit.cooldowns.__hidden = state;
  return state;
};
export const hiddenResourceView = (cooldowns: Record<string, unknown>) => {
  const state = cooldowns.__hidden as HiddenState | undefined;
  const profession = state?.profession ? hiddenProfession(state.profession) : undefined;
  return profession ? { professionCode: profession.code, code: profession.code, name: profession.resource, current: state?.resource ?? 0, max: 100 } : null;
};
/** 准备页、行动提交和最终施法共用，不因查看页面初始化或消耗资源。 */
export const hiddenResourceShortage = (code: string, cooldowns: Record<string, unknown>) => {
  const skill=hiddenSkill(code);if(!skill?.resource)return null;
  const state=cooldowns.__hidden as HiddenState|undefined,current=Math.max(0,Number(state?.resource)||0);
  return current<skill.resource?`${hiddenProfession(skill.profession)!.resource}不足：需要 ${skill.resource}，当前 ${current}/100。`:null;
};
export const gainHiddenResource = (unit: RuleUnit, turn: number, amount: number, refund = false) => {
  const state = hiddenState(unit), profession = hiddenProfession(state.profession ?? '');
  if (!profession || amount <= 0 || !refund && (state.consumes || unit.hp <= 0)) return 0;
  if (state.incomeTurn !== turn) { state.incomeTurn = turn; state.income = 0; }
  const gained = Math.max(0, Math.min(amount, 100 - state.resource, refund ? 100 : profession.cap - state.income));
  state.resource += gained; if (!refund) state.income += gained;
  return gained;
};
export const hiddenActionKey = (unit: RuleUnit, turn: number) => `${unit.key}/${turn}/${hiddenState(unit).action}`;
