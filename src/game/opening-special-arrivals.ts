import type { OpeningBranch, OpeningPage } from './opening.types';

const windbirdArrival:OpeningPage[]=[{title:'第一次学飞',text:'猎魔艇刚离开云崖，怀里的鸟蛋便传来一声细响。第一道裂纹从蛋顶一路爬到掌心，湿漉漉的幼鸟顶开蛋壳，先冲巨鸟叫了一声，又摇摇晃晃钻进我的斗篷。\n\n烬川伸手想检查它的翅膀，幼鸟却用短喙啄开他的手套，紧紧勾住我的衣带。他看了我一会儿，收回手：“它自己选了。你要带它走，就别把这当成捡到一件东西。”\n\n巨鸟在艇顶盘旋一周，没有追下来，只落下一根长羽。幼鸟仰头回应，随后跟着我踏进世界树的灯火。'}];
const automatonArrival:OpeningPage[]=[{title:'它选择了我',text:'维修轨车驶出山坳时，机偶仍站在原地。我以为它会留在维修棚，身后却响起不紧不慢的金属脚步。\n\n它追到车旁，将空白认主槽转向我：“旧归属无法确认。自主选择协议有效。申请将同行对象登记为你。”\n\n我还没想好该怎样回答，它已经稳稳抓住车栏，和我一起驶向世界树。那张伪造认主纸被它折成小小一块，留作寻找旧日真相的第一条线索。'}];

/** 分支真正改变同行关系时，抵达页也必须延续这一变化。 */
export const openingSpecialArrival=(route:string,branch:OpeningBranch|null):OpeningPage[]|undefined=>{
  if(route==='S03'&&branch==='A')return windbirdArrival;
  if(route==='I02'&&(branch==='A'||branch==='B'))return automatonArrival;
  return undefined;
};
