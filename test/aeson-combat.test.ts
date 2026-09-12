import assert from 'node:assert/strict';
import test from 'node:test';
import { aesonNextSkill } from '../src/game/aeson-combat';

const state={hpRatio:1,inspired:true,willUsed:true,berserkUsed:true,combo:0,roll:0};
test('艾森开场激扬后按裂地、肠断、寸劲循环',()=>{
  assert.equal(aesonNextSkill({...state,inspired:false}).code,'aeson_inspire');
  const first=aesonNextSkill(state),second=aesonNextSkill({...state,combo:first.combo}),third=aesonNextSkill({...state,combo:second.combo}),repeat=aesonNextSkill({...state,combo:third.combo});
  assert.deepEqual([first.code,second.code,third.code,repeat.code],['aeson_earthbreak','aeson_softbreak','aeson_shortfist','aeson_earthbreak']);
});
test('六成与三成血分别只触发一次防御和狂暴，低血只使用毁灭',()=>{
  assert.equal(aesonNextSkill({...state,hpRatio:.6,willUsed:false,berserkUsed:false}).code,'aeson_ironwill');
  assert.equal(aesonNextSkill({...state,hpRatio:.3,willUsed:true,berserkUsed:false}).code,'aeson_berserk');
  assert.equal(aesonNextSkill({...state,hpRatio:.09,willUsed:false,berserkUsed:false}).code,'aeson_destruction');
  for(let roll=0;roll<1;roll+=.2)assert.equal(aesonNextSkill({...state,hpRatio:.09,roll}).code,'aeson_destruction');
});
test('中段随机池包含蛇缠与极意',()=>{
  const skills=[0,.2,.4,.6,.8].map(roll=>aesonNextSkill({...state,hpRatio:.5,roll}).code);
  assert.deepEqual(skills,['aeson_earthbreak','aeson_softbreak','aeson_shortfist','aeson_snakebind','aeson_ultimate']);
});
