import { useEvent, useRoute } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message';
import { advanceOpening, beginOpening, openingStatus } from '../game/opening.service';
import { openingFormat } from '../game/opening-message';
import { messageFormat } from '../game/message';
import { enterOpeningGuild } from '../game/opening-guild.service';
import { openingGuildFormat } from './opening-guild';

export const openingPersonHandler=async()=>{
  const[message]=useGameMessage();
  await message.send({format:messageFormat('初行人物','初行剧情不提供人物详情；抵达安全区后，可与实际遇到的域民交谈。')});
};

export const openingChoiceHandler=async()=>{
  const[event]=useEvent();const[route]=useRoute();const[message]=useGameMessage();
  try{
    const result=await advanceOpening(event.current.UserId,Number(route.param('revision')),String(route.param('action')));
    if(result.forestBattleChoice){
      await (await import('./adventure')).startOpeningForestBattle(event.current.UserId,result.forestBattleChoice,message);
      return;
    }
    if(result.state==='completed'){
      await enterOpeningGuild(event.current.UserId,true);
      await message.send({format:await openingGuildFormat(event.current.UserId)});
      return;
    }
    await message.send({format:openingFormat(result)});
  }
  catch(error){await message.send({format:messageFormat('初行剧情',error instanceof Error?error.message:'请稍后重试。')});}
};
export const continueOpeningIfPresent=async(user:string,message:{send:(params:any)=>Promise<any>})=>{
  const current=await openingStatus(user);if(!current||current.state==='completed')return false;
  if(current.state==='armed'){await message.send({format:openingFormat(current)});return true;}
  const story=await beginOpening(user);if(!story)return false;await message.send({format:openingFormat(story)});return true;
};
