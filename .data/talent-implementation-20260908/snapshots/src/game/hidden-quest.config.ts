/** 经复核V3的40环任务数据；独立于公共任务目录。 */
import type { HiddenProfessionCode } from './hidden-profession.config';
export type HiddenQuestDefinition = { profession: HiddenProfessionCode; stage: number; name: string; dialogue: string; objective: string; result: string; materials: { code: string; name: string; quantity: number }[] };
export const hiddenQuests: HiddenQuestDefinition[] = [
  {
    "profession": "magical_scholar",
    "stage": 1,
    "name": "四份对照药",
    "dialogue": "「先把恢复生命和恢复魔力分开量。量杯要是读错了，后面什么都比不准。」",
    "objective": "交付微愈液×2、澄蓝露×2，品质不限；晴儿分别按成品标注校准生命、魔力两套读数",
    "result": "获得成品基准记录；四份是两类各两份，不声称两种药效果相同。仪器校准后才能测未封装粒子",
    "materials": [
      {
        "code": "alchemy_base_life_draught",
        "name": "微愈液",
        "quantity": 2
      },
      {
        "code": "alchemy_base_mana_draught",
        "name": "澄蓝露",
        "quantity": 2
      }
    ]
  },
  {
    "profession": "magical_scholar",
    "stage": 2,
    "name": "残渣与余烬",
    "dialogue": "「这份残渣能补回多少？余烬又会把反应拖多久？两条曲线都得记。」",
    "objective": "交付血肉残渣×12、能量余烬×12；晴儿在固定教学底方中分别检测恢复增量与释放时长",
    "result": "分清残渣偏恢复、余烬偏延续；下一环需要用新的生命类材料验证“立即恢复”和“持续恢复”的区别",
    "materials": [
      {
        "code": "blood_residue",
        "name": "血肉残渣",
        "quantity": 12
      },
      {
        "code": "energy_ember",
        "name": "能量余烬",
        "quantity": 12
      }
    ]
  },
  {
    "profession": "magical_scholar",
    "stage": 3,
    "name": "水木两种生机",
    "dialogue": "「水把眼前的缺口补上，木让后面几次恢复接着来。总量和时间都别漏记。」",
    "objective": "交付水元素微尘×8、木元素微尘×8；晴儿在同一受损药偶上分别作水主、木主的固定案例",
    "result": "获得即时治疗与持续再生对照；不把木解释为通用缓释，不把水只解释为冷却，为下一环选择主材建立依据",
    "materials": [
      {
        "code": "water_element_dust",
        "name": "水元素微尘",
        "quantity": 8
      },
      {
        "code": "wood_element_dust",
        "name": "木元素微尘",
        "quantity": 8
      }
    ]
  },
  {
    "profession": "magical_scholar",
    "stage": 4,
    "name": "主材先定下来",
    "dialogue": "「材料可以相同，领头的那一份不同，反应的重心就会变。」",
    "objective": "使用前环留存样本，在工作台分别以水、木为主材完成“水1＋木1＋残渣1”两例；再用NPC演示核对同主材下调换辅材点击顺序的结果",
    "result": "记录主材影响权重、辅材顺序不另生成配方；下一环检查组合之外的成品能提供哪些时长与防护参照",
    "materials": []
  },
  {
    "profession": "magical_scholar",
    "stage": 5,
    "name": "成品里的分寸",
    "dialogue": "「药膏和滴剂告诉我们恢复能分几次，护体酊告诉我们受伤能少几分。别把这三件事记成同一种效果。」",
    "objective": "交付回春药膏×2、回流滴剂×2、护体酊×2；完成一次分类，把三组成品归入持续生命恢复、持续魔力恢复、百分比减伤",
    "result": "得到恢复时序与防护参照；不因此给粒子反应新增回蓝，也不把护体酊当生命盾。同方案在旧釜仍有额外偏差，转去检查器壁",
    "materials": [
      {
        "code": "alchemy_base_regrowth_salve",
        "name": "回春药膏",
        "quantity": 2
      },
      {
        "code": "alchemy_base_mana_flow",
        "name": "回流滴剂",
        "quantity": 2
      },
      {
        "code": "alchemy_base_ward_tonic",
        "name": "护体酊",
        "quantity": 2
      }
    ]
  },
  {
    "profession": "magical_scholar",
    "stage": 6,
    "name": "洗净上一锅",
    "dialogue": "「材料单没变，杯壁却还留着上一锅的痕迹。先把这层干扰排掉。」",
    "objective": "交付金元素微尘×10、魔力微弧×4；在晴儿提供的旧釜、洁净釜上各测一次同方案，标出残留差异",
    "result": "土相旧料用于试制隔离内衬，魔弧用于测试脉冲；得到清釜记录与中和通道草图。这里只排除额外器具干扰，不取消正式调配的失败概率",
    "materials": [
      {
        "code": "metal_element_dust",
        "name": "金元素微尘",
        "quantity": 10
      },
      {
        "code": "magic_unit",
        "name": "魔力微弧",
        "quantity": 4
      }
    ]
  },
  {
    "profession": "magical_scholar",
    "stage": 7,
    "name": "一阵风吹向谁",
    "dialogue": "「风会把反应带远。先看清它会碰到谁，再决定要不要加进去。」",
    "objective": "用NPC借用的“火1＋魔弧1”和“火1＋风1＋魔弧1”完成单靶、双靶投送对照；按预览分别指出成功敌方名单与失败己方名单",
    "result": "得到扩散目标记录，确认加风同时改变覆盖、浓度和事故人数；下一环再用同一配方比较三档结局",
    "materials": []
  },
  {
    "profession": "magical_scholar",
    "stage": 8,
    "name": "三种结局都记下",
    "dialogue": "「同一份调配，顺利、失手和超出预期时，记录都得留下。」",
    "objective": "工作台固定“火1＋风1＋魔弧1”，依次演示失败、成功、大成功；逐例确认受影响阵营、人数、伤害和异常是否打折",
    "result": "形成三档结果表：失败友伤减低但异常不额外打折，大成功另有强化；结局由教学脚本指定，不要求随机刷取，为装配控制部件提供验收依据",
    "materials": []
  },
  {
    "profession": "magical_scholar",
    "stage": 9,
    "name": "双路阀就位",
    "dialogue": "「临出手可以偏稳，也可以激发；真的失控了，还得留一条中和的路。」",
    "objective": "交付水元素微尘×8、金元素微尘×8、能量余烬×8；按第6、8环图纸完成一次装配验收，识别稳定催化、激发催化和中和各自作用",
    "result": "晴儿将土相内衬、水相中和通道、余烬测试负载装入试釜；确认阀门调整概率、中和处理事故，不额外增加投料量或保证成功，便携釜可进入综合演练",
    "materials": [
      {
        "code": "energy_ember",
        "name": "能量余烬",
        "quantity": 8
      },
      {
        "code": "water_element_dust",
        "name": "水元素微尘",
        "quantity": 8
      },
      {
        "code": "metal_element_dust",
        "name": "金元素微尘",
        "quantity": 8
      }
    ]
  },
  {
    "profession": "magical_scholar",
    "stage": 10,
    "name": "失手之后",
    "dialogue": "「失手那一下已经发生了。接下来，你准备先处理什么？」",
    "objective": "完成4轮个人演练：一次成功调配、一次固定失败、一次有效中和；清除本人及受波及药偶的指定事故异常，药偶最终存活",
    "result": "验收投料、辨认波及对象与事故善后；晴儿交付便携釜的传承资格，出现“二转 魔学者”按钮",
    "materials": []
  },
  {
    "profession": "weapon_master",
    "stage": 1,
    "name": "架上的颤音",
    "dialogue": "「借两把普通兵器作对照。我想听听，单独放和靠在一起有什么不同。」",
    "objective": "出示未装备普通品质武器2件，不同实例、需求等级≤15；小北在试架上分别检测单器与并置状态",
    "result": "保存两件实例的检测快照；发现一部分杂振单器也有，另一部分只在并置时出现，先排查器身与连接",
    "materials": []
  },
  {
    "profession": "weapon_master",
    "stage": 2,
    "name": "先做一副稳架",
    "dialogue": "「试架若也在晃，听到的就未必是兵器本身。」",
    "objective": "交付活纹木胚×10、陨铁锻锭×10；小北制作木托与金属校验片，用同一借用试剑复测",
    "result": "固定测试支撑，排除架体松动；杂振仍集中在柄身连接处，下一环准备连接试件",
    "materials": [
      {
        "code": "living_wood",
        "name": "活纹木胚",
        "quantity": 10
      },
      {
        "code": "meteor_iron",
        "name": "陨铁锻锭",
        "quantity": 10
      }
    ]
  },
  {
    "profession": "weapon_master",
    "stage": 3,
    "name": "柄身之间",
    "dialogue": "「力传到接缝就散了。支撑和束紧，都得在这里试。」",
    "objective": "交付兽骨（精）×4、兽筋（精）×4；小北用骨质撑片和筋束分别对照松紧状态",
    "result": "得到连接位置与束紧方案；下一环由玩家按图修补借用试剑，而非无依据地重铸整把武器",
    "materials": [
      {
        "code": "refined_beast_bone",
        "name": "兽骨（精）",
        "quantity": 4
      },
      {
        "code": "refined_beast_tendon",
        "name": "兽筋（精）",
        "quantity": 4
      }
    ]
  },
  {
    "profession": "weapon_master",
    "stage": 4,
    "name": "接稳这一处",
    "dialogue": "「按刚才量出的地方修，修完还在原架上听。」",
    "objective": "在任务台完成借用试剑的一次连接修补与前后振动比对",
    "result": "验证单器杂振降低；修补没有消除不同器具固有的差异，下一环开始辨认器型",
    "materials": []
  },
  {
    "profession": "weapon_master",
    "stage": 5,
    "name": "三器各有所长",
    "dialogue": "「长剑、匕首、法杖擅长的事不同。先认出各自能做什么，再谈合用。」",
    "objective": "出示长剑、匕首、法杖各1件，需求等级≤15、品质不限；将三份检测结果匹配到破甲、命中、法杖增伤与元素说明",
    "result": "建立三类器性记录，NPC补示其余三类器性的资料；这是认识器型，不要求正式战斗强行物魔混搭",
    "materials": []
  },
  {
    "profession": "weapon_master",
    "stage": 6,
    "name": "护阵从身上起",
    "dialogue": "「武器能离手，护阵的根还在你的防具上。先量清这份底子。」",
    "objective": "出示本人穿戴的上装、脚部各1件；工作台用其防护记录演示固定教学面板下双防变化对护阵盾量的影响，完成一次对应选择",
    "result": "明确穿戴双防参与护阵、背包武器不重复提供全身属性；确认操作者的防护后，才进行离手练习",
    "materials": []
  },
  {
    "profession": "weapon_master",
    "stage": 7,
    "name": "一器离手",
    "dialogue": "「先让一把出去，停在该停的位置，再沿原路收回。」",
    "objective": "交付金元素微尘×10、魔力微弧×4；用借用试剑完成一次“离手→定点→回收”操作",
    "result": "土相材料用于导引刻纹基底，魔弧用于驱动试验；得到单器收放轨迹，下一环在此基础上分配三器位置",
    "materials": [
      {
        "code": "metal_element_dust",
        "name": "金元素微尘",
        "quantity": 10
      },
      {
        "code": "magic_unit",
        "name": "魔力微弧",
        "quantity": 4
      }
    ]
  },
  {
    "profession": "weapon_master",
    "stage": 8,
    "name": "三器不争位",
    "dialogue": "「三把都往一个位置挤，只会互相挡路。把谁先出、谁后出排清楚。」",
    "objective": "用三把借用的同系不同器型武器，完成一次1/2/3器选择与出手顺序编排；在低防、高防固定靶预览中各选择一次适合的方案",
    "result": "得到器阵子集与次序记录；确认多器不是必然更强，并发现回收路线仍有交叉，下一环处理返程",
    "materials": []
  },
  {
    "profession": "weapon_master",
    "stage": 9,
    "name": "让出归鞘的路",
    "dialogue": "「出手时错开的路，回来时也要错开。照着标记收，别挤在持器人身前。」",
    "objective": "交付金元素微尘×6、木元素微尘×6；小北制作有缓冲层的回收刻纹，玩家按借用器具编号A→B→C完成一次无碰撞回收",
    "result": "完成试阵回收验收；顺序只适用于该教学装置，不规定正式战斗必须“短刃→长刃→导魔器”，随后进行攻守综合演练",
    "materials": [
      {
        "code": "wood_element_dust",
        "name": "木元素微尘",
        "quantity": 6
      },
      {
        "code": "metal_element_dust",
        "name": "金元素微尘",
        "quantity": 6
      }
    ]
  },
  {
    "profession": "weapon_master",
    "stage": 10,
    "name": "攻守各有其位",
    "dialogue": "「该护的时候先护，轮到合击再合击。让这座核心撑到最后。」",
    "objective": "4轮个人演练内，用借用三器完成有效御击、保护训练核心的护阵、一次合锋；核心存活",
    "result": "验收武器选用、护阵来源与器鸣消费；小北交出听器手札，出现“二转 御器师”按钮",
    "materials": []
  },
  {
    "profession": "inventor",
    "stage": 1,
    "name": "给拆件分清用途",
    "dialogue": "「我把故障机拆好了。先把骨架、供能和驱动材料分开，下一步才知道该接在哪里。」",
    "objective": "交付金元素微尘×12、能量余烬×12、魔力微弧×6；在NPC拆件图上完成一次用途匹配",
    "result": "土相旧料对应结构基底、余烬对应供能、魔弧对应驱动；得到回路用料记录。玩家任务是备料与辨认，不把交材料写成玩家完成解构",
    "materials": [
      {
        "code": "energy_ember",
        "name": "能量余烬",
        "quantity": 12
      },
      {
        "code": "metal_element_dust",
        "name": "金元素微尘",
        "quantity": 12
      },
      {
        "code": "magic_unit",
        "name": "魔力微弧",
        "quantity": 6
      }
    ]
  },
  {
    "profession": "inventor",
    "stage": 2,
    "name": "单独接通",
    "dialogue": "「先让传动和供能各自过关，别急着挂上所有设备。」",
    "objective": "交付魔力齿轮×2、能量中枢×2；唯薇安搭好测试回路，玩家分别完成一次空载与标准负载测试",
    "result": "单路稳定、共接后出现漏能，定位问题在连接段；下一环隔离异常通路",
    "materials": [
      {
        "code": "magic_gear",
        "name": "魔力齿轮",
        "quantity": 2
      },
      {
        "code": "energy_core",
        "name": "能量中枢",
        "quantity": 2
      }
    ]
  },
  {
    "profession": "inventor",
    "stage": 3,
    "name": "堵住漏能处",
    "dialogue": "「能量从接缝漏走了。把漏口封住，再看看启动峰值。」",
    "objective": "交付绝缘树脂×2、瞬容电容×2；在任务台标出漏能接点，完成一次隔离与峰值缓冲后的复测",
    "result": "树脂隔离漏口、电容缓冲启动峰值；供能稳定后仍有“未校准先启动”的记录，转去检查触发时序",
    "materials": [
      {
        "code": "insulating_resin",
        "name": "绝缘树脂",
        "quantity": 2
      },
      {
        "code": "flash_capacitor",
        "name": "瞬容电容",
        "quantity": 2
      }
    ]
  },
  {
    "profession": "inventor",
    "stage": 4,
    "name": "校准之后再启动",
    "dialogue": "「目标还没核准，执行端就收到启动脉冲了。把这两个信号的先后改过来。」",
    "objective": "交付校准模块×1、脉冲调节器×1；完成一次“目标确认→启动脉冲”接线校正",
    "result": "得到执行前校验记录；只有先确认合法目标，才允许驱动。下一环开始逐台验证设备的真实能力",
    "materials": [
      {
        "code": "calibration_module",
        "name": "校准模块",
        "quantity": 1
      },
      {
        "code": "pulse_regulator",
        "name": "脉冲调节器",
        "quantity": 1
      }
    ]
  },
  {
    "profession": "inventor",
    "stage": 5,
    "name": "躲开第一击",
    "dialogue": "「回避模组护的是佩戴者。先确认自己躲开了，再谈怎么护住别人。」",
    "objective": "出示紧急回避模组×1；用其借用副本启动一次紧急回避，并让操作者躲过指定物理试射",
    "result": "记录自身目标、30能量、一次物理闪避与CD3；不冒充自动避障、全队护盾或能为药偶代开回避，下一环测试输出设备",
    "materials": []
  },
  {
    "profession": "inventor",
    "stage": 6,
    "name": "开路的射界",
    "dialogue": "「散射会覆盖所有敌方目标。把友方药偶和障碍靶的身份先认清。」",
    "objective": "出示简易发射器×1；在封闭任务台确认敌方障碍靶和友方药偶后，启动一次散射发射，命中全部合法敌靶且不伤药偶",
    "result": "记录全敌范围、60能量及一次行动成本；不把散射改写为可任意排除某个合法敌人的单点射击，下一环补齐修复能力",
    "materials": []
  },
  {
    "profession": "inventor",
    "stage": 7,
    "name": "把修复送到伤处",
    "dialogue": "「伤处在这里，指令就送到这里。别让蜂群跟着上一次的敌方目标走。」",
    "objective": "出示织体修复蜂群×1；用借用副本选中受损友方药偶，完成一次缝补并清除其1个指定普通异常",
    "result": "记录友方目标、55能量、18%H恢复及净化1项；与前两环形成能力、目标、费用三份记录，可接入同一主脑",
    "materials": []
  },
  {
    "profession": "inventor",
    "stage": 8,
    "name": "接入同一主脑",
    "dialogue": "「我需要的是每次选对设备，不是把三个开关一起按下去。」",
    "objective": "交付魔力齿轮×1、绝缘树脂×2；用前环记录的三个借用模板完成接入配置，再用三个独立行动分别调用保护、输出、修复",
    "result": "齿轮与树脂用于接入座与线路隔离；得到通用能力映射，记录每次驱动沿用的目标与原生成本。下一环检验能量不足时的选择",
    "materials": [
      {
        "code": "magic_gear",
        "name": "魔力齿轮",
        "quantity": 1
      },
      {
        "code": "insulating_resin",
        "name": "绝缘树脂",
        "quantity": 2
      }
    ]
  },
  {
    "profession": "inventor",
    "stage": 9,
    "name": "把余电留给修复",
    "dialogue": "「发射器还能开火，蜂群却差一口能量。你得先决定这一次行动要救什么。」",
    "objective": "交付能量中枢×1、瞬容电容×1，由唯薇安装入转供计量台；在固定低能量案例中放弃开火，选择转供技能，把发射器40能量转出、蜂群收到30后立即修复药偶",
    "result": "中枢记录供受能量，电容承接转供脉冲；得到有损转供与同次驱动记录，不增加独立回能或额外修复行动。综合演练将再次需要这项取舍",
    "materials": [
      {
        "code": "energy_core",
        "name": "能量中枢",
        "quantity": 1
      },
      {
        "code": "flash_capacitor",
        "name": "瞬容电容",
        "quantity": 1
      }
    ]
  },
  {
    "profession": "inventor",
    "stage": 10,
    "name": "留足回程的能量",
    "dialogue": "「路上要开火，回程还得救人。把每一次启动都算进去。」",
    "objective": "完成5轮救援演练：操作者回避一次物理试射、发射器开路、蜂群修复、一次转供即修复；药偶最终存活",
    "result": "验收设备能力、行动次数和能源预算；唯薇安交付接线规范，出现“二转 发明家”按钮，不凭空增加“缺一台设备也必须完成”的目标",
    "materials": []
  },
  {
    "profession": "tactician",
    "stage": 1,
    "name": "先比对伤痕",
    "dialogue": "「旧护具上的痕迹我留着。借几份常见兽材作对照，先分清撕裂和撞击。」",
    "objective": "交付兽骨×4、兽皮×4、兽筋×4；在洛文提供的旧残件记录与新制对照片之间，完成一次伤痕类型匹配",
    "result": "只确认存在不同成伤方式，保留袭击者身份未知；新买兽材是对照耗材，不冒充护送现场证物。下一环补真实观察",
    "materials": [
      {
        "code": "beast_bone",
        "name": "兽骨",
        "quantity": 4
      },
      {
        "code": "beast_hide",
        "name": "兽皮",
        "quantity": 4
      },
      {
        "code": "beast_tendon",
        "name": "兽筋",
        "quantity": 4
      }
    ]
  },
  {
    "profession": "tactician",
    "stage": 2,
    "name": "亲眼核实",
    "dialogue": "「旧记录只能告诉你别人见过什么。这次，把你自己看见的记下来。」",
    "objective": "接受本环后，有效观察森林史莱姆、幽影狼王各1次；每份记录保存一个界面当时实际公开的属性、抗性或行为信息",
    "result": "得到两份带来源的观察记录；不要求击杀，不预设两者都有蓄势或防护，不据此认定它们参与过旧护送袭击",
    "materials": []
  },
  {
    "profession": "tactician",
    "stage": 3,
    "name": "迟到的防护",
    "dialogue": "「战报说‘及时护住了人’，可这张记录上，护体药是在第二次受击之后才用的。」",
    "objective": "交付微愈液×2、护体酊×2；比较洛文提供的原始时间线“预警→第二次受击→防护→治疗”与修正线，完成一次把防护移到受击前的重放",
    "result": "用8%减伤与8%H治疗的现有效果区别防护、治疗时点；确认防护不能追溯抵消已受伤害，下一环研究怎样让负责的人及时出手",
    "materials": [
      {
        "code": "alchemy_base_life_draught",
        "name": "微愈液",
        "quantity": 2
      },
      {
        "code": "alchemy_base_ward_tonic",
        "name": "护体酊",
        "quantity": 2
      }
    ]
  },
  {
    "profession": "tactician",
    "stage": 4,
    "name": "把谁调到前面",
    "dialogue": "「同样只能行动一次。这一轮缺保护，另一轮缺治疗，先手该给谁？」",
    "objective": "在两个公开沙盘中各选一次调度目标：完整队列里前移防护者或治疗者2位；核对下一轮最终队列",
    "result": "得到两份次序比较记录；不增加行动、不代队友选招。人能及时行动后，还要解决队伍攻击目标分散的问题",
    "materials": []
  },
  {
    "profession": "tactician",
    "stage": 5,
    "name": "指向同一个目标",
    "dialogue": "「三个人都打中了，那个施术者却一直没人管。给队伍一个清楚的集火点。」",
    "objective": "交付金元素微尘×6、木元素微尘×6，供洛文制作耐用棋面与生命刻度；在沙盘用落子标记施术靶，让两次模拟队友主动作兑现增伤",
    "result": "获得目标选择与落子兑现记录；这是集中伤害，不把落子说成打断技能。下一环把“危险”改写成可执行的情报",
    "materials": [
      {
        "code": "wood_element_dust",
        "name": "木元素微尘",
        "quantity": 6
      },
      {
        "code": "metal_element_dust",
        "name": "金元素微尘",
        "quantity": 6
      }
    ]
  },
  {
    "profession": "tactician",
    "stage": 6,
    "name": "说清事实与未知",
    "dialogue": "「亲眼看见的就标明来源，没看见的就留空。猜来的下一招，别写成已经发生。」",
    "objective": "复用第2环观察记录，在任务台完成两份报告：各选一条有来源的公开事实，并把记录未提供的“精确下一招/出手时点”标为未知",
    "result": "得到可转述情报与未知项清单；不再要求重复找两只怪，不强行把普通属性观察变成蓄势预告。缺失信息由下一环的条件响应处理",
    "materials": []
  },
  {
    "profession": "tactician",
    "stage": 7,
    "name": "为下一击留守势",
    "dialogue": "「还不知道它何时出手，可以先约好：这一击真的落下来，就替护送者挡住一部分。」",
    "objective": "交付能量余烬×6、魔力微弧×2，作为棋盘模拟攻击的负载与驱动；在公开固定案例中给护送药偶布置守势，验证敌方主动作直伤到来时触发",
    "result": "得到35%守势减伤与单次响应记录；预案监听实际直伤，不写成“看见蓄势就自动给盾”，下一环检验假预警下会不会提前耗掉",
    "materials": [
      {
        "code": "energy_ember",
        "name": "能量余烬",
        "quantity": 6
      },
      {
        "code": "magic_unit",
        "name": "魔力微弧",
        "quantity": 2
      }
    ]
  },
  {
    "profession": "tactician",
    "stage": 8,
    "name": "等到真正的一击",
    "dialogue": "「喊了一声要进攻，还没有伤到人。先保留守势，照常做你这一轮该做的事。」",
    "objective": "在假预警案例中保留已设守势并完成一次普通行动，核对它未触发；在有效时窗内迎来真实敌方直击，核对守势只响应一次",
    "result": "保存未触发、正确触发两项证据；同时讲解接应按预计HP、截断按公开可打断吟唱判断，假喊话不冒充可打断施法",
    "materials": []
  },
  {
    "profession": "tactician",
    "stage": 9,
    "name": "给同伴出手的机会",
    "dialogue": "「把治疗者移到前面，再把目标指清。同伴会自己决定怎么出手。」",
    "objective": "完成3项独立沙盘：调度让模拟治疗者先行动；接应在低血药偶扣血前生效；落子由模拟输出者兑现",
    "result": "三项分别沿用调度、预案、标记的正式时点；模拟同伴自动执行预设动作，玩家不接管选招，得到综合护送方案",
    "materials": []
  },
  {
    "profession": "tactician",
    "stage": 10,
    "name": "换一种开局",
    "dialogue": "「这一次，袭击先找上了另一边。看看眼前的队列，再用你刚才学会的办法。」",
    "objective": "5轮改编护送演练内，完成一次落子有效集火、一次下轮实际移位、一次针对公开袭击的有效预案响应，护送核心存活",
    "result": "验收从可见信息到战术执行的完整过程；洛文交付战术棋谱，出现“二转 执奕者”按钮，不要求5轮内另攒100筹策放收官",
    "materials": []
  }
];
export const hiddenQuest = (profession: string, stage: number) => hiddenQuests.find(q=>q.profession===profession&&q.stage===stage);

