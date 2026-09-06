import type { AutomatonVector as Vec } from './automaton-growth';
export type AutomatonFeed = {code:string;name:string;vector:Vec;main:Record<string,number>;aux:Record<string,number>};
export const automatonFeeds: AutomatonFeed[] = [
  {code:'balanced',name:'通用育成原液',vector:[1,0,0,0,0],main:{blood_residue:15},aux:{energy_ember:10}},
  {code:'blade',name:'锋刃原液',vector:[.1,.8,0,0,.1],main:{metal_element_dust:10},aux:{fire_element_dust:6,energy_ember:1}},
  {code:'breaker',name:'破阵原液',vector:[.1,.7,0,.2,0],main:{metal_element_dust:8,blood_residue:3},aux:{thunder_element_dust:6,energy_ember:1}},
  {code:'arcane',name:'灵辉原液',vector:[.1,0,.8,0,.1],main:{water_element_dust:10},aux:{light_element_dust:4}},
  {code:'flare',name:'爆燃原液',vector:[.1,.2,.7,0,0],main:{fire_element_dust:10},aux:{energy_ember:10}},
  {code:'shell',name:'坚壳原液',vector:[.1,0,0,.9,0],main:{metal_element_dust:10},aux:{ice_element_dust:6,energy_ember:1}},
  {code:'supple',name:'柔韧原液',vector:[.1,0,0,.6,.3],main:{wood_element_dust:10},aux:{water_element_dust:6,blood_residue:1}},
  {code:'repair',name:'修护原液',vector:[.3,0,.2,.5,0],main:{blood_residue:15},aux:{wood_element_dust:6,energy_ember:1}},
  {code:'mana',name:'回灵原液',vector:[.4,0,.6,0,0],main:{water_element_dust:10},aux:{energy_ember:10}},
  {code:'swift',name:'迅捷原液',vector:[.1,.1,0,0,.8],main:{thunder_element_dust:10},aux:{dark_element_dust:5}},
  {code:'falcon',name:'猎隼原液',vector:[.1,.4,0,0,.5],main:{thunder_element_dust:6,blood_residue:6},aux:{metal_element_dust:6,energy_ember:1}},
  {code:'sentinel',name:'守望原液',vector:[.2,0,.3,.5,0],main:{wood_element_dust:10},aux:{light_element_dust:4}}
];
