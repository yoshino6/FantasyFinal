import { getConfigValue } from 'alemonjs';

export const portraitHostConfig=()=>{
  const config=getConfigValue() as {FantasyFinal?:{automatonPortrait?:{host?:{provider?:string;uploadUrl?:string;token?:string;apiKey?:string}}}};
  const host=config.FantasyFinal?.automatonPortrait?.host;
  if(host?.provider==='imgbb'){
    if(!host.apiKey?.trim())throw new Error('ImgBB API Key 尚未配置。');
    return {provider:'imgbb',url:'https://api.imgbb.com/1/upload',token:host.apiKey.trim()};
  }
  if(host?.provider&&host.provider!=='generic')throw new Error('图床类型无效。');
  if(!host?.uploadUrl||!host.token)throw new Error('机巧图床尚未配置，暂不能上传图片。');
  const url=new URL(host.uploadUrl);
  if(url.protocol!=='https:'||url.username||url.password||url.hash)throw new Error('机巧图床配置无效，请联系管理员。');
  return {provider:'generic',url:url.href,token:host.token};
};
export const parsePortraitHostResponse=(value:unknown)=>{
  const result=value as {success?:unknown;status?:unknown;url?:unknown;data?:{url?:unknown;links?:{url?:unknown}}}|null;
  if(result?.success===false||result?.status===false)throw new Error('图床拒绝了上传请求。');
  const address=result?.data?.links?.url??result?.data?.url??result?.url;
  if(typeof address!=='string'||address.length>2048)throw new Error('图床没有返回有效图片地址。');
  const url=new URL(address);
  if(url.protocol!=='https:'||url.username||url.password||url.hash)throw new Error('图床须返回公开的 HTTPS 图片地址。');
  return url.href;
};
/** 可配置图床接口：multipart 文件字段 file，Bearer token，JSON 返回图片 URL。 */
export const uploadPortraitToHost=async(data:Buffer,key:string)=>{
  const config=portraitHostConfig(),form=new FormData();
  if(config.provider==='imgbb')form.append('key',config.token);
  form.append(config.provider==='imgbb'?'image':'file',new Blob([new Uint8Array(data)],{type:'image/webp'}),key);
  try{
    const response=await fetch(config.url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20_000),headers:config.provider==='imgbb'?{Accept:'application/json'}:{Authorization:'Bearer '+config.token,Accept:'application/json'},body:form});
    if(!response.ok)throw new Error('图床上传失败。');
    return parsePortraitHostResponse(await response.json());
  }catch{throw new Error('图床上传失败，本次审核未生效，图片仍待审核，原形象保留，请稍后重试。');}
};
