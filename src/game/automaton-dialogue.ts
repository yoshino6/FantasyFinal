import { createHash } from 'node:crypto';
import { automatonCorpus } from './automaton-corpus';
import { automatonRandom } from './automaton-growth';
import type { AutomatonState } from './automaton';

export const dialogueHash=(text:string)=>createHash('sha256').update(text.normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu,'')).digest('hex');
export const escapeAutomatonText=(text:string)=>text.replace(/[\\`*_{}\[\]()<>#|!~]/g,'\\$&');
export const automatonInteractionText=(name:string,text:string)=>`〖${escapeAutomatonText(name)}〗\n“${escapeAutomatonText(text)}”`;
export const automatonBattleInteractionText=(line:string)=>{
  const match=/^[【〖](.*)[】〗]「(.*)」$/.exec(line);
  return match?automatonInteractionText(match[1]!,match[2]!):escapeAutomatonText(line);
};
export const renderAutomatonQuote=(template:string,state:AutomatonState,owner='旅伴',enemy='对手')=>{
  const text=template.replace(/\{(称呼|自称|主人|人偶|敌人)\}/g,(_,key:string)=>({称呼:state.personality.ownerAddress,自称:state.personality.selfAddress,主人:owner,人偶:state.name,敌人:enemy})[key]!);
  if([...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(text)].length>40)return null;
  return text;
};
export const chooseAutomatonQuote=(state:AutomatonState,event:string,key:string,used:Set<string>,facts:Set<string>=new Set(),allowCustom=false,owner?:string,enemy?:string)=>{
  const custom=allowCustom?(state.customQuotes[event]??[]).map((text,i)=>({id:`custom_${event}_${i}`,text,requires:[] as string[]})):[];
  const candidates=(custom.length?custom:automatonCorpus.dialogues.filter(q=>q.personaId===state.personality.coreId&&q.event===event)).filter(q=>q.requires.every(f=>facts.has(f))).map(q=>({...q,rendered:renderAutomatonQuote(q.text,state,owner,enemy),hash:dialogueHash(q.text.replace(/\{[^}]+\}/g,''))})).filter(q=>q.rendered!==null&&!used.has(q.hash));
  if(!candidates.length)return null;
  const expression=state.personality.traits.find(t=>t.id.startsWith('expression_'))?.ordinal??5;
  const interest=state.personality.traits.find(t=>t.id.startsWith('interest_'))?.ordinal;
  const topics=['天空|云|星','雨|水','花|草|树|叶','石|山','书|文字|记录','齿轮|机关|修','火|炉|光','食|味|汤','歌|声|曲','路|远方|风景'];
  const weighted=candidates.map(q=>({q,weight:Math.max(.5,Math.min(2,1+(state.preferences[q.id]??0)*.1))*(expression<=3?25/Math.max(10,q.rendered!.length):expression>=8?q.rendered!.length/20:1)*(interest&&['daily','greeting','reunion','rest'].includes(event)&&new RegExp(topics[interest-1]!).test(q.text)?1.5:1)}));
  let roll=automatonRandom(state.seed,`dialogue:${key}`)*weighted.reduce((s,q)=>s+q.weight,0);
  for(const {q,weight} of weighted){roll-=weight;if(roll<0)return {id:q.id,text:q.rendered!,hash:q.hash};}
  return null;
};
