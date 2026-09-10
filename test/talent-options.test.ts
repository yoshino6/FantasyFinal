import test from 'node:test';
import assert from 'node:assert/strict';
import {talentOptions} from '../src/game/talent-options.service';
import {emptyTalentData} from '../src/game/talent-data';
const actor={id:1,current_region_id:2,pos_x:3,pos_y:4,pos_z:0};
test('NPC与材料两步选择显示名字，分页只切列表，最终保留真实命令参数',async()=>{
  const c={execute:async(sql:string,args:any[])=>{
    if(sql.includes('FROM map_npcs')){assert.deepEqual(args,[2,3,4,0]);return [[{code:'blacksmith',name:'铁匠'}]];}
    if(sql.includes('FROM player_inventory'))return [Array.from({length:8},(_,i)=>({id:i+10,name:`矿石${i+1}`,item_category:'建材',quantity:3,personal_bound_quantity:0}))];
    throw Error(sql);
  }};
  const first=await talentOptions(c as any,actor,emptyTalentData(),'赠礼');assert.deepEqual(first.options,[{label:'铁匠',command:'选择 赠礼 blacksmith~1'}]);
  const second=await talentOptions(c as any,actor,emptyTalentData(),'赠礼','blacksmith~1');assert.equal(second.options.length,6);assert.equal(second.options[0]!.command,'赠礼 blacksmith 10');assert.equal(second.options[5]!.command,'选择 赠礼 blacksmith~2');
  const last=await talentOptions(c as any,actor,emptyTalentData(),'赠礼','blacksmith~2');assert.equal(last.options[0]!.command,'赠礼 blacksmith 15');assert.ok(last.options.every(o=>!o.label.includes('blacksmith')));
});
test('借位先选择中文增益，再选择当前队伍中的玩家',async()=>{
  const c={execute:async(sql:string)=>{assert.ok(sql.includes('party_members'));return [[{id:7,name:'旅伴'}]];}};
  const first=await talentOptions(c as any,actor,emptyTalentData(),'借位');assert.equal(first.options[0]!.label,'物攻强化');
  const second=await talentOptions(c as any,actor,emptyTalentData(),'借位','attack~1');assert.deepEqual(second.options,[{label:'旅伴',command:'设置 借位 attack:member:7'}]);
});

test('C04 旧旁通余额合并显示，只能投入当前副职业',async()=>{
  const c={execute:async(sql:string)=>{assert.ok(sql.includes('player_secondary_professions'));return [[{profession_code:'alchemist',level:1},{profession_code:'blacksmith',level:1}]];}};
  const data=emptyTalentData();data.counters['cross:alchemist']=7;data.counters['cross:blacksmith']=5;
  const current={...actor,secondary_profession_code:'alchemist'};
  const first=await talentOptions(c as any,current,data,'旁通');assert.equal(first.options.length,1);assert.match(first.options[0].label,/可用12点/);assert.equal(first.options[0].command,'选择 旁通 alchemist~1');
  const second=await talentOptions(c as any,current,data,'旁通','alchemist~1');assert.ok(second.options.some(o=>o.command==='旁通 alchemist 12'));
  assert.equal((await talentOptions(c as any,current,data,'旁通','blacksmith~1')).options.length,0);
});

test('D04 立约必须先展示真实材料、期限、奖励与违约代价，预览不写库',async()=>{
  const c={execute:async(sql:string,args:any[])=>{
    assert.ok(sql.startsWith('SELECT'));
    if(sql.includes('map_npcs'))return [[{code:'alchemy_sweetshop',name:'炼金师'}]];
    assert.deepEqual(args,['living_wood']);return [[{name:'活木'}]];
  }};
  const first=await talentOptions(c as any,actor,emptyTalentData(),'立约委托');assert.equal(first.options[0].command,'选择 立约委托 alchemy_sweetshop~1');
  const preview=await talentOptions(c as any,actor,emptyTalentData(),'立约委托','alchemy_sweetshop~1');
  for(const text of ['活木×3','2小时','好感+40','好感−5','尚未备齐'])assert.ok(preview.text.includes(text),text);
  assert.deepEqual(preview.options,[{label:'承接并立约',command:'立约委托 alchemy_sweetshop'}]);
});
