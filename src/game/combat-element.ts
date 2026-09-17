const nativeElement = (value: unknown) => {
  const element = String(value ?? '').trim();
  return element && element !== '无' ? element : undefined;
};

/**
 * 元素来源只在一次直接攻击开始时判定：技能使用自身元素；普通攻击优先武器/神器，
 * 只有真正无元素时才读取卡片赋予。中性技能不会继承装备或卡片元素。
 */
export const resolveDirectAttackElement = (options: {
  skill: boolean;
  skillElement?: unknown;
  weaponElement?: unknown;
  cardElement?: unknown;
}) => options.skill
  ? nativeElement(options.skillElement) ?? '无'
  : nativeElement(options.weaponElement) ?? nativeElement(options.cardElement) ?? '无';

export const hasNativeAttackElement = (value: unknown) => Boolean(nativeElement(value));
