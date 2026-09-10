import { armorSetDescription, armorSetFromRows } from './armor-set';
import { epicLoadoutFromRows } from './epic-equipment.service';
import { epicSetProfile, type EpicSetCode } from '../config/epic-forging';

const epicEffects: Record<EpicSetCode, [string,string]> = {
  mountainheart_regalia: [
    '地脉承压：每回合首次承受技能直击获得1层岩压，最多3层；每层使所受技能直击伤害降低2%。',
    '断层壁障：3层岩压转为12%最大生命护盾与20%控制抗性，持续2回合；壁障期间暂停积累岩压。'
  ],
  valk_forge_regalia: [
    '余热铸甲：生命上限+6%；每回合首次承受技能直击获得1层余热，最多2层。每层技能直击减伤2%、自身技能直击伤害+2%，受击时另获每层10%控制抗性（1回合）。',
    '炉壁回铸：2层余热于自身下回合转为10%生命护盾与炽锻，持续2回合。每回合首次技能直击伤害+10%、无视对应防御8%；技能击破炉壁时剩余伤害降低20%，并使下一次技能直击伤害+8%。每3回合至多触发一次。'
  ],
  mistmother_cocoon: [
    '雾生灵潮：魔法技能直击伤害+6%，有效治疗+8%；不增加持续伤害、护盾、魔力恢复或复活。',
    '三首潮汐：魔法技能直击、成功施加非持续伤害减益或有效治疗队友积累潮汐；满3层后下次魔法技能直击或有效治疗追加35%回响。回响不能暴击或触发命中后效果。'
  ],
  goblin_court_hunt: [
    '林下伏势：对带减益的目标造成技能直击伤害+6%，自身持续伤害+10%。',
    '王旗围猎：自身成功施加减益时在该目标身上积累猎令，最多2层、持续3回合；满层后下次对该目标的物理技能直击消耗猎令，追加35%物理追击，不能暴击或触发命中后效果。'
  ]
};

export const equipmentSetSummary = (items: readonly {slot:string;weapon_type?:string|null;effect_json:unknown}[]) => {
  const entries: {title:string;effects:string[]}[] = [], armor = armorSetFromRows(items), epic = epicLoadoutFromRows(items);
  if (armor) entries.push({title:`${armor.name} ${armor.count}/5件 · ${armor.tier}件效果`,effects:[armorSetDescription(armor)]});
  if(epic.crimsonCount){
    entries.push({title:`猩红王冠 ${epic.crimsonCount}/5件`,effects:[`残光护持：每场 PVE 首次受直接伤害后生命低于40%时，获得${epic.crimsonCount>=2?8:5}%最大生命护盾（1回合）。`,...(epic.crimsonCount>=5?['5件 · 非战斗休息恢复速度提高10%。']:[])]});
  }
  if (epic.setCode && epic.setCode!=='crimson_crown' && epic.setCount>=3) {
    const effects = epicEffects[epic.setCode];
    entries.push({title:`${epicSetProfile(epic.setCode)?.name ?? epic.setCode} ${epic.setCount}/5件`,effects:[`3件 · ${effects[0]}`,...(epic.setCount>=5?[`5件 · ${effects[1]}`]:[])]});
  }
  return entries;
};
