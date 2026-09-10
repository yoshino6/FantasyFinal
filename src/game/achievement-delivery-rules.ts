export type AchievementDeliveryResult={code?:number;message?:unknown;data?:unknown};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'?v as Record<string,unknown>:{};
export const achievementDeliveryOutcome=(results:readonly AchievementDeliveryResult[])=>{
  const successes=results.filter(r=>r.code===2000);
  const platformCodes=results.map(r=>Number(object(r.message).err_code??object(r.message).code??0)).filter(Boolean);
  const messageIds=successes.map(r=>String(object(r.data).id??'')).filter(Boolean);
  // 行为超时、断网、无回执等都可能已经送达，绝不能当作明确失败自动重发。
  const blocked=results.length>0&&results.every(r=>r.code===4001||r.code===4002||Number(object(r.message).err_code??object(r.message).code)===40034105);
  const status=successes.length===results.length&&results.length>0?'sent':successes.length>0?'uncertain':blocked?'blocked':'uncertain';
  return {status,resultCodes:results.map(r=>Number(r.code??0)),platformCodes,messageIds};
};
