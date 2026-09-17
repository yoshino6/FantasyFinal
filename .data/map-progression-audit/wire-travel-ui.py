from pathlib import Path
p=Path('src/response/adventure.ts');s=p.read_text(encoding='utf-8')
s="import { travelConfirmationFormat } from './travel-confirmation';\nimport { confirmTravelTarget } from '../game/connected-travel.service';\n"+s
start=s.index('export const goToHandler =');end=s.index('export const huntHandler =',start)
block=s[start:end];block=block.replace("if (result.kind === 'travel')", "if (result.kind === 'travel_confirmation') { await message.send({format:travelConfirmationFormat(result)}); return; } if (result.kind === 'travel')")
s=s[:start]+block+s[end:]
needle='const showMoveResult = async (message: any, qqUserId: string, result: any) => {'
assert needle in s;s=s.replace(needle,needle+"\n  if (result.kind === 'route_cancelled') { await message.send({format:messageFormat('行动停止',result.text)}); return; }",1)
s+='''
export const confirmGoToHandler = async () => {
  const [event]=useEvent(),[route]=useRoute(),[message]=useMessage();
  try {
    const user=event.current.UserId,token=String(route.param('token'));
    const plan=await confirmTravelTarget(user,token);
    const result=await moveTo(user,plan.target.x,plan.target.y,plan.target.z,{confirmationToken:token,destinationKind:plan.destinationKind,destinationRegionId:plan.target.regionId});
    if(result.kind==='travel_confirmation'){await message.send({format:travelConfirmationFormat(result)});return;}
    if(result.kind==='travel'){
      await message.send({format:travelFormat('开始前往',result.regionName,result.x,result.y,result.seconds,result.remaining,'move',result.destinationName,result.z)});
      scheduleTravelCompletion(message,user,result.remaining);return;
    }
    await showMoveResult(message,user,result);
  }catch(error){await fail(message,error,'无法确认前往');}
};
'''
p.write_text(s,encoding='utf-8')
p=Path('src/response/home.ts');s=p.read_text(encoding='utf-8');s="import { travelConfirmationFormat } from './travel-confirmation';\n"+s
needle="  if (result.kind === 'travel') {";assert needle in s;s=s.replace(needle,"  if (result.kind === 'travel_confirmation') { await message.send({format:travelConfirmationFormat(result)}); return; }\n"+needle,1);p.write_text(s,encoding='utf-8')
