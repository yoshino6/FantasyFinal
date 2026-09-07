import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIPv4 } from 'node:net';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

export const portraitMaxBytes=5*1024*1024;
const blocked=new BlockList();
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['192.0.0.0',24],['192.0.2.0',24],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const)blocked.addSubnet(address,prefix);
export const isPortraitPublicAddress=(address:string)=>isIPv4(address)&&!blocked.check(address,'ipv4');

/** 仅下载事件附件；DNS 校验后固定公网地址，重定向逐跳检查。 */
export const downloadPortrait=async(value:string):Promise<Buffer>=>{
  const deadline=Date.now()+20_000;
  const fetch=async(value:string,redirects:number):Promise<Buffer>=>{
    const url=new URL(value.startsWith('//')?'https:'+value:value);
    if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443'))throw new Error('图片地址无效，请直接发送图片。');
    let dnsTimer:ReturnType<typeof setTimeout>|undefined;
    const addresses=await Promise.race([
      lookup(url.hostname,{family:4,all:true}),
      new Promise<never>((_resolve,reject)=>{dnsTimer=setTimeout(()=>reject(new Error('图片下载超时，请重试。')),Math.max(1,deadline-Date.now()));})
    ]).finally(()=>clearTimeout(dnsTimer));
    if(!addresses.length||addresses.some(a=>!isPortraitPublicAddress(a.address)))throw new Error('图片地址不可访问。');
    const timeout=deadline-Date.now();if(timeout<=0)throw new Error('图片下载超时，请重试。');
    return new Promise<Buffer>((accept,reject)=>{
      const req=request(url,{agent:false,family:4,lookup:(_host,_options,callback)=>callback(null,addresses[0]!.address,4)},res=>{
        if([301,302,303,307,308].includes(res.statusCode??0)){
          res.resume();if(!res.headers.location||redirects>=3){reject(new Error('图片地址重定向过多。'));return;}
          void fetch(new URL(res.headers.location,url).href,redirects+1).then(accept,reject);return;
        }
        if(res.statusCode!==200){res.resume();reject(new Error('图片下载失败，请重新发送。'));return;}
        if(Number(res.headers['content-length'])>portraitMaxBytes){res.destroy();reject(new Error('图片不能超过 5 MB。'));return;}
        const chunks:Buffer[]=[];let size=0;
        res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>portraitMaxBytes){res.destroy(new Error('图片不能超过 5 MB。'));return;}chunks.push(chunk);});
        res.on('end',()=>accept(Buffer.concat(chunks)));res.on('error',reject);
      });
      const timer=setTimeout(()=>req.destroy(new Error('图片下载超时，请重试。')),timeout);timer.unref();
      req.on('close',()=>clearTimeout(timer));req.on('error',reject);req.end();
    });
  };
  return fetch(value,0);
};

export const normalizePortrait=async(input:Buffer)=>{
  if(!input.length||input.length>portraitMaxBytes)throw new Error('请发送不超过 5 MB 的图片。');
  try{
    const image=sharp(input,{limitInputPixels:25_000_000,failOn:'error'});
    const metadata=await image.metadata();
    if(!['jpeg','png','webp'].includes(metadata.format??'')||(metadata.pages??1)>1)throw new Error('仅支持静态 JPG、PNG 或 WebP 图片。');
    const {data,info}=await image.rotate().resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer({resolveWithObject:true});
    if(data.length>2*1024*1024)throw new Error('图片过于复杂，压缩后仍过大。');
    return {data,width:info.width,height:info.height};
  }catch(error){if(error instanceof Error&&/仅支持|压缩后/.test(error.message))throw error;throw new Error('无法读取图片，请发送有效的静态 JPG、PNG 或 WebP 图片（不超过2500万像素）。');}
};
export const portraitPath=(key:string)=>{
  if(!/^[a-f0-9]{32}\.webp$/.test(key))throw new Error('形象文件编号无效。');
  return resolve('.data','automaton-portraits',key);
};
export const writePortrait=async(key:string,data:Buffer)=>{await mkdir(resolve('.data','automaton-portraits'),{recursive:true});await writeFile(portraitPath(key),data,{flag:'wx'});};
export const readPortrait=(key:string)=>readFile(portraitPath(key));
export const removePortrait=async(key:string)=>{try{await unlink(portraitPath(key));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}};

/** QQ 原生图文会把 Markdown 按钮转成文字，故只合成标题和形象，属性与按钮另接一条。 */
export const portraitHeaderImage=async(key:string)=>{
  const input=await readPortrait(key);
  const {data,info}=await sharp(input).resize({width:600,height:520,fit:'inside',withoutEnlargement:true}).toBuffer({resolveWithObject:true});
  const width=648,height=info.height+116;
  const title=Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" rx="20" fill="#f5f2eb"/><text x="28" y="49" font-size="28" font-weight="bold" fill="#343b45" font-family="Microsoft YaHei,PingFang SC,Noto Sans CJK SC,sans-serif">机巧·详情</text><path d="M28 69 H620" stroke="#d6d0c5"/></svg>`);
  return sharp(title).composite([{input:data,left:Math.floor((width-info.width)/2),top:88}]).webp({quality:88}).toBuffer();
};
