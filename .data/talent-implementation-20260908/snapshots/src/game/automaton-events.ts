/** 共同经历与普通操作日志分开展示；标题集中维护，避免漏掉已记录的重大事件。 */
export const automatonMemoryKinds: Record<string, string> = {
  birth: '诞生',
  first_met: '初识',
  认主: '结下契约',
  命名: '赋予名字',
  first_follow: '第一次随行',
  first_battle: '第一次并肩作战',
  first_victory: '第一次共同胜利',
  first_boss: '首次战胜 Boss',
  first_intercept: '第一次挺身护主',
  breakthrough: '成长突破',
  bond_milestone: '羁绊加深',
  skill_learned: '领悟新技能',
  shutdown: '战斗停机',
  recovery: '重新醒来',
  reunion: '久别重逢',
  休眠归档: '暂别休眠',
  恢复展示: '重回身边',
  重调: '回路重调'
};

export const automatonDialogueEvents: Record<string,string> = {
  daily:'每日问候',greeting:'打招呼',battle_start:'出战',attack:'出手',hurt:'自己受伤',owner_danger:'主人危急',intercept:'成功挡刀',victory:'胜利',shutdown:'停机',level_up:'材料升级',reunion:'久别重逢',rest:'休息'
};

export const automatonBondStages = [{value:0,name:'初醒'},{value:100,name:'熟悉'},{value:300,name:'默契'},{value:600,name:'信赖'},{value:1000,name:'相伴'}];
export const automatonBondName=(intimacy:number)=>automatonBondStages.filter(s=>s.value<=intimacy).at(-1)!.name;
