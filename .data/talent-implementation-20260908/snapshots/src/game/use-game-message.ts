import { Format, ResultCode, logger, useEvent, useMessage, useRoute } from 'alemonjs';
import { reserveDailyAutomaton, finishDailyAutomaton, acknowledgeAutomatonBattleText } from './automaton-dialogue.service';
import { automatonInteractionText, automatonBattleInteractionText } from './automaton-dialogue';
import { secondaryShopFormatSource } from './secondary-shop-format';
import { AsyncLocalStorage } from 'node:async_hooks';

const mutedAutomatonInteractions=new AsyncLocalStorage<boolean>();
/** 自动战斗仍发送战报和结算，但不额外发送对白或每日问候；主动消息同样适用。 */
export const withoutAutomatonInteractions=<T extends {send:(params:any)=>any}>(message:T):T=>({...message,send(params:any){
  const original=Array.isArray(params)?params:params?.format instanceof Format?params.format.value:params?.format;
  const split=separateAutomatonBattleQuotes(original);
  const quiet=split.quotes.length?(Array.isArray(params)?split.source:{...params,format:split.source}):params;
  return mutedAutomatonInteractions.run(true,()=>message.send(quiet));
}});

/** 展示时将机巧对白从战报中拆出，历史日志与伤害记录保持完整。 */
export const separateAutomatonBattleQuotes=(source:unknown)=>{
  const quotes:string[]=[];
  const visit=(value:unknown):unknown=>{
    if(Array.isArray(value))return value.map(visit);
    if(!value||typeof value!=='object')return value;
    const node=value as {type?:string;value?:unknown};
    if(typeof node.value==='string'&&['Text','MarkdownOriginal','MD.text','MD.blockquote','MD.code'].includes(node.type??'')){
      const lines=node.value.split(/\r?\n/).filter(line=>{
        // 新对白以内部标记识别，兼容历史日志；普通 NPC 同名对白不拆出。
        if(!/^(?:\u2063[【〖][^\r\n]+[】〗]|【[^\r\n]+（机巧）】)「[^\r\n]+」$/.test(line))return true;
        const quote=line.replace(/^\u2063/,'');
        if(!quotes.includes(quote))quotes.push(quote);return false;
      });
      return {...node,value:lines.join('\n')};
    }
    return Array.isArray(node.value)?{...node,value:visit(node.value)}:value;
  };
  return {source:visit(source),quotes};
};

/** 游戏结果先发送，人偶对白和每日问候单独发送、单独确认回执。 */
export const useGameMessage:typeof useMessage=(eventArg)=>{
  const [message]=useMessage(eventArg);
  return [{...message,async send(params){
    const original=Array.isArray(params)?params:params?.format instanceof Format?params.format.value:params?.format;
    const shopSource=secondaryShopFormatSource(original);
    const split=separateAutomatonBattleQuotes(shopSource);
    if(split.quotes.length||shopSource!==original)params=(Array.isArray(params)?split.source:{...params,format:split.source}) as typeof params;
    const results=await message.send(params);
    if(!results.length||!results.every(r=>r.code===ResultCode.Ok))return results;
    if(mutedAutomatonInteractions.getStore())return results;
    try{
      const [event]=useEvent(eventArg),[route]=useRoute();const user=event.current.UserId;
      if(!user)return results;
      for(const quote of split.quotes){
        const sent=await message.send({format:Format.create().addMarkdown(Format.createMarkdown().addText(automatonBattleInteractionText(quote)))});
        if(sent.length&&sent.every(r=>r.code===ResultCode.Ok))await acknowledgeAutomatonBattleText(user,quote);
      }
      const daily=route.matched?await reserveDailyAutomaton(user,Boolean(event.current.IsPrivate)):null;
      if(daily){
        // 抛错、空回执或部分成功保留投递不确定状态，避免跨会话重复发送。
        const sent=await message.send({format:Format.create().addMarkdown(Format.createMarkdown().addText(automatonInteractionText(daily.name,daily.text)))});
        if(sent.length&&sent.every(r=>r.code===ResultCode.Ok))await finishDailyAutomaton(daily,true);
        else if(sent.length&&sent.every(r=>r.code!==ResultCode.Ok))await finishDailyAutomaton(daily,false);
      }
    }catch(error){logger.warn({err:error},'游戏回复已发送，机巧互动消息暂未送达');}
    return results;
  }}];
};
