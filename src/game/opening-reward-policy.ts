import type { OpeningChoice, OpeningRewardKind, OpeningRoute } from './opening.types';

type RewardChange=Partial<Pick<OpeningChoice,'rewardName'|'rewardUse'|'rewardKind'|'bonusItem'|'rewardItems'|'rewardCopper'|'rewardEquipment'>>;
const normal=(rewardKind:OpeningRewardKind,rewardName:string,rewardUse:string,extra:Omit<RewardChange,'rewardKind'|'rewardName'|'rewardUse'>={}):RewardChange=>({rewardKind,rewardName,rewardUse,bonusItem:undefined,rewardItems:undefined,rewardCopper:undefined,rewardEquipment:undefined,...extra});

/**
 * 剧情线索只在每条路线最关键的一个分支保留为实体；其余分支发放现有物资，
 * 调查细节仍写入初行见闻，不再为每张纸片、石屑和绳结创建背包物品。
 */
const rewards:Record<string,RewardChange>={
  'M01-B':normal('路费','250铜币、根心','浮叶镇为校正接引名册支付路费，并赠予一枚现有木系素材。',{rewardCopper:250,rewardItems:[{code:'root_heart',quantity:1}]}),
  'M01-C':normal('工料','基础工料、根心','工舍提供普通木、石、金属各三份，并补上一枚根心。',{rewardItems:[{code:'root_heart',quantity:1}]}),
  'M02-A':normal('餐食','热汤与150铜币','艾蕾诺先请我吃一顿热食，再付清帮忙脱困的路费。'),
  'M02-B':normal('药袋','初行药袋','王都联络员提供三份草药、两份基础回魔药和150铜币。'),
  'M03-A':normal('药袋','法师应急药袋','奥文把没有拿去试验的草药和回魔药交给我。'),
  'M03-C':normal('路费','180铜币、随机Lv.1稀有武器','修好披风后，工坊从现有练习装备中交付一件随机稀有武器。',{rewardEquipment:'random_weapon'}),

  'R01-A':normal('路费','240铜币','河务亭按救援记录支付路费。',{rewardCopper:240}),
  'R01-B':normal('工料','基础工料','维修码头提供普通木、石、金属各三份和100铜币。'),
  'R01-C':normal('药袋','初行药袋','送达灯号簿后获得三份草药、两份基础回魔药和150铜币。'),
  'R02-A':normal('餐食','热汤与150铜币','驿站为救下信使鸟的人准备热食和路费。'),
  'R02-C':normal('药袋','初行药袋','驿站交付适合继续赶路的草药、回魔药与150铜币。'),
  'R03-A':normal('路费','240铜币','河务所按阻止行商误入断桥的记录支付路费。',{rewardCopper:240}),
  'R03-B':normal('工料','基础工料','校正警报后获得普通木、石、金属各三份和100铜币。'),

  'A01-A':normal('药袋','返还药袋','安全返还时补齐三份草药、两份基础回魔药和150铜币。'),
  'A01-C':normal('路费','300铜币','核验完成后支付重新出发所需的路费。',{rewardCopper:300}),
  'A02-A':normal('路费','260铜币','调查员按护送与报讯记录支付路费。',{rewardCopper:260}),
  'A02-C':normal('路费','180铜币、随机Lv.1稀有武器','弯刃被送去检修，公会另从现有库中交付一件随机稀有武器。',{rewardEquipment:'random_weapon'}),
  'A03-A':normal('工料','基础工料、陨铁锻锭','封住陨铁裂隙后获得基础工料与一枚现有稀有锻材。',{rewardItems:[{code:'meteor_iron',quantity:1}]}),
  'A03-C':normal('路费','300铜币','观测站按完整坐标支付中危地区报讯路费。',{rewardCopper:300}),

  'C01-A':normal('餐食','女王的热汤与150铜币','霜芙兑现热汤，并补上继续赶路的铜币。'),
  'C01-B':normal('药袋','初行药袋、霜晶','雪灯台提供药袋和一枚现有冰系素材。',{rewardItems:[{code:'frost_crystal',quantity:1}]}),
  'C02-A':normal('药袋','初行药袋、灵契饲料','暖房提供药品及三份可供今后随从使用的饲料。',{rewardItems:[{code:'opening_companion_feed',quantity:3},{code:'frost_crystal',quantity:1}]}),
  'C02-C':normal('路费','300铜币','格琳达退还多收的房费，并补作护送路费。',{rewardCopper:300}),
  'C03-A':normal('路费','300铜币','北境安置处按核对与护送记录支付路费。',{rewardCopper:300}),
  'C03-C':normal('药袋','护送药袋','卡洛为后续赶路准备草药、回魔药与150铜币。'),

  'T01-A':normal('工料','基础工料、辅助瞄准镜','修理院从现有异械库存中交付一件辅助瞄准镜；它会生成独立装备实例。',{rewardEquipment:'auxiliary_aiming_scope'}),
  'T01-B':normal('路费','260铜币','空港按排险记录支付路费。',{rewardCopper:260}),
  'T02-A':normal('路费','180铜币、随机Lv.1稀有防具','完成防御演练后获得一件现有随机稀有防具。',{rewardEquipment:'random_armor'}),
  'T02-B':normal('路费','300铜币','纪念站按撤离名录的核验结果支付路费。',{rewardCopper:300}),
  'T03-A':normal('路费','300铜币','滴算撤销误单，并支付一次实际可用的返程路费。',{rewardCopper:300}),
  'T03-C':normal('餐食','热食与150铜币','鲸背市场以热食和铜币答谢我保住那首歌。'),

  'E01-A':normal('路费','500铜币','七分钟任期结清后，议庭支付临时魔王的实际薪酬。',{rewardCopper:500}),
  'E01-C':normal('餐食','议庭餐食与150铜币','第三席见证结束后获得一顿热食与铜币。'),
  'E02-B':normal('路费','300铜币','赫棋以自己的名义支付同行报讯的路费。',{rewardCopper:300}),
  'E02-C':normal('药袋','初行药袋、月银锻锭','梅尔文交付安全药袋，并从旧棋匣中取出一枚现有月银锻锭。',{rewardItems:[{code:'moon_silver',quantity:1}]}),
  'E03-B':normal('工料','基础工料、炉心赤晶','余炉提供基础工料与一枚现有炉心赤晶。',{rewardItems:[{code:'fire_crystal',quantity:1}]}),
  'E03-C':normal('路费','300铜币','旧判决核验结束后支付调查路费。',{rewardCopper:300}),

  'S03-B':normal('路费','180铜币、潮壳','烬川支付路费，并留下石滩常见的潮壳素材。',{rewardItems:[{code:'tide_shell',quantity:1}]}),
  'S03-C':normal('药袋','初行药袋','猎魔艇备品中取出草药、回魔药和150铜币。'),
  'D03-A':normal('药袋','初行药袋','从根道脱险后获得继续赶路的药袋。'),
  'D03-B':normal('工料','基础工料','拆除绊索后获得普通木、石、金属各三份和100铜币。'),
  'D03-C':normal('餐食','热汤与150铜币','抵达百纳镇后先领取一顿热食和铜币。'),
  'H01-A':normal('路费','240铜币','修复升降轨后获得山道运输路费。',{rewardCopper:240}),
  'H01-B':normal('工料','基础工料、岩脊核心','旧接驳台提供基础工料与一枚现有岩脊核心。',{rewardItems:[{code:'ridge_core',quantity:1}]}),
  'H03-A':normal('路费','240铜币','旧商路机关恢复后取得实际路费。',{rewardCopper:240}),
  'H03-B':normal('工料','基础工料、岩脊核心','载重机关留下可用基础工料与一枚岩脊核心。',{rewardItems:[{code:'ridge_core',quantity:1}]}),
  'H03-C':normal('路费','180铜币、随机Lv.1稀有防具','解开石槽暗路后获得一件现有随机稀有防具。',{rewardEquipment:'random_armor'}),
  'I02-C':normal('药袋','初行药袋','公会收下伪造锁扣作为证据，交付实际药品与铜币。'),
  'I03-A':normal('工料','基础工料、炉心赤晶','停下蒸汽后取得基础工料与一枚炉心赤晶。',{rewardItems:[{code:'fire_crystal',quantity:1}]}),
  'I03-B':normal('餐食','热汤与150铜币','送达信件后先获得一顿热食和铜币。'),
  'W03-A':normal('工料','基础工料、雾沼心','遗迹根纹记录换取基础工料与一枚现有雾沼心。',{rewardItems:[{code:'marsh_heart',quantity:1}]}),
  'W03-B':normal('餐食','热汤与150铜币','离开黑水浅池后获得热食与铜币。'),
  'W03-C':normal('路费','260铜币','抄下残阵符号后获得湿地报讯路费。',{rewardCopper:260}),
  'B03-B':normal('工料','基础工料','查明魔镜伪造方式后获得普通木、石、金属各三份和100铜币。'),
  'Y01-B':normal('工料','基础工料','处理错误借还记录后获得普通木、石、金属各三份和100铜币。')
};

export const applyOpeningRewardPolicy=(route:OpeningRoute):OpeningRoute=>({...route,choices:route.choices.map(choice=>{
  const change=rewards[`${route.code}-${choice.code}`];
  return change?{...choice,...change}:choice;
})});
