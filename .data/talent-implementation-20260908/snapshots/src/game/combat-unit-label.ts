/** 姓名保持本名，玩家的召唤物与随从仅在展示时使用中空括号。 */
export const combatUnitLabel=(unit:{name:string;key?:string;companion?:boolean;npc_code?:string|null})=>
  unit.companion||unit.npc_code||unit.key?.startsWith('automaton:')?`〖${unit.name}〗`:`【${unit.name}】`;
