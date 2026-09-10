import { useEvent, useRoute } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message';
import { beginOpening, openingStatus } from '../game/opening.service';
import { openingFormat } from '../game/opening-message';

// The middleware displays the story; authoritative service guards separately reject bypass calls.
const safe=/^(?:角色|我|角色详情|状态|设备状态|服务器状态|面板|菜单|帮助|任务|主线|地图|地图区域|背包|物品|物品详情|技能列表|技能详情|初行选择|继续剧情|初行见闻|随从|随从详情|打开宝箱|确认开箱|开箱记录|宝箱内容|注册|恩赐)(?:$| )/;
export default async(_event:unknown,next:()=>Promise<void>)=>{
  const[event]=useEvent();const[route]=useRoute();if(!route.matched||safe.test(route.key)){await next();return;}
  const current=await openingStatus(event.current.UserId);if(!current||current.state==='completed'){await next();return;}
  if(current.state==='armed'&&!/^(?:寻怪|移动|前往|前往地图|前往怪物)(?:$| )/.test(route.key)){
    const[message]=useGameMessage();await message.send({format:openingFormat(current)});return;
  }
  const entry=/^寻怪(?:$| )/.test(route.key)?'hunt':'move';
  const story=await beginOpening(event.current.UserId,entry);if(!story){await next();return;}
  const[message]=useGameMessage();await message.send({format:openingFormat(story)});
};
