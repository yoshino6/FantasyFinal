export type ChestReward = { code:string; min:number; max:number; equipment?:boolean };
export type ChestTable = { code:string;version:number;fixed:ChestReward[];groups:{draws:number;entries:{weight:number;rewards:ChestReward[]}[]}[];independent:{chance:number;reward:ChestReward}[] };
export const dawnWeapons=[['sword','长剑','初晓·拾光长剑'],['dagger','匕首','初晓·露痕短刃'],['knuckle','拳刃','初晓·轻跃拳刃'],['staff','法杖','初晓·晨枝法杖'],['book','法书','初晓·未写之页'],['orb','法球','初晓·掌心微日']] as const;
export const crimsonArmor=[['shoulder','头肩','猩红王冠·断角肩饰'],['upper','上装','猩红王冠·余烬礼衣'],['waist','腰部','猩红王冠·王印束带'],['lower','下装','猩红王冠·夜宴裙甲'],['feet','脚部','猩红王冠·归火短靴']] as const;
const goldenChestTableV1:ChestTable={code:'opening_golden_chest',version:1,fixed:[{code:'healing_herb',min:2,max:2}],groups:[{draws:1,entries:[
  ...dawnWeapons.map(([code])=>({weight:20/6,rewards:[{code:`dawn_${code}`,min:1,max:1,equipment:true}]})),
  ...dawnWeapons.map(([code])=>({weight:30/6,rewards:[{code:`opening_rare_${code}`,min:1,max:1,equipment:true}]})),
  ...crimsonArmor.map(([code])=>({weight:20/5,rewards:[{code:`opening_rare_${code}`,min:1,max:1,equipment:true}]})),
  {weight:15,rewards:[{code:'healing_herb',min:3,max:3},{code:'opening_medical_coupon',min:1,max:1}]},
  {weight:15,rewards:[{code:'opening_trade_coupon',min:2,max:2}]}
]}],independent:[]};
export const goldenChestTable:ChestTable={...goldenChestTableV1,version:2,groups:[{draws:1,entries:[
  ...goldenChestTableV1.groups[0].entries.slice(0,-2),
  {weight:15,rewards:[{code:'healing_herb',min:3,max:3},{code:'novice_mp_potion_small',min:2,max:2}]},
  {weight:15,rewards:[{code:'opening_trade_coupon',min:1,max:1}]}
]}]};
export const chestTables:Record<string,ChestTable>={[goldenChestTable.code]:goldenChestTable};
/** Issued previews keep their sealed version and never reroll on an update. */
export const chestTableForVersion=(code:string,version:number)=>code==='opening_golden_chest'?(version===1?goldenChestTableV1:version===2?goldenChestTable:undefined):undefined;
export const rollChest=(table:ChestTable,count:number,random=Math.random)=>{
  if(!Number.isInteger(count)||count<1||count>100)throw new Error('开箱数量必须为1～100的整数。');
  const result:{code:string;quantity:number;equipment:boolean}[]=[];
  const grant=(reward:ChestReward)=>{if(!Number.isInteger(reward.min)||reward.min<1||reward.max<reward.min)throw new Error('宝箱数量配置无效。');result.push({code:reward.code,quantity:reward.min+Math.floor(random()*(reward.max-reward.min+1)),equipment:Boolean(reward.equipment)});};
  for(let i=0;i<count;i++){
    table.fixed.forEach(grant);
    for(const group of table.groups){const total=group.entries.reduce((sum,e)=>sum+e.weight,0);if(!(total>0)||group.entries.some(e=>e.weight<=0))throw new Error('宝箱权重配置无效。');
      for(let draw=0;draw<group.draws;draw++){let point=random()*total;let selected=group.entries[group.entries.length-1];for(const entry of group.entries){point-=entry.weight;if(point<0){selected=entry;break;}}selected.rewards.forEach(grant);}}
    for(const entry of table.independent){if(entry.chance<0||entry.chance>1)throw new Error('宝箱概率配置无效。');if(random()<entry.chance)grant(entry.reward);}
  }return result;
};
