const automatonSkills = [
    {
        "id": "N001",
        "name": "直轴突击",
        "kind": "A",
        "rarity": "C",
        "description": "单体 1.15P 物理",
        "cost": "3%/1",
        "domains": [
            "战锋"
        ]
    },
    {
        "id": "N002",
        "name": "交错斩",
        "kind": "A",
        "rarity": "C",
        "description": "单体两段各 0.65P 物理，各自判命中",
        "cost": "4%/2",
        "domains": [
            "战锋"
        ]
    },
    {
        "id": "N003",
        "name": "锥心刺",
        "kind": "A",
        "rarity": "C",
        "description": "单体 1.00P 物理，本次忽略物防 10%",
        "cost": "4%/2",
        "domains": [
            "战锋"
        ]
    },
    {
        "id": "N004",
        "name": "重锤击",
        "kind": "A",
        "rarity": "C",
        "description": "单体 1.25P 物理，自身速度 -10% 至下次行动",
        "cost": "4%/2",
        "domains": [
            "战锋"
        ]
    },
    {
        "id": "N005",
        "name": "破甲凿",
        "kind": "A",
        "rarity": "U",
        "description": "单体 1.10P 物理，目标物防 -12%，2 回合",
        "cost": "6%/3",
        "domains": [
            "战锋"
        ]
    },
    {
        "id": "N006",
        "name": "裂盾刃",
        "kind": "A",
        "rarity": "U",
        "description": "单体 1.20P 物理；本次最终伤害对护盾部分额外 +40%，不溢出放大 HP 伤害",
        "cost": "6%/3",
        "domains": [
            "战锋"
        ]
    },
    {
        "id": "N007",
        "name": "回旋扫击",
        "kind": "A",
        "rarity": "U",
        "description": "主目标及另外至多 2 目标，各 0.80P 物理",
        "cost": "8%/4",
        "domains": [
            "战锋"
        ]
    },
    {
        "id": "N008",
        "name": "处决校准",
        "kind": "A",
        "rarity": "U",
        "description": "单体 1.20P；目标 HP≤30% 时改为 1.65P，无即死",
        "cost": "7%/3",
        "domains": [
            "战锋"
        ]
    },
    {
        "id": "N009",
        "name": "贯星刺",
        "kind": "A",
        "rarity": "R",
        "description": "单体 1.80P，本次忽略物防 25%",
        "cost": "12%/5",
        "domains": [
            "战锋"
        ]
    },
    {
        "id": "N010",
        "name": "锋刃保养",
        "kind": "Psv",
        "rarity": "C",
        "description": "本场自身物攻 +8%",
        "cost": "0/常驻",
        "domains": [
            "战锋"
        ]
    },
    {
        "id": "N011",
        "name": "断续追击",
        "kind": "Psv",
        "rarity": "C",
        "description": "自己主动直击主目标后，20% 追加 0.25P 物理；每回合一次",
        "cost": "0/触发",
        "domains": [
            "战锋"
        ]
    },
    {
        "id": "N012",
        "name": "破势本能",
        "kind": "Psv",
        "rarity": "R",
        "description": "对带物防降低的主目标，自己的物理直接伤害 +18%",
        "cost": "0/常驻",
        "domains": [
            "战锋"
        ]
    },
    {
        "id": "N013",
        "name": "微光弹",
        "kind": "A",
        "rarity": "C",
        "description": "单体 1.15M 光伤",
        "cost": "3%/1",
        "domains": [
            "灵术"
        ]
    },
    {
        "id": "N014",
        "name": "炎星",
        "kind": "A",
        "rarity": "C",
        "description": "单体 1.15M 火伤",
        "cost": "3%/1",
        "domains": [
            "灵术"
        ]
    },
    {
        "id": "N015",
        "name": "冰针",
        "kind": "A",
        "rarity": "C",
        "description": "单体 1.00M 冰伤，速度 -8%，1 回合",
        "cost": "4%/2",
        "domains": [
            "灵术"
        ]
    },
    {
        "id": "N016",
        "name": "雷弧",
        "kind": "A",
        "rarity": "C",
        "description": "单体 1.00M 雷伤，本次实际命中率 +8 个百分点",
        "cost": "4%/2",
        "domains": [
            "灵术"
        ]
    },
    {
        "id": "N017",
        "name": "潮汐脉冲",
        "kind": "A",
        "rarity": "U",
        "description": "单体 1.20M 水伤，自身恢复最大 MP 2%",
        "cost": "6%/3",
        "domains": [
            "灵术"
        ]
    },
    {
        "id": "N018",
        "name": "岩尘爆",
        "kind": "A",
        "rarity": "U",
        "description": "主目标及另外至多 2 目标，各 0.80M 土伤",
        "cost": "8%/4",
        "domains": [
            "灵术"
        ]
    },
    {
        "id": "N019",
        "name": "木灵穿刺",
        "kind": "A",
        "rarity": "U",
        "description": "单体 1.20M 木伤，目标治疗受到量 -20%，2 回合",
        "cost": "6%/3",
        "domains": [
            "灵术"
        ]
    },
    {
        "id": "N020",
        "name": "暗幕蚀击",
        "kind": "A",
        "rarity": "U",
        "description": "单体 1.20M 暗伤，目标魔防 -12%，2 回合",
        "cost": "6%/3",
        "domains": [
            "灵术"
        ]
    },
    {
        "id": "N021",
        "name": "九曜折光",
        "kind": "A",
        "rarity": "R",
        "description": "从九元素中选择主目标当前抗性最低者，单体 1.70M；平局按固定元素顺序",
        "cost": "12%/5",
        "domains": [
            "灵术"
        ]
    },
    {
        "id": "N022",
        "name": "灵路畅通",
        "kind": "Psv",
        "rarity": "C",
        "description": "自身魔攻 +8%",
        "cost": "0/常驻",
        "domains": [
            "灵术"
        ]
    },
    {
        "id": "N023",
        "name": "节能咏式",
        "kind": "Psv",
        "rarity": "C",
        "description": "普通法术 MP 成本 -10%，每次最低仍为 1",
        "cost": "0/常驻",
        "domains": [
            "灵术"
        ]
    },
    {
        "id": "N024",
        "name": "元素记忆",
        "kind": "Psv",
        "rarity": "R",
        "description": "连续自己两次主动使用同元素攻击后，下次该元素直接伤害 +20%；触发后计数清零",
        "cost": "0/触发",
        "domains": [
            "灵术"
        ]
    },
    {
        "id": "N025",
        "name": "固甲",
        "kind": "A",
        "rarity": "C",
        "description": "自己物防 +15%，2 回合",
        "cost": "3%/2",
        "domains": [
            "守御"
        ]
    },
    {
        "id": "N026",
        "name": "护灵",
        "kind": "A",
        "rarity": "C",
        "description": "自己魔防 +15%，2 回合",
        "cost": "3%/2",
        "domains": [
            "守御"
        ]
    },
    {
        "id": "N027",
        "name": "守护投影",
        "kind": "A",
        "rarity": "C",
        "description": "给自己或主人 0.60D 护盾，2 回合",
        "cost": "5%/3",
        "domains": [
            "守御"
        ]
    },
    {
        "id": "N028",
        "name": "稳定姿态",
        "kind": "A",
        "rarity": "C",
        "description": "自己韧性 +20%、速度 -10%，2 回合",
        "cost": "3%/2",
        "domains": [
            "守御"
        ]
    },
    {
        "id": "N029",
        "name": "折叠壁垒",
        "kind": "A",
        "rarity": "U",
        "description": "自己减伤 20%，2 回合",
        "cost": "7%/4",
        "domains": [
            "守御"
        ]
    },
    {
        "id": "N030",
        "name": "警戒鸣响",
        "kind": "A",
        "rarity": "U",
        "description": "对主目标造成 0.60P，并产生等同本次实际伤害 3 倍的总伤害仇恨；不强制 Boss 换目标",
        "cost": "5%/3",
        "domains": [
            "守御"
        ]
    },
    {
        "id": "N031",
        "name": "镜面镀层",
        "kind": "A",
        "rarity": "U",
        "description": "自己获得 0.80D 护盾；存在时魔法承伤 -10%，2 回合",
        "cost": "7%/4",
        "domains": [
            "守御"
        ]
    },
    {
        "id": "N032",
        "name": "缓冲展开",
        "kind": "A",
        "rarity": "U",
        "description": "自己或主人下次直接伤害 -25%，至多等于人偶 H 的 15%，2 回合有效",
        "cost": "7%/4",
        "domains": [
            "守御"
        ]
    },
    {
        "id": "N033",
        "name": "不动构架",
        "kind": "A",
        "rarity": "R",
        "description": "自己双防 +30%、减伤 15%、速度 -20%，2 回合",
        "cost": "12%/5",
        "domains": [
            "守御"
        ]
    },
    {
        "id": "N034",
        "name": "双层骨架",
        "kind": "Psv",
        "rarity": "C",
        "description": "自身双防 +8%",
        "cost": "0/常驻",
        "domains": [
            "守御"
        ]
    },
    {
        "id": "N035",
        "name": "受击归整",
        "kind": "Psv",
        "rarity": "C",
        "description": "每回合首次受实际 HP 伤害后，恢复自己 0.20D 生命",
        "cost": "0/触发",
        "domains": [
            "守御"
        ]
    },
    {
        "id": "N036",
        "name": "濒危护板",
        "kind": "Psv",
        "rarity": "R",
        "description": "本场首次降至 30% HP 以下且仍存活时，获得 1.20D 护盾，2 回合",
        "cost": "0/每场一次",
        "domains": [
            "守御"
        ]
    },
    {
        "id": "N037",
        "name": "缝合微光",
        "kind": "A",
        "rarity": "C",
        "description": "治疗自己或主人 1.00M",
        "cost": "6%/3",
        "domains": [
            "支援"
        ]
    },
    {
        "id": "N038",
        "name": "温润回路",
        "kind": "A",
        "rarity": "C",
        "description": "自己或主人每回合恢复 0.30M，2 回合",
        "cost": "5%/3",
        "domains": [
            "支援"
        ]
    },
    {
        "id": "N039",
        "name": "净尘",
        "kind": "A",
        "rarity": "C",
        "description": "移除自己或主人 1 个普通可净化减益",
        "cost": "5%/3",
        "domains": [
            "支援"
        ]
    },
    {
        "id": "N040",
        "name": "慰灵微幕",
        "kind": "A",
        "rarity": "C",
        "description": "自己或主人获得 0.55M 护盾，2 回合",
        "cost": "4%/3",
        "domains": [
            "支援"
        ]
    },
    {
        "id": "N041",
        "name": "回响治疗",
        "kind": "A",
        "rarity": "U",
        "description": "同时治疗自己与主人，各 0.75M",
        "cost": "9%/4",
        "domains": [
            "支援"
        ]
    },
    {
        "id": "N042",
        "name": "蓄灵交付",
        "kind": "A",
        "rarity": "U",
        "description": "恢复主人魔力，原始量为人偶最大 MP 的 5%；不从主人最大 MP 计算",
        "cost": "10%/4",
        "domains": [
            "支援"
        ]
    },
    {
        "id": "N043",
        "name": "延续之光",
        "kind": "A",
        "rarity": "U",
        "description": "将自己给自己或主人施加的一项普通持续治疗延长 1 回合；同一次施加最多被延长一次",
        "cost": "5%/4",
        "domains": [
            "支援"
        ]
    },
    {
        "id": "N044",
        "name": "纯净脉流",
        "kind": "A",
        "rarity": "U",
        "description": "净化自己或主人 1 项普通减益，再治疗 0.60M",
        "cost": "8%/4",
        "domains": [
            "支援"
        ]
    },
    {
        "id": "N045",
        "name": "急救重织",
        "kind": "A",
        "rarity": "R",
        "description": "治疗自己或主人 1.80M；目标 HP≤30% 时额外 +25%，不复活",
        "cost": "14%/5",
        "domains": [
            "支援"
        ]
    },
    {
        "id": "N046",
        "name": "修护专注",
        "kind": "Psv",
        "rarity": "C",
        "description": "自己技能的有效治疗量 +10%，不影响回复 MP",
        "cost": "0/常驻",
        "domains": [
            "支援"
        ]
    },
    {
        "id": "N047",
        "name": "余光留存",
        "kind": "Psv",
        "rarity": "C",
        "description": "主动治疗溢出量的 20% 转为同目标盾，最高 0.25M，1 回合；每回合一次",
        "cost": "0/触发",
        "domains": [
            "支援"
        ]
    },
    {
        "id": "N048",
        "name": "相伴回声",
        "kind": "Psv",
        "rarity": "R",
        "description": "本场首次主人 HP 降至 30% 以下仍存活时，自动治疗主人 1.20M",
        "cost": "0/每场一次",
        "domains": [
            "支援"
        ]
    },
    {
        "id": "N049",
        "name": "闪步刺",
        "kind": "A",
        "rarity": "C",
        "description": "单体 1.00P，自己闪避 +10%，1 回合",
        "cost": "4%/2",
        "domains": [
            "灵巧"
        ]
    },
    {
        "id": "N050",
        "name": "风切",
        "kind": "A",
        "rarity": "C",
        "description": "单体 1.00M 风伤，自己速度 +10%，1 回合",
        "cost": "4%/2",
        "domains": [
            "灵巧"
        ]
    },
    {
        "id": "N051",
        "name": "目镜校准",
        "kind": "A",
        "rarity": "C",
        "description": "自己命中 +15%，2 回合",
        "cost": "3%/2",
        "domains": [
            "灵巧"
        ]
    },
    {
        "id": "N052",
        "name": "轻轴运转",
        "kind": "A",
        "rarity": "C",
        "description": "自己速度 +15%，2 回合",
        "cost": "3%/2",
        "domains": [
            "灵巧"
        ]
    },
    {
        "id": "N053",
        "name": "残像踏步",
        "kind": "A",
        "rarity": "U",
        "description": "自己闪避 +25%，2 回合；不保证回避",
        "cost": "6%/3",
        "domains": [
            "灵巧"
        ]
    },
    {
        "id": "N054",
        "name": "定点穿行",
        "kind": "A",
        "rarity": "U",
        "description": "单体 1.20P，本次实际命中率 +15 个百分点",
        "cost": "6%/3",
        "domains": [
            "灵巧"
        ]
    },
    {
        "id": "N055",
        "name": "灵敏拆线",
        "kind": "A",
        "rarity": "U",
        "description": "清除自己 1 项可净化减速/束缚，再令速度 +10%，1 回合",
        "cost": "5%/3",
        "domains": [
            "灵巧"
        ]
    },
    {
        "id": "N056",
        "name": "瞬影连刃",
        "kind": "A",
        "rarity": "U",
        "description": "单体三段各 0.50P，各判命中；派生触发总计只一次",
        "cost": "8%/4",
        "domains": [
            "灵巧"
        ]
    },
    {
        "id": "N057",
        "name": "无隙一闪",
        "kind": "A",
        "rarity": "R",
        "description": "单体 1.65P，本次实际命中率 +25 个百分点；自己闪避 +15%，1 回合",
        "cost": "12%/5",
        "domains": [
            "灵巧"
        ]
    },
    {
        "id": "N058",
        "name": "轻量回路",
        "kind": "Psv",
        "rarity": "C",
        "description": "自己速度 +8%",
        "cost": "0/常驻",
        "domains": [
            "灵巧"
        ]
    },
    {
        "id": "N059",
        "name": "锁点目镜",
        "kind": "Psv",
        "rarity": "C",
        "description": "自己命中 +8%",
        "cost": "0/常驻",
        "domains": [
            "灵巧"
        ]
    },
    {
        "id": "N060",
        "name": "闪避蓄锋",
        "kind": "Psv",
        "rarity": "R",
        "description": "成功闪避后，下一次主动直接伤害 +20%，2 回合内有效；不叠层",
        "cost": "0/触发",
        "domains": [
            "灵巧"
        ]
    },
    {
        "id": "N061",
        "name": "霜缚线",
        "kind": "A",
        "rarity": "C",
        "description": "单体 0.75M 冰伤，目标速度 -15%，1 回合",
        "cost": "5%/3",
        "domains": [
            "干扰"
        ]
    },
    {
        "id": "N062",
        "name": "眩光片",
        "kind": "A",
        "rarity": "C",
        "description": "主目标命中 -15%，1 回合，基础概率 70%",
        "cost": "4%/3",
        "domains": [
            "干扰"
        ]
    },
    {
        "id": "N063",
        "name": "错步丝",
        "kind": "A",
        "rarity": "C",
        "description": "主目标闪避 -15%，1 回合，基础概率 70%",
        "cost": "4%/3",
        "domains": [
            "干扰"
        ]
    },
    {
        "id": "N064",
        "name": "软化喷雾",
        "kind": "A",
        "rarity": "C",
        "description": "主目标双防 -8%，2 回合，基础概率 70%",
        "cost": "5%/3",
        "domains": [
            "干扰"
        ]
    },
    {
        "id": "N065",
        "name": "扰动脉冲",
        "kind": "A",
        "rarity": "U",
        "description": "单体 0.70M 雷伤，命中后 40% 眩晕 1 回合",
        "cost": "8%/5",
        "domains": [
            "干扰"
        ]
    },
    {
        "id": "N066",
        "name": "静默针",
        "kind": "A",
        "rarity": "U",
        "description": "单体 0.70M 暗伤，命中后 40% 沉默 1 回合",
        "cost": "8%/5",
        "domains": [
            "干扰"
        ]
    },
    {
        "id": "N067",
        "name": "扼流夹",
        "kind": "A",
        "rarity": "U",
        "description": "主目标双攻 -12%，2 回合，基础概率 70%",
        "cost": "7%/4",
        "domains": [
            "干扰"
        ]
    },
    {
        "id": "N068",
        "name": "拆解光束",
        "kind": "A",
        "rarity": "U",
        "description": "单体 0.90M 光伤，移除目标 1 项可驱散普通增益",
        "cost": "8%/4",
        "domains": [
            "干扰"
        ]
    },
    {
        "id": "N069",
        "name": "冻结协议",
        "kind": "A",
        "rarity": "R",
        "description": "单体 1.00M 冰伤，命中后 60% 冻结 1 回合；冻结仅禁止行动，不叠加额外增伤",
        "cost": "12%/5",
        "domains": [
            "干扰"
        ]
    },
    {
        "id": "N070",
        "name": "干扰校准",
        "kind": "Psv",
        "rarity": "C",
        "description": "自己技能施加的双防降低数值 +10%；不延长持续时间，不提高控制概率，遵守全局减防上限",
        "cost": "0/常驻",
        "domains": [
            "干扰"
        ]
    },
    {
        "id": "N071",
        "name": "抗扰滤波",
        "kind": "Psv",
        "rarity": "C",
        "description": "自己韧性 +10%",
        "cost": "0/常驻",
        "domains": [
            "干扰"
        ]
    },
    {
        "id": "N072",
        "name": "状态解析",
        "kind": "Psv",
        "rarity": "R",
        "description": "对当前带普通减益的主目标，自己直接伤害 +15%；同类易伤不重复叠加",
        "cost": "0/常驻",
        "domains": [
            "干扰"
        ]
    },
    {
        "id": "N073",
        "name": "烬纹射线",
        "kind": "A",
        "rarity": "C",
        "description": "单体 0.90M 火伤，附加每回合 0.12M 火伤，2 回合",
        "cost": "5%/3",
        "domains": [
            "持续"
        ]
    },
    {
        "id": "N074",
        "name": "裂口刺",
        "kind": "A",
        "rarity": "C",
        "description": "单体 0.90P 物理，附加每回合 0.12P 无元素持续伤害，2 回合",
        "cost": "5%/3",
        "domains": [
            "持续"
        ]
    },
    {
        "id": "N075",
        "name": "自修小循环",
        "kind": "A",
        "rarity": "C",
        "description": "自己每回合恢复 0.20D，3 回合",
        "cost": "5%/4",
        "domains": [
            "持续"
        ]
    },
    {
        "id": "N076",
        "name": "集能静息",
        "kind": "A",
        "rarity": "C",
        "description": "放弃攻击，恢复自己最大 MP 8%；使用当回合不产生同步值",
        "cost": "0/4",
        "domains": [
            "持续"
        ]
    },
    {
        "id": "N077",
        "name": "蚀甲机液",
        "kind": "A",
        "rarity": "U",
        "description": "主目标每回合受到 0.20M 水伤且物防 -8%，2 回合",
        "cost": "7%/4",
        "domains": [
            "持续"
        ]
    },
    {
        "id": "N078",
        "name": "暗纹寄生",
        "kind": "A",
        "rarity": "U",
        "description": "单体 0.85M 暗伤，附加每回合 0.18M 暗伤，3 回合；无回蓝或吸血连锁",
        "cost": "8%/4",
        "domains": [
            "持续"
        ]
    },
    {
        "id": "N079",
        "name": "灼轨扩散",
        "kind": "A",
        "rarity": "U",
        "description": "主目标及另外至多 2 目标每回合受 0.16M 火伤，2 回合",
        "cost": "9%/4",
        "domains": [
            "持续"
        ]
    },
    {
        "id": "N080",
        "name": "回热循环",
        "kind": "A",
        "rarity": "U",
        "description": "治疗自己 0.60M，并恢复最大 MP 4%",
        "cost": "7%/4",
        "domains": [
            "持续"
        ]
    },
    {
        "id": "N081",
        "name": "慢燃星核",
        "kind": "A",
        "rarity": "R",
        "description": "主目标每回合受 0.30M 火伤，4 回合；可净化",
        "cost": "12%/6",
        "domains": [
            "持续"
        ]
    },
    {
        "id": "N082",
        "name": "平稳供能",
        "kind": "Psv",
        "rarity": "C",
        "description": "每第 3 次自己的回合开始恢复最大 MP 2%，含被控回合",
        "cost": "0/触发",
        "domains": [
            "持续"
        ]
    },
    {
        "id": "N083",
        "name": "余烬保温",
        "kind": "Psv",
        "rarity": "C",
        "description": "自己造成的持续伤害 +10%",
        "cost": "0/常驻",
        "domains": [
            "持续"
        ]
    },
    {
        "id": "N084",
        "name": "自愈编织",
        "kind": "Psv",
        "rarity": "R",
        "description": "自己 HP≤50% 时，每回合开始恢复 0.20D；不会从 0 HP 复活",
        "cost": "0/触发",
        "domains": [
            "持续"
        ]
    },
    {
        "id": "N085",
        "name": "攻势预热",
        "kind": "A",
        "rarity": "C",
        "description": "自己物攻 +12%，2 回合",
        "cost": "3%/2",
        "domains": [
            "应变"
        ]
    },
    {
        "id": "N086",
        "name": "灵能预热",
        "kind": "A",
        "rarity": "C",
        "description": "自己魔攻 +12%，2 回合",
        "cost": "3%/2",
        "domains": [
            "应变"
        ]
    },
    {
        "id": "N087",
        "name": "精密蓄势",
        "kind": "A",
        "rarity": "C",
        "description": "下次主动直接伤害 +20%，2 回合内有效，不叠层",
        "cost": "4%/3",
        "domains": [
            "应变"
        ]
    },
    {
        "id": "N088",
        "name": "撤压换气",
        "kind": "A",
        "rarity": "C",
        "description": "清除自己 1 项可净化命中/闪避降低效果；自己获得 0.30D 盾，1 回合",
        "cost": "4%/3",
        "domains": [
            "应变"
        ]
    },
    {
        "id": "N089",
        "name": "随势切换",
        "kind": "A",
        "rarity": "U",
        "description": "比较主目标当前双防，使用较低一侧进行 1.20P 物理或 1.20M 无元素法术；平局选物理",
        "cost": "7%/3",
        "domains": [
            "应变"
        ]
    },
    {
        "id": "N090",
        "name": "锁弱指令",
        "kind": "A",
        "rarity": "U",
        "description": "主目标受到本具人偶的直接伤害 +12%，2 回合；不提升其他单位伤害",
        "cost": "6%/4",
        "domains": [
            "应变"
        ]
    },
    {
        "id": "N091",
        "name": "限流重排",
        "kind": "A",
        "rarity": "U",
        "description": "将另一项已配置普通主动剩余 CD -1；优先剩余最长、平局按槽位；不能减本技能",
        "cost": "6%/5",
        "domains": [
            "应变"
        ]
    },
    {
        "id": "N092",
        "name": "双路应急",
        "kind": "A",
        "rarity": "U",
        "description": "自己 HP<50% 时治疗自己 0.90M，否则给主人 0.65D 盾，2 回合",
        "cost": "8%/4",
        "domains": [
            "应变"
        ]
    },
    {
        "id": "N093",
        "name": "弱点重演",
        "kind": "A",
        "rarity": "R",
        "description": "单体 1.50×max(P,M)，由较高攻击决定物理/无元素法术；目标有 2 项普通减益时最终直伤再 +20%",
        "cost": "12%/5",
        "domains": [
            "应变"
        ]
    },
    {
        "id": "N094",
        "name": "危机目镜",
        "kind": "Psv",
        "rarity": "C",
        "description": "自己 HP<40% 时命中对抗数值 +15%",
        "cost": "0/常驻",
        "domains": [
            "应变"
        ]
    },
    {
        "id": "N095",
        "name": "余量回收",
        "kind": "Psv",
        "rarity": "C",
        "description": "自己普通主动将主目标击败时，恢复最大 MP 3%；派生/持续伤害不触发",
        "cost": "0/每回合一次",
        "domains": [
            "应变"
        ]
    },
    {
        "id": "N096",
        "name": "自适应轴心",
        "kind": "Psv",
        "rarity": "R",
        "description": "本场首次受物理/魔法直伤后，对应防御 +15% 至战斗结束；只选择首次类型",
        "cost": "0/每场一次",
        "domains": [
            "应变"
        ]
    },
    {
        "id": "S001",
        "name": "战锋主机",
        "kind": "SP",
        "rarity": "E",
        "description": "本场物攻 +22%、魔攻 -12%",
        "cost": "0/常驻",
        "domains": [
            "战锋"
        ]
    },
    {
        "id": "S002",
        "name": "灵术主机",
        "kind": "SP",
        "rarity": "E",
        "description": "本场魔攻 +22%、物攻 -12%",
        "cost": "0/常驻",
        "domains": [
            "灵术"
        ]
    },
    {
        "id": "S003",
        "name": "厚甲灵枢",
        "kind": "SP",
        "rarity": "E",
        "description": "双防 +22%、速度 -10%",
        "cost": "0/常驻",
        "domains": [
            "守御"
        ]
    },
    {
        "id": "S004",
        "name": "迅影主机",
        "kind": "SP",
        "rarity": "E",
        "description": "速度/闪避 +18%、双防 -10%",
        "cost": "0/常驻",
        "domains": [
            "灵巧"
        ]
    },
    {
        "id": "S005",
        "name": "修护天性",
        "kind": "SP",
        "rarity": "E",
        "description": "自己生命治疗与授盾量 +22%，回复 MP 不加成",
        "cost": "0/常驻",
        "domains": [
            "支援"
        ]
    },
    {
        "id": "S006",
        "name": "精准猎线",
        "kind": "SP",
        "rarity": "E",
        "description": "自己主动直伤的实际命中率 +10 个百分点、暴击对抗数值 +15%",
        "cost": "0/常驻",
        "domains": [
            "灵巧",
            "战锋"
        ]
    },
    {
        "id": "S007",
        "name": "生机回流",
        "kind": "SP",
        "rarity": "E",
        "description": "自己主动直接伤害实际扣除敌方 HP 的 10% 治疗自己；每回合最多 H 的 8%，不由派生触发",
        "cost": "0/常驻",
        "domains": [
            "持续",
            "战锋"
        ]
    },
    {
        "id": "S008",
        "name": "星火蓄能",
        "kind": "SP",
        "rarity": "E",
        "description": "入场同步值 +20；仍受同步上限 100、每场一次大招限制",
        "cost": "0/常驻",
        "domains": [
            "应变"
        ]
    },
    {
        "id": "S009",
        "name": "双相运转",
        "kind": "SP",
        "rarity": "L",
        "description": "每次主动攻击按物理/法术交替时，本次最终直伤 +25%；首次没有加成，双属性一招只计其实际类型",
        "cost": "0/常驻",
        "domains": [
            "应变",
            "灵术"
        ]
    },
    {
        "id": "S010",
        "name": "精密复算",
        "kind": "SP",
        "rarity": "L",
        "description": "自己普通攻击技能全部直击段均未命中时，本技能剩余 CD -2，最低 0；每回合一次，不退款 MP",
        "cost": "0/常驻",
        "domains": [
            "应变",
            "灵巧"
        ]
    },
    {
        "id": "S011",
        "name": "护主誓约",
        "kind": "SP",
        "rarity": "L",
        "description": "主人本场首次 HP 降至 35% 以下且存活，自动授盾 1.60D，2 回合；不转移伤害、不复活",
        "cost": "0/常驻",
        "domains": [
            "守御",
            "支援"
        ]
    },
    {
        "id": "S012",
        "name": "裂隙观测",
        "kind": "SP",
        "rarity": "L",
        "description": "自己对主目标的主动直伤忽略对应防御 20%，与其他穿透按统一 50% 上限合并",
        "cost": "0/常驻",
        "domains": [
            "战锋",
            "干扰"
        ]
    },
    {
        "id": "S013",
        "name": "稳态堡垒",
        "kind": "SP",
        "rarity": "L",
        "description": "自己有护盾时减伤 18%；每次本具人偶主动授予自己的盾被击破后恢复最大 MP 4%，每回合一次",
        "cost": "0/常驻",
        "domains": [
            "守御",
            "持续"
        ]
    },
    {
        "id": "S014",
        "name": "回响织机",
        "kind": "SP",
        "rarity": "L",
        "description": "每第 3 次有效普通治疗后追加该次实际治疗量 40% 给同目标；追加不触发其他治疗被动，不重复应用原次治疗已经包含的修正",
        "cost": "0/常驻",
        "domains": [
            "支援",
            "持续"
        ]
    },
    {
        "id": "S015",
        "name": "不灭灵枢",
        "kind": "SP",
        "rarity": "M",
        "description": "本场首次受到致命伤时保留 1 HP、移除普通硬控并获得 2.00D 盾，1 回合；只保护自己，最终仍可被后续伤害击倒",
        "cost": "0/常驻",
        "domains": [
            "守御",
            "持续"
        ]
    },
    {
        "id": "S016",
        "name": "奇迹演算",
        "kind": "SP",
        "rarity": "M",
        "description": "每第 3 次有效普通主动技能，使其自身结束结算后的 CD 直接变为 0、返还实付 MP 的 30%；每回合最多一次，不作用大招、回蓝或减 CD 技能",
        "cost": "0/常驻",
        "domains": [
            "应变",
            "灵术"
        ]
    },
    {
        "id": "S017",
        "name": "苍穹贯刺",
        "kind": "ULT",
        "rarity": "E",
        "description": "单体 2.80P，本次忽略物防 20%",
        "cost": "20%",
        "domains": [
            "战锋"
        ]
    },
    {
        "id": "S018",
        "name": "曜光终式",
        "kind": "ULT",
        "rarity": "E",
        "description": "单体 2.80M 光伤，驱散目标 1 项普通增益",
        "cost": "20%",
        "domains": [
            "灵术",
            "干扰"
        ]
    },
    {
        "id": "S019",
        "name": "星火齐射",
        "kind": "ULT",
        "rarity": "E",
        "description": "主目标及另外至多 2 目标，各 1.65M 火伤",
        "cost": "24%",
        "domains": [
            "灵术"
        ]
    },
    {
        "id": "S020",
        "name": "霜幕终曲",
        "kind": "ULT",
        "rarity": "E",
        "description": "至多 3 目标各 1.40M 冰伤，命中后 50% 速度 -25%，2 回合",
        "cost": "24%",
        "domains": [
            "干扰",
            "灵术"
        ]
    },
    {
        "id": "S021",
        "name": "雷鸣封锁",
        "kind": "ULT",
        "rarity": "E",
        "description": "单体 2.10M 雷伤，命中后 60% 眩晕 1 回合，Boss 基础为 24%",
        "cost": "22%",
        "domains": [
            "干扰"
        ]
    },
    {
        "id": "S022",
        "name": "誓守壁垒",
        "kind": "ULT",
        "rarity": "E",
        "description": "自己和主人各获 1.50D 盾，3 回合；不保护其他队员",
        "cost": "24%",
        "domains": [
            "守御"
        ]
    },
    {
        "id": "S023",
        "name": "回生织光",
        "kind": "ULT",
        "rarity": "E",
        "description": "同时治疗自己与主人，各 2.20M，并各净化 1 项普通减益，不复活",
        "cost": "24%",
        "domains": [
            "支援"
        ]
    },
    {
        "id": "S024",
        "name": "机巧超频",
        "kind": "ULT",
        "rarity": "E",
        "description": "自己双攻 +35%、速度 +20%，3 回合；结束后速度 -15%，1 回合；不增加行动次数",
        "cost": "20%",
        "domains": [
            "战锋",
            "灵巧"
        ]
    },
    {
        "id": "S025",
        "name": "断界重斩",
        "kind": "ULT",
        "rarity": "L",
        "description": "预备 1 回合，单体 3.80P，本次忽略物防 30%",
        "cost": "28%",
        "domains": [
            "战锋"
        ]
    },
    {
        "id": "S026",
        "name": "九曜星落",
        "kind": "ULT",
        "rarity": "L",
        "description": "预备 1 回合，至多 3 目标各 2.30M；元素统一选择主目标当前最低抗性类型",
        "cost": "30%",
        "domains": [
            "灵术"
        ]
    },
    {
        "id": "S027",
        "name": "永昼净域",
        "kind": "ULT",
        "rarity": "L",
        "description": "治疗自己与主人各 2.40M，并各清除至多 2 项普通减益",
        "cost": "28%",
        "domains": [
            "支援"
        ]
    },
    {
        "id": "S028",
        "name": "万象折盾",
        "kind": "ULT",
        "rarity": "L",
        "description": "自己与主人各获 2.00D 盾，3 回合；自己减伤 20%，2 回合",
        "cost": "28%",
        "domains": [
            "守御"
        ]
    },
    {
        "id": "S029",
        "name": "终焉锁点",
        "kind": "ULT",
        "rarity": "L",
        "description": "单体 3.00×max(P,M)，较高攻决定类型；低于 25% HP 的主目标最终直伤 +25%，无即死",
        "cost": "28%",
        "domains": [
            "战锋",
            "应变"
        ]
    },
    {
        "id": "S030",
        "name": "时序归整",
        "kind": "ULT",
        "rarity": "L",
        "description": "清除自己至多 2 项普通控制，使全部普通主动 CD -2，并获得 1.20D 盾，2 回合；硬控导致无法行动时不能手动施放",
        "cost": "26%",
        "domains": [
            "应变",
            "守御"
        ]
    },
    {
        "id": "S031",
        "name": "天穹坠星",
        "kind": "ULT",
        "rarity": "M",
        "description": "预备 1 回合，主目标 4.20M 光伤，另外至多 2 目标各 2.10M；不绕过 Boss 本体保护与部位分摊",
        "cost": "35%",
        "domains": [
            "灵术"
        ]
    },
    {
        "id": "S032",
        "name": "归零终式",
        "kind": "ULT",
        "rarity": "M",
        "description": "单体 4.00×max(P,M)，由较高攻决定类型，本次忽略防御 35%；施放后自己虚弱，双攻 -25%，2 回合",
        "cost": "35%",
        "domains": [
            "战锋",
            "应变"
        ]
    }
];

export { automatonSkills };
