/**
 * 玩家可见的叙述使用主角第一人称；引号内仍是角色当面说出的原话。
 * 不在此处改动选项、任务或系统按钮，它们保留行动提示的简短写法。
 */
export const firstPersonNarrative=(text:string)=>{
  let result='',outside='';let quoted=false;
  const flush=()=>{
    if(!outside)return;
    result+=outside.replace(/你们/g,'我们').replace(/你的/g,'我的').replace(/你/g,'我');
    outside='';
  };
  for(const char of text){
    if(char==='“'){flush();quoted=true;result+=char;continue;}
    if(char==='”'){quoted=false;result+=char;continue;}
    if(quoted)result+=char;else outside+=char;
  }
  flush();
  return result;
};
