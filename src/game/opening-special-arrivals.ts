import type { OpeningBranch, OpeningPage } from './opening.types';

/** 分支真正改变同行关系时，抵达页也必须延续这一变化。 */
export const openingSpecialArrival=(route:string,branch:OpeningBranch|null):OpeningPage[]|undefined=>{
  void route;
  void branch;
  return undefined;
};
