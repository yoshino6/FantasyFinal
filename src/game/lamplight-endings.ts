import {lamplightPrivateEcho} from './lamplight.config';
import type {LamplightState} from './lamplight.types';
const greetings:Record<string,string>={
  baina_town:'莫妮卡先确认新来的旅人有没有受伤，再将空椅子拉到灯下。',
  world_tree:'维萝压平登记册的纸角，没有催促，耐心听新来的旅人把名字说完。',
  floating_leaf_town:'菈芮让柜台降到来客够得着的高度，把登记板稳稳放好。',
  snowlamp_hollow:'温棠递来烘热的登记板，提醒新来的旅人先让手指暖起来。',
  frost_dragon_inn:'格琳达小心扶住椅背，确认自己没有把它压坏，才招呼新来的旅人坐下。',
  sleepwhale_market:'滴算将账本翻到没有价签的一页，先说明登记不是订单，然后替来客留出一张椅子。'
};
export const lamplightEnding=(state:LamplightState,choices:Record<string,string>)=>{
  const flags=typeof state.flags_json==='string'?JSON.parse(state.flags_json):state.flags_json as Record<string,any>??{};
  const detour=flags.homeHub&&flags.homeHub!==state.local_hub;
  const policy=choices['WM08-4']==='B'?'有任期的联合维护组接手善后，六地保留公开监督和申诉的渠道。':'六地保留自己的维护权，跨区改线必须由受影响的人共同核验。';
  return`改线核心停了下来，维生与返程的灯仍亮着。诺维恩失去强制改线权限，必须面对自己造成的损害。\n\n${policy}\n\n${lamplightPrivateEcho(state)}\n\n${detour?'最初的公会暂未接待，回程改到仍开放的安全公会。原接待员的问候已经转来。':'你回到最初落脚的公会。'}${greetings[state.local_hub]}\n\n“没走错。先告诉我你的名字。”\n\n${detour?'你想起初到时的那把椅子，也替眼前的新旅人扶稳了椅背。':'你认出了那把椅子。它仍在原来的地方，椅脚却早已修得很稳。'}门外还有很长的路，屋里也仍有人会等旅人平安回来。`;
};
