/** 每个粉尘槽位独立判定；不能以一次成功乘以等级档位数量。 */
export const bossSkyDustSlots = (level: number) => Math.min(5,Math.max(1,1+Math.floor((level-1)/20)));
export const bossSkyDustDrops = <T extends {code?:string}>(drops:T[],target:{level:number;monster_class?:string;traits_json?:unknown}): (T|{code:string;chance:number;quantity:number})[] => {
  let traits:{code?:string}[]=[];try{traits=typeof target.traits_json==='string'?JSON.parse(target.traits_json):Array.isArray(target.traits_json)?target.traits_json:[];}catch{traits=[];}
  const clean=drops.filter(d=>d.code!=='sky_dust');
  if(target.monster_class!=='boss'||traits.some(t=>['summoned','boss_component','npc_sparring','domain_resident','advanced_profession_trial','boss_test','city_pursuit'].includes(t.code??'')))return clean;
  return [...clean,...Array.from({length:bossSkyDustSlots(Number(target.level))},()=>({code:'sky_dust',chance:.4,quantity:1}))];
};
