import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import {Format} from '../node_modules/alemonjs/lib/application/format/message-format.js';
import {itemUsePolicy,combatItemEffect} from '../src/game/item-use-policy';
import {alchemyOutputDefinitions} from '../src/game/alchemy-catalog';

const load=(path:string,names:string[],dependencies:Record<string,unknown>)=>{
  const file=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true);
  const statements=file.statements.filter(ts.isVariableStatement).filter(node=>node.declarationList.declarations.some(d=>names.includes(d.name.getText(file))));assert.equal(statements.length,names.length);
  const code=ts.transpileModule(statements.map(node=>node.getText(file).replace(/^export\s+/,'')).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  return new Function(...Object.keys(dependencies),`${code};return {${names.join(',')}}`)(...Object.values(dependencies));
};
const{appendItemUse}=load('src/response/item-use.ts',['appendItemUse'],{itemUsePolicy,randomUUID});
const{createMarkdownText}=load('node_modules/@alemonjs/qq-bot/lib/sends.js',['mdFormatters','createMarkdownText'],{});
const qqText=(format:ReturnType<typeof Format.create>)=>createMarkdownText(format.value.find(item=>item.type==='Markdown')!.value);
test('全部炼金定义有明确使用位置；洗练不进战斗、秘药不进PVP',()=>{
  for(const output of alchemyOutputDefinitions){const policy=itemUsePolicy({id:1,code:output.code});assert.notEqual(policy.kind,'unsupported',output.code);}
  assert.equal(combatItemEffect({skillReset:true}),false);assert.equal(combatItemEffect({foodBuff:'food'}),false);assert.equal(combatItemEffect({partyDropBonusPct:25},true),false);assert.equal(combatItemEffect({heal:100},true),true);
});
test('使用按钮走正确流程：回复药直接用，洗练先预览，改名待输入，战斗物不假装可战外用',()=>{
  const items=[{id:1,code:'potion',effect_json:{heal:100}},{id:2,code:'alchemy_skill_reset_elixir'},{id:3,code:'rename_card',effect_json:{characterChange:'name'}},{id:4,code:'bomb',effect_json:{throwable:{damageScale:2},target:'enemy'}}];
  const md=Format.createMarkdown();items.forEach(item=>appendItemUse(md,item));const rendered=JSON.stringify(md.value);
  for(const text of ['[使用]','/使用道具 1','/归悟洗练','/角色改名 ','战斗中使用'])assert.ok(rendered.includes(text),text);assert.ok(!rendered.includes('/使用道具 4'));
  const qq=qqText(Format.create().addMarkdown(md));
  assert.equal((qq.match(/<qqbot-cmd-input /g)??[]).length,3);
  assert.ok(!qq.includes('<qqbot-cmd-enter'));
  assert.ok(qq.includes('show="[使用]"'));
});
test('背包最近获得与分类列表都显示使用入口，并保留秘药/符咒/投掷物筛选',async()=>{
  const item={id:7,code:'minor_luck_elixir',codex_id:'123',name:'幸运秘药',item_type:'consumable',item_category:'秘药',quantity:2,effect_json:{partyDropBonusPct:25,battleCount:10}};
  const result=load('src/response/inventory.ts',['categories','subcategories','matchesSubcategory','appendSubcategoryLinks','pageButtons','inventoryFormat'],{Format,appendItemUse,inventoryView:async()=>({recent:[item],stacked:[item],instances:[]}),currentMainQuest:async()=>({title:''})});
  for(const category of [undefined,'道具']){
    const qq=qqText(await result.inventoryFormat('user',category));
    assert.ok(qq.includes('<qqbot-cmd-input text="/使用道具 7 '));
    assert.ok(!qq.includes('<qqbot-cmd-enter'));
  }
  const panel=JSON.stringify((await result.inventoryFormat('user','道具')).value);for(const category of ['秘药','投掷物','符咒','技能书'])assert.ok(panel.includes(category));
});
test('成品货架详情和购买使用 QQ 输入链接，避免 cmd-enter 不支持 show 的发送错误',async()=>{
  const{secondaryShopFormat}=load('src/response/secondary-shop.ts',['secondaryShopFormat'],{Format,secondaryFinishedCatalog:async()=>({name:'糖水屋',shop:'alchemy_sweetshop',basicLevel:3,categories:['全部','回复','投掷物'],category:'回复',page:1,pages:2,keyword:'药',items:[{name:'回血药剂',price:100,stock:5,id:10089,codex:2110089}]})});
  const qq=qqText(await secondaryShopFormat('user','alchemy_sweetshop'));
  assert.ok(qq.includes('<qqbot-cmd-input text="/职业成品详情 alchemy_sweetshop 2110089" show="[详情]" />'));
  assert.ok(qq.includes('<qqbot-cmd-input text="/职业成品分类 alchemy_sweetshop 投掷物 1 药" show="[投掷物]" />'));
  const buttons=JSON.stringify((await secondaryShopFormat('user','alchemy_sweetshop')).value);
  assert.ok(buttons.includes('/职业成品分类 alchemy_sweetshop 回复 2 药'));
  assert.ok(buttons.includes('/职业成品分类 alchemy_sweetshop 回复 1 '));
  assert.ok(qq.includes('<qqbot-cmd-input text="/购买职业成品 alchemy_sweetshop 10089 " show="[购买]" />'));
  assert.ok(!qq.includes('<qqbot-cmd-enter'));
});
test('炼金手记详情和再次投料使用 QQ 输入链接',async()=>{
  const{alchemyJournalHandler}=load('src/response/alchemy-v2.ts',['alchemyJournalHandler'],{Format,alchemyRuleVersion:2,respond:(work:any)=>work('user',{param:()=>undefined}),alchemyJournalPage:async()=>({scope:'全部记录',field:'全部',keyword:'',count:1,page:1,pages:1,anchor:1,entries:[{id:1,time:new Date(),snapshot:{kind:'alchemy',version:2,ingredients:[]},batches:[],result:{}}]})});
  const qq=qqText(await alchemyJournalHandler());
  assert.ok(qq.includes('<qqbot-cmd-input text="/炼金手记详情 1" show="[查看详情]" />'));
  assert.ok(qq.includes('<qqbot-cmd-input text="/炼金手记投料 1" show="[再次投料]" />'));
  assert.ok(!qq.includes('<qqbot-cmd-enter'));
});
test('三家副职业商店进店保留买卖、闲聊、转职和离开，移除加工按钮',async()=>{
  const dependencies={Format,nearbyPoints:async()=>({npcDetailsUnlocked:true}),barrierActive:async()=>true,shopCode:'alchemy_sweetshop',workshopCode:'oddworkshop',dungeonSecretProgress:async()=>({stage:2}),currentMainQuest:async()=>({title:'',description:''})};
  const smith=load('src/response/blacksmith.ts',['blacksmithButtons','blacksmithFormat'],dependencies);
  const alchemy=load('src/response/alchemist.ts',['alchemistShopFormat'],dependencies);
  const workshop=load('src/response/deconstructor.ts',['oddWorkshopFormat'],dependencies);
  for(const[format,commands]of [
    [await smith.blacksmithFormat('user'),['/铁匠铺购买','/铁匠铺出售','/铁匠铺闲聊','/关于锻造师','/建筑离开 blacksmith']],
    [await alchemy.alchemistShopFormat('user'),['/炼金商店购买','/炼金商店出售','/晴儿闲聊','/关于炼金师','/建筑离开 alchemy_sweetshop','/晴儿 关于无形的禁锢']],
    [await workshop.oddWorkshopFormat('user'),['/异工坊购买','/异工坊出售','/唯薇安闲聊','/关于解构师','/建筑离开 oddworkshop','/异工坊 地下的秘密']]
  ]as const){
    const rendered=JSON.stringify(format.value);
    for(const text of ['我要买','我要卖','闲聊',...commands])assert.ok(rendered.includes(text),text);
    for(const command of ['/副职业打造装备','/打造装备','/精炼','/熔铸','/炼金"','/提纯','/构造','/解构'])assert.ok(!rendered.includes(command),command);
    assert.ok(!qqText(format).includes('<qqbot-cmd-enter'));
  }
});
