import { createHash } from 'node:crypto';
import { automatonCorpus } from './automaton-corpus';
import { automatonRandom } from './automaton-growth';
import type { AutomatonState } from './automaton';

export const dialogueHash=(text:string)=>createHash('sha256').update(text.normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu,'')).digest('hex');
export const escapeAutomatonText=(text:string)=>text.replace(/[\\`*_{}\[\]()<>#|!~]/g,'\\$&');
export const renderAutomatonQuote=(template:string,state:AutomatonState,owner='旅伴',enemy='对手')=>{
  const text=template.replace(/\{(称呼|自称|主人|人偶|敌人)\}/g,(_,key:string)=>({称呼:state.ownerAddress,自称:state.selfAddress,主人:owner,人偶:state.name,敌人:enemy})[key]!);
  if([...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(text)].length>40)return null;
  return text;
};
export const chooseAutomatonQuote=(state:AutomatonState,event:string,key:string,used:Set<string>,facts:Set<string>=new Set(),allowCustom=false)=>{
  const custom=allowCustom?(state.customQuotes[event]??[]).map((text,i)=>({id:`custom_${event}_${i}`,text,requires:[] as string[]})):[];
  const candidates=(custom.length?custom:automatonCorpus.dialogues.filter(q=>q.personaId===state.personality.coreId&&q.event===event)).filter(q=>q.requires.every(f=>facts.has(f))).map(q=>({...q,rendered:renderAutomatonQuote(q.text,state)})).filter(q=>q.rendered!==null&&!used.has(dialogueHash(q.rendered!)));
  if(!candidates.length)return null;
  const weighted=candidates.map(q=>({q,weight:Math.max(.1,Math.min(5,1+(state.preferences[q.id]??0)*.1))}));
  let roll=automatonRandom(state.seed,`dialogue:${key}`)*weighted.reduce((s,q)=>s+q.weight,0);
  for(const {q,weight} of weighted){roll-=weight;if(roll<0)return {id:q.id,text:q.rendered!,hash:dialogueHash(q.rendered!)};}
  return null;
};
