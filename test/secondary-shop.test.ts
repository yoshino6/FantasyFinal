import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Format } from '../node_modules/alemonjs/lib/application/format/message-format.js';
import { currentSecondaryShop,withSecondaryShop,shopProfessions,shopProgressFor,shopProficiency,type ServiceShop } from '../src/game/secondary-shop-context';
import { secondaryShopFormatSource } from '../src/game/secondary-shop-format';
import { secondaryShopCommands } from '../src/game/secondary-shop-commands';
const context=(shop:ServiceShop,personalProfession:string|null=null)=>({shop,personalProfession,characterId:1,user:'test'});

test('店铺等级固定为3，不写入玩家进度；离店、错职业和错玩家拒绝服务',async()=>{
  for(const [shop,profession] of Object.entries(shopProfessions))await withSecondaryShop(context(shop as ServiceShop),async()=>{
    let calls=0;const db={execute:async(sql:string)=>{calls++;assert.match(sql,/SELECT.*map_npcs/);return [[{id:1}]];}} as any;
    assert.deepEqual(await shopProgressFor(db,1,profession),{level:3,proficiency:0,required:2000,bonus:10});
    assert.equal(shopProficiency(300),0);assert.equal(calls,1);
    await assert.rejects(shopProgressFor(db,2,profession),/不匹配/);
    await assert.rejects(shopProgressFor(db,1,'wrong'),/不匹配/);
    await assert.rejects(shopProgressFor({execute:async()=>[[]]} as any,1,profession),/离开店铺/);
  });
  assert.equal(shopProficiency(30),30);assert.equal(await shopProgressFor({} as any,1,'blacksmith'),null);
});

test('并行请求的店铺来源互相隔离，个人指令不继承店铺等级',async()=>{
  await Promise.all(Object.keys(shopProfessions).map(shop=>withSecondaryShop(context(shop as ServiceShop),async()=>{
    await new Promise(resolve=>setTimeout(resolve,10));assert.equal(currentSecondaryShop()?.shop,shop);
  })));
  assert.equal(currentSecondaryShop(),undefined);
});

test('店铺翻页、搜索与确认保留来源，非炼金师不显示手记，个人面板保持原样',()=>{
  const source=Format.create().addMarkdown(Format.createMarkdown().addTitle('副职业·炼金师').addButton('[查看手记]',{data:'/炼金手记',autoEnter:false}))
    .addButtonGroup(Format.createButtonGroup().addRow().addButton('搜索','/炼金材料搜索 main ',{type:'command',autoEnter:false,style:'blue'}).addButton('确认','/确认炼金 token',{type:'command',autoEnter:true})
      .addRow().addButton('返回副职业','/副职业',{type:'command',autoEnter:true}).addButton('背包','/背包',{type:'command',autoEnter:true})).value;
  const original=JSON.stringify(source);
  assert.equal(secondaryShopFormatSource(source),source);
  withSecondaryShop(context('alchemy_sweetshop'),()=>{
    const result=JSON.stringify(secondaryShopFormatSource(source));
    assert(result.includes('/店铺炼金材料搜索 main '));assert(result.includes('/店铺确认炼金 token'));assert(result.includes('/店铺副职业 alchemy_sweetshop'));assert(result.includes('/背包'));assert(!result.includes('查看手记'));assert(result.includes('返回店铺'));assert(result.includes('不增加熟练度'));
  });
  withSecondaryShop(context('alchemy_sweetshop','alchemist'),()=>assert(JSON.stringify(secondaryShopFormatSource(source)).includes('/店铺炼金手记')));
  assert.equal(JSON.stringify(source),original);
});

test('所有店铺延续指令均注册，包括紧凑格式的提纯确认和维修包',()=>{
  const routes=readFileSync('src/secondary-shop-routes.ts','utf8');
  for(const list of Object.values(secondaryShopCommands))for(const command of list)assert(routes.includes(`'店铺${command}'`),command);
  for(const command of ['维修包','开始提纯','确认一键提纯'])assert(routes.includes(`'店铺${command}'`));
  assert(!routes.includes("path:'店铺炼金 点灵'"));
});
