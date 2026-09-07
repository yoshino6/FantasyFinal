import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import sharp from 'sharp';
import { normalizePortrait, portraitPath, isPortraitPublicAddress, downloadPortrait, portraitMaxBytes } from '../src/game/automaton-portrait-image';
import { Format } from '../node_modules/alemonjs/lib/application/format/message-format.js';

const load=(path:string,mocks:Record<string,unknown>)=>{
  const module={exports:{} as any};
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',code)((id:string)=>{if(!(id in mocks))throw Error('Unexpected dependency: '+id);return mocks[id];},module,module.exports);return module.exports;
};
test('形象附件校验真实格式、尺寸、元数据、路径与内网地址',async()=>{
  const input=await sharp({create:{width:1800,height:900,channels:3,background:'#5588ff'}}).jpeg().withMetadata().toBuffer();
  const output=await normalizePortrait(input),meta=await sharp(output.data).metadata();
  assert.equal(output.width,1024);assert.equal(output.height,512);assert.equal(meta.format,'webp');assert.equal(meta.exif,undefined);
  await assert.rejects(normalizePortrait(Buffer.from('not an image')),/无法读取/);
  await assert.rejects(normalizePortrait(Buffer.alloc(portraitMaxBytes+1)),/5 MB/);
  await assert.rejects(normalizePortrait(Buffer.from('<svg width="1" height="1"></svg>')),/仅支持/);
  const gif=await sharp({create:{width:2,height:2,channels:3,background:'red'}}).gif().toBuffer();await assert.rejects(normalizePortrait(gif),/仅支持/);
  assert.throws(()=>portraitPath('../secret'),/编号/);
  for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','172.16.0.1','100.64.0.1','::1'])assert.equal(isPortraitPublicAddress(address),false);
  assert.equal(isPortraitPublicAddress('8.8.8.8'),true);
  await assert.rejects(downloadPortrait('http://example.com/image.png'),/地址无效/);
  await assert.rejects(downloadPortrait('https://127.0.0.1/image.png'),/不可访问/);
});

test('图床适配 ImgBB 与通用上传接口，拒绝错误响应且不发送过期参数',async()=>{
  let config:any={FantasyFinal:{automatonPortrait:{host:{provider:'imgbb',apiKey:'test-key'}}}};
  const host=load('src/game/automaton-portrait-host.ts',{alemonjs:{getConfigValue:()=>config}}),oldFetch=globalThis.fetch;
  let calls=0;
  globalThis.fetch=(async(url:any,options:any)=>{
    calls++;assert.equal(url,'https://api.imgbb.com/1/upload');assert.equal(options.body.get('key'),'test-key');assert.equal(options.body.has('expiration'),false);assert(options.body.get('image') instanceof Blob);assert.equal(options.headers.Authorization,undefined);
    return {ok:true,json:async()=>({data:{url:'https://i.ibb.co/test/image.webp'}})};
  }) as any;
  try{
    assert.equal(await host.uploadPortraitToHost(Buffer.from('image'),'1.webp'),'https://i.ibb.co/test/image.webp');assert.equal(calls,1);
    assert.equal(host.parsePortraitHostResponse({data:{links:{url:'https://example.com/a.webp'}}}),'https://example.com/a.webp');
    for(const value of [{},{success:false,data:{url:'https://example.com/x'}},{url:'http://example.com/x'},{url:'https://user:pass@example.com/x'},{url:'javascript:alert(1)'}])assert.throws(()=>host.parsePortraitHostResponse(value));
    globalThis.fetch=(async()=>({ok:false})) as any;await assert.rejects(host.uploadPortraitToHost(Buffer.from('x'),'1.webp'),/仍待审核/);
    config={};assert.throws(()=>host.portraitHostConfig(),/尚未配置/);
  }finally{globalThis.fetch=oldFetch;}
});

test('玩家上传只保存本地并排队，排队失败删除文件；不调用公开图床',async()=>{
  const calls:string[]=[];let fail=false;
  const service=load('src/game/automaton-portrait-upload.ts',{
    'node:crypto':{randomBytes:()=>({toString:()=> '1'.repeat(32)})},alemonjs:{logger:{warn:()=>{}}},
    './automaton-portrait-image':{portraitMaxBytes,downloadPortrait:async()=>{calls.push('download');return Buffer.from('input');},normalizePortrait:async()=>({data:Buffer.from('normalized'),width:1,height:1}),writePortrait:async()=>{calls.push('write');},removePortrait:async()=>{calls.push('remove');}},
    './automaton-portrait.service':{submitPortraitReview:async()=>{calls.push('queue');if(fail)throw Error('cancelled');return{name:'小光'};},retryPortraitUpload:async()=>{calls.push('retry');}}
  });
  await service.acceptPortraitImage('u',{id:1},[{Type:'image',Url:'https://attachment.example/a'}]);assert.deepEqual(calls,['download','write','queue']);
  calls.length=0;fail=true;await assert.rejects(service.acceptPortraitImage('u',{id:1},[{Type:'image',Url:'https://attachment.example/a'}]),/cancelled/);assert.deepEqual(calls,['download','write','queue','remove','retry']);
});

test('图片中间件仅消费等待中的图片，透传不重复执行；提交后的发送失败不反报失败',async()=>{
  const event:any={current:{UserId:'u',IsPrivate:true,MessageMedia:[{Type:'image'}]}},sends:any[]=[];let pending:any=null,nextCalls=0,sendFails=false;
  const middleware=load('src/middleware/automaton-portrait-upload.ts',{
    alemonjs:{Format,logger:{warn:()=>{}},useEvent:()=>[event],useMessage:()=>[{send:async(p:any)=>{sends.push(p);if(sendFails)throw Error('delivery failed');}}]},
    '../game/automaton-portrait.service':{portraitScope:()=> 'scope',reservePortraitUpload:async()=>pending},
    '../game/automaton-portrait-upload':{acceptPortraitImage:async()=>({name:'小光',id:1})},
    '../game/automaton-dialogue':{escapeAutomatonText:(s:string)=>s}
  }).default;
  await assert.rejects(middleware({},async()=>{nextCalls++;throw Error('downstream');}),/downstream/);assert.equal(nextCalls,1);
  pending={id:1};await middleware({},async()=>{nextCalls++;});assert.equal(sends.length,1);assert(JSON.stringify(sends[0].format.value).includes('已提交人工审核'));assert.equal(nextCalls,1);
  sendFails=true;await middleware({},async()=>{});assert.equal(sends.length,2);
});

test('后台审核页面脚本可解析，预览需要登录且审核写接口启用 CSRF',async()=>{
  const page=load('src/admin-web/page.ts',{}).adminPage({username:'admin',role:'admin'},'nonce');
  assert(page.includes('机巧形象审核'));assert(page.includes('通过并发布'));assert(page.includes('上一页'));assert(page.includes('下一页'));
  new Function(page.match(/<script nonce="nonce">([\s\S]*)<\/script>/)[1]);
  const routes=new Map<string,any>();let loggedIn=false,previewCalls=0,writes=0;
  const router=load('src/admin-web/router.ts',{
    'node:crypto':{randomBytes:()=>({toString:()=> 'nonce'})},'node:fs':{createReadStream:()=>{}},
    '../config/admin-web':{getAdminWebConfig:()=>({enabled:true,publicBaseUrl:null,trustedProxyIps:[]})},
    '../assets/game/story/pear-admin-cover.png':'/cover.png','./page':{adminCoverPath:'/cover',adminPage:()=>'',loginPage:()=>''},
    '../game/admin-web.service':{sessionForAdminWeb:async(_token:string,csrf:string|null)=>{if(csrf!==null&&csrf!==undefined)writes++;return loggedIn?{username:'admin',role:'admin'}:null;}},
    '../game/admin-web-data.service':{},'../game/monitor.service':{},
    '../game/automaton-portrait-admin.service':{adminPortraitPreview:async()=>{previewCalls++;return Buffer.from('private');},decidePortraitReview:async()=>({status:'rejected'})}
  });
  const register:any={};for(const method of ['get','post','delete','patch'])register[method]=(path:string,fn:any)=>routes.set(method+' '+path,fn);
  router.registerAdminWebRoutes(register);
  const ctx:any={req:{socket:{remoteAddress:'127.0.0.1'},async *[Symbol.asyncIterator](){}},cookies:{get:()=> 'cookie'},get:(name:string)=>name==='host'?'localhost:17118':name==='x-ff-csrf'?'csrf':'',set:()=>{},params:{id:'1'}};
  await routes.get('get /api/admin/portraits/:id/image')(ctx);assert.equal(ctx.status,401);assert.equal(previewCalls,0);
  loggedIn=true;await routes.get('get /api/admin/portraits/:id/image')(ctx);assert.equal(previewCalls,1);assert.equal(ctx.type,'image/webp');
  await routes.get('post /api/admin/portraits/:id/review')(ctx);assert.equal(writes,1);
});
