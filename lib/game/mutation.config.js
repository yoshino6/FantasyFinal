const mutationCatalog = [
    {
        "code": "mutation_eye_stable_1",
        "name": "叶脉瞳",
        "part": "eye",
        "state": "stable",
        "description": "效果：对带中毒或流血的目标，造成伤害 +10%。 负面：无",
        "effect": {
            "damageBonusPct": 10
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_eye_stable_2",
        "name": "棱镜虹膜",
        "part": "eye",
        "state": "stable",
        "description": "效果：攻击时忽略目标 8% 的对应防御。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_eye_stable_3",
        "name": "暗适瞳",
        "part": "eye",
        "state": "stable",
        "description": "效果：夜间命中属性 +12%。 负面：无",
        "effect": {
            "accuracyPct": 12
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_eye_stable_4",
        "name": "深焦晶体",
        "part": "eye",
        "state": "stable",
        "description": "效果：暴击属性 +4%。 负面：无",
        "effect": {
            "critRatePct": 4
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_eye_stable_5",
        "name": "追迹瞳",
        "part": "eye",
        "state": "stable",
        "description": "效果：对本场曾被自己打空的目标，命中属性 +15%。 负面：无",
        "effect": {
            "accuracyPct": 15
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_eye_stable_6",
        "name": "风纹角膜",
        "part": "eye",
        "state": "stable",
        "description": "效果：风天命中属性 +15%。 负面：无",
        "effect": {
            "accuracyPct": 15
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_eye_stable_7",
        "name": "矿脉视",
        "part": "eye",
        "state": "stable",
        "description": "效果：挖矿获得的普通矿材 +5%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_eye_stable_8",
        "name": "静水晶体",
        "part": "eye",
        "state": "stable",
        "description": "效果：魔力不低于 80% 时，命中属性 +10%。 负面：无",
        "effect": {
            "accuracyPct": 80
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_eye_stable_9",
        "name": "星屑瞳孔",
        "part": "eye",
        "state": "stable",
        "description": "效果：夜间暴击属性 +12%。 负面：无",
        "effect": {
            "critRatePct": 12
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_eye_stable_10",
        "name": "余晖反射",
        "part": "eye",
        "state": "stable",
        "description": "效果：生命低于一半时，暴击伤害 +12%。 负面：无",
        "effect": {
            "damageBonusPct": 12
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_eye_stable_11",
        "name": "微光腺",
        "part": "eye",
        "state": "stable",
        "description": "效果：忽略普通目盲造成的 50% 命中属性惩罚。 负面：无",
        "effect": {
            "accuracyPct": 50
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_eye_stable_12",
        "name": "双焦瞳",
        "part": "eye",
        "state": "stable",
        "description": "效果：群体攻击对其中生命比例最低的目标，造成伤害 +12%。 负面：无",
        "effect": {
            "damageBonusPct": 12
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_eye_stable_13",
        "name": "灵压视",
        "part": "eye",
        "state": "stable",
        "description": "效果：对正在吟唱的目标，造成伤害 +15%。 负面：无",
        "effect": {
            "damageBonusPct": 15
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_eye_stable_14",
        "name": "雾透膜",
        "part": "eye",
        "state": "stable",
        "description": "效果：忽略雾天对自身造成的命中属性惩罚。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_eye_stable_15",
        "name": "记忆虹膜",
        "part": "eye",
        "state": "stable",
        "description": "效果：本场已经使用过的技能，耗魔降低 8%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_eye_deviation_1",
        "name": "余像症",
        "part": "eye",
        "state": "deviation",
        "description": "效果：攻击未命中时，残像仍造成该次非暴击预计伤害的 15%。 负面：命中属性 -3%",
        "effect": {},
        "negativeEffect": {
            "accuracyPct": -3
        }
    },
    {
        "code": "mutation_eye_deviation_2",
        "name": "畏光",
        "part": "eye",
        "state": "deviation",
        "description": "效果：夜间造成伤害 +10%。 负面：白昼命中属性 -3%",
        "effect": {
            "damageBonusPct": 10
        },
        "negativeEffect": {
            "accuracyPct": -3
        }
    },
    {
        "code": "mutation_eye_deviation_3",
        "name": "色温错位",
        "part": "eye",
        "state": "deviation",
        "description": "效果：目标每有一种普通减益，对其造成伤害 +2%，最多 +10%。 负面：无减益目标对自己的伤害 +3%",
        "effect": {
            "damageBonusPct": 2
        },
        "negativeEffect": {
            "damageBonusPct": 3
        }
    },
    {
        "code": "mutation_eye_deviation_4",
        "name": "焦距迟滞",
        "part": "eye",
        "state": "deviation",
        "description": "效果：对本场曾被自己命中的目标，忽略其 12% 对应防御。 负面：攻击未观察过的目标时命中属性 -4%",
        "effect": {},
        "negativeEffect": {
            "accuracyPct": -4
        }
    },
    {
        "code": "mutation_eye_deviation_5",
        "name": "强迫标记",
        "part": "eye",
        "state": "deviation",
        "description": "效果：对当前手动选择的主目标，造成伤害 +6%。 负面：对非主目标造成伤害 -3%",
        "effect": {
            "damageBonusPct": 6
        },
        "negativeEffect": {
            "damageBonusPct": -3
        }
    },
    {
        "code": "mutation_eye_deviation_6",
        "name": "盲点游移",
        "part": "eye",
        "state": "deviation",
        "description": "效果：面对生命比例高于自身的敌人，闪避属性 +12%。 负面：面对其他敌人时命中属性 -3%",
        "effect": {
            "evasionPct": 12
        },
        "negativeEffect": {
            "accuracyPct": -3
        }
    },
    {
        "code": "mutation_eye_deviation_7",
        "name": "视觉过饱和",
        "part": "eye",
        "state": "deviation",
        "description": "效果：对带至少三种普通减益的目标，造成伤害 +18%。 负面：受到的普通目盲命中惩罚加重 5%",
        "effect": {
            "damageBonusPct": 18
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_eye_deviation_8",
        "name": "断片视界",
        "part": "eye",
        "state": "deviation",
        "description": "效果：自己原本造成伤害的 4% 额外结算为裂隙附伤。 负面：技能耗魔 +3%",
        "effect": {
            "damageBonusPct": 4
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_eye_deviation_9",
        "name": "梦视",
        "part": "eye",
        "state": "deviation",
        "description": "效果：对沉睡或混乱中的目标，造成伤害 +20%。 负面：受疗 -3%",
        "effect": {
            "damageBonusPct": 20
        },
        "negativeEffect": {
            "healingReceivedPct": -3
        }
    },
    {
        "code": "mutation_eye_rare_1",
        "name": "世界树瞳",
        "part": "eye",
        "state": "rare",
        "description": "效果：当前标记目标的双防降低 5%，队友也能利用这处破绽。 负面：无",
        "effect": {
            "physicalDefensePct": 5,
            "magicDefensePct": 5
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_eye_rare_2",
        "name": "月蚀瞳",
        "part": "eye",
        "state": "rare",
        "description": "效果：暴击额外伤害的 8% 转成自身护盾。 负面：白昼暴击属性 -3%",
        "effect": {},
        "negativeEffect": {
            "critRatePct": -3
        }
    },
    {
        "code": "mutation_eye_rare_3",
        "name": "命线之眼",
        "part": "eye",
        "state": "rare",
        "description": "效果：对生命不高于 20% 的目标，造成伤害 +15%。 负面：无",
        "effect": {
            "damageBonusPct": 20
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_eye_rare_4",
        "name": "海渊瞳",
        "part": "eye",
        "state": "rare",
        "description": "效果：魔力不高于 30% 时，造成伤害的 3% 回复自身 MP。 负面：无",
        "effect": {
            "damageBonusPct": 30
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_eye_rare_5",
        "name": "碎镜复眼",
        "part": "eye",
        "state": "rare",
        "description": "效果：主攻击击杀时，溢出伤害的 25% 转移给另一名存活敌人。 负面：群体技能耗魔 +3%",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_eye_rare_6",
        "name": "闭环瞳",
        "part": "eye",
        "state": "rare",
        "description": "效果：攻击未命中时，返还该次攻击实际消耗 MP 的 50%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_nerve_stable_1",
        "name": "并列突触",
        "part": "nerve",
        "state": "stable",
        "description": "效果：与最近一次不同的技能，耗魔降低 8%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_nerve_stable_2",
        "name": "低延迟髓鞘",
        "part": "nerve",
        "state": "stable",
        "description": "效果：速度属性 +4%。 负面：无",
        "effect": {
            "speedPct": 4
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_nerve_stable_3",
        "name": "反射弧",
        "part": "nerve",
        "state": "stable",
        "description": "效果：闪避属性 +4%。 负面：无",
        "effect": {
            "evasionPct": 4
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_nerve_stable_4",
        "name": "节律突触",
        "part": "nerve",
        "state": "stable",
        "description": "效果：与最近一次攻击方式不同的普攻或技能，造成伤害 +8%。 负面：无",
        "effect": {
            "damageBonusPct": 8
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_nerve_stable_5",
        "name": "静默神经",
        "part": "nerve",
        "state": "stable",
        "description": "效果：处于沉默时，造成伤害 +15%。 负面：无",
        "effect": {
            "damageBonusPct": 15
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_nerve_stable_6",
        "name": "手势记忆",
        "part": "nerve",
        "state": "stable",
        "description": "效果：本场曾被打断的技能，耗魔降低 15%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_nerve_stable_7",
        "name": "预判神经",
        "part": "nerve",
        "state": "stable",
        "description": "效果：对本场曾攻击过自己的敌人，闪避属性 +10%。 负面：无",
        "effect": {
            "evasionPct": 10
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_nerve_stable_8",
        "name": "痛觉阈门",
        "part": "nerve",
        "state": "stable",
        "description": "效果：生命不高于 30% 时，韧性属性 +18%。 负面：无",
        "effect": {
            "tenacityPct": 30
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_nerve_stable_9",
        "name": "分流神经",
        "part": "nerve",
        "state": "stable",
        "description": "效果：最大魔力 +4%。 负面：无",
        "effect": {
            "mpPct": 4
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_nerve_stable_10",
        "name": "余震回路",
        "part": "nerve",
        "state": "stable",
        "description": "效果：对处于普通硬控中的目标，造成伤害 +12%。 负面：无",
        "effect": {
            "damageBonusPct": 12
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_nerve_stable_11",
        "name": "呼吸同步",
        "part": "nerve",
        "state": "stable",
        "description": "效果：原始耗魔不低于最大 MP 的 10% 的技能，耗魔降低 10%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_nerve_stable_12",
        "name": "触觉雷达",
        "part": "nerve",
        "state": "stable",
        "description": "效果：自身被目盲时，闪避属性 +15%。 负面：无",
        "effect": {
            "evasionPct": 15
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_nerve_stable_13",
        "name": "绝缘髓鞘",
        "part": "nerve",
        "state": "stable",
        "description": "效果：普通雷伤产生的附带控制，其抵抗判定使用的韧性提高 20%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_nerve_stable_14",
        "name": "迟滞过滤",
        "part": "nerve",
        "state": "stable",
        "description": "效果：普通迟缓对自身造成的速度降低减少 50%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_nerve_stable_15",
        "name": "梦行回路",
        "part": "nerve",
        "state": "stable",
        "description": "效果：沉睡期间受到伤害降低 20%。 负面：无",
        "effect": {
            "damageReductionPct": 20
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_nerve_deviation_1",
        "name": "过载反射",
        "part": "nerve",
        "state": "deviation",
        "description": "效果：双攻 +5%。 负面：技能耗魔 +3%",
        "effect": {
            "physicalAttackPct": 5,
            "magicAttackPct": 5
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_nerve_deviation_2",
        "name": "假启动",
        "part": "nerve",
        "state": "deviation",
        "description": "效果：对满生命目标，造成伤害 +15%。 负面：攻击满生命目标时命中属性 -3%",
        "effect": {
            "damageBonusPct": 15
        },
        "negativeEffect": {
            "accuracyPct": -3
        }
    },
    {
        "code": "mutation_nerve_deviation_3",
        "name": "痛觉放大",
        "part": "nerve",
        "state": "deviation",
        "description": "效果：每损失 10% 最大生命，造成伤害 +1.5%，最多 +12%。 负面：受到伤害 +3%",
        "effect": {
            "hpPct": 10
        },
        "negativeEffect": {
            "damageBonusPct": 3
        }
    },
    {
        "code": "mutation_nerve_deviation_4",
        "name": "耳鸣",
        "part": "nerve",
        "state": "deviation",
        "description": "效果：被沉默时，暴击属性 +15%。 负面：韧性属性 -3%",
        "effect": {
            "critRatePct": 15
        },
        "negativeEffect": {
            "tenacityPct": -3
        }
    },
    {
        "code": "mutation_nerve_deviation_5",
        "name": "梦语",
        "part": "nerve",
        "state": "deviation",
        "description": "效果：被沉默或混乱时，受到治疗 +18%。 负面：常态受疗 -3%",
        "effect": {
            "healingReceivedPct": 18
        },
        "negativeEffect": {
            "healingReceivedPct": -3
        }
    },
    {
        "code": "mutation_nerve_deviation_6",
        "name": "动作强迫",
        "part": "nerve",
        "state": "deviation",
        "description": "效果：重复最近一次使用的技能时，耗魔降低 10%。 负面：更换技能时耗魔 +3%",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_nerve_deviation_7",
        "name": "神经拒斥",
        "part": "nerve",
        "state": "deviation",
        "description": "效果：没有其他单位给予的增益时，韧性属性 +12%。 负面：外来数值增益强度 -3%",
        "effect": {
            "tenacityPct": 12
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_nerve_deviation_8",
        "name": "颤抖",
        "part": "nerve",
        "state": "deviation",
        "description": "效果：暴击伤害 +8%。 负面：命中属性 -3%",
        "effect": {
            "damageBonusPct": 8
        },
        "negativeEffect": {
            "accuracyPct": -3
        }
    },
    {
        "code": "mutation_nerve_deviation_9",
        "name": "迟发疼痛",
        "part": "nerve",
        "state": "deviation",
        "description": "效果：单次伤害超过自身最大 HP 的 20% 时，超出部分降低 25%。 负面：受疗 -3%",
        "effect": {},
        "negativeEffect": {
            "healingReceivedPct": -3
        }
    },
    {
        "code": "mutation_nerve_rare_1",
        "name": "时隙突触",
        "part": "nerve",
        "state": "rare",
        "description": "效果：自动将本场第一个成功释放且冷却大于 1 的技能，结算冷却降低 1（每战一次）。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_nerve_rare_2",
        "name": "群落神经",
        "part": "nerve",
        "state": "rare",
        "description": "效果：受到其他玩家的有效治疗时，其治疗量的 5% 回复自身 MP。 负面：无",
        "effect": {
            "healingBonusPct": 5
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_nerve_rare_3",
        "name": "雷痕神经",
        "part": "nerve",
        "state": "rare",
        "description": "效果：本场受过雷属性伤害后，速度属性 +10%。 负面：受到雷属性伤害 +3%",
        "effect": {
            "speedPct": 10
        },
        "negativeEffect": {
            "damageBonusPct": 3
        }
    },
    {
        "code": "mutation_nerve_rare_4",
        "name": "梦境触须",
        "part": "nerve",
        "state": "rare",
        "description": "效果：抵挡本场第一次可普通驱散的硬控（每战一次）。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_nerve_rare_5",
        "name": "静脑回路",
        "part": "nerve",
        "state": "rare",
        "description": "效果：没有技能处于冷却时，技能耗魔降低 12%。 负面：速度属性 -3%",
        "effect": {
            "manaCostReductionPct": 12
        },
        "negativeEffect": {
            "speedPct": -3
        }
    },
    {
        "code": "mutation_nerve_rare_6",
        "name": "回声中枢",
        "part": "nerve",
        "state": "rare",
        "description": "效果：技能实际耗魔的 5% 返还给本场 MP 比例最低的己方玩家，包括自己。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_skin_stable_1",
        "name": "鳞质膜",
        "part": "skin",
        "state": "stable",
        "description": "效果：本场已经承受过的元素伤害，后续同元素伤害降低 8%。 负面：无",
        "effect": {
            "damageReductionPct": 8
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_skin_stable_2",
        "name": "苔藓表皮",
        "part": "skin",
        "state": "stable",
        "description": "效果：雨天受到治疗 +12%。 负面：无",
        "effect": {
            "healingReceivedPct": 12
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_skin_stable_3",
        "name": "厚角质",
        "part": "skin",
        "state": "stable",
        "description": "效果：双防 +4%。 负面：无",
        "effect": {
            "physicalDefensePct": 4,
            "magicDefensePct": 4
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_skin_stable_4",
        "name": "银纹皮层",
        "part": "skin",
        "state": "stable",
        "description": "效果：获得的生命护盾量 +5%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_skin_stable_5",
        "name": "变温表皮",
        "part": "skin",
        "state": "stable",
        "description": "效果：本次受伤与上次元素不同，受到的该次伤害降低 10%。 负面：无",
        "effect": {
            "damageReductionPct": 10
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_skin_stable_6",
        "name": "微孔呼吸",
        "part": "skin",
        "state": "stable",
        "description": "效果：普通中毒伤害降低 20%。 负面：无",
        "effect": {
            "damageReductionPct": 20
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_skin_stable_7",
        "name": "树脂涂层",
        "part": "skin",
        "state": "stable",
        "description": "效果：受到的实际 HP 伤害的 4% 转成自身护盾。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_skin_stable_8",
        "name": "静电绒毛",
        "part": "skin",
        "state": "stable",
        "description": "效果：对本场曾以雷伤攻击自己的敌人，反射其后续伤害的 8%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_skin_stable_9",
        "name": "砂砾皮",
        "part": "skin",
        "state": "stable",
        "description": "效果：反射实际受到伤害的 4%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_skin_stable_10",
        "name": "露珠膜",
        "part": "skin",
        "state": "stable",
        "description": "效果：受到的有效治疗量的 4% 转成自身护盾。 负面：无",
        "effect": {
            "healingBonusPct": 4
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_skin_stable_11",
        "name": "镜面角片",
        "part": "skin",
        "state": "stable",
        "description": "效果：受到的暴击额外伤害降低 15%。 负面：无",
        "effect": {
            "damageReductionPct": 15
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_skin_stable_12",
        "name": "风干皮膜",
        "part": "skin",
        "state": "stable",
        "description": "效果：普通流血伤害降低 20%。 负面：无",
        "effect": {
            "damageReductionPct": 20
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_skin_stable_13",
        "name": "矿纹真皮",
        "part": "skin",
        "state": "stable",
        "description": "效果：成功采矿时，采集耗时降低 4%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_skin_stable_14",
        "name": "霜壳",
        "part": "skin",
        "state": "stable",
        "description": "效果：受到冰属性伤害降低 15%。 负面：无",
        "effect": {
            "damageReductionPct": 15
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_skin_stable_15",
        "name": "伪装斑纹",
        "part": "skin",
        "state": "stable",
        "description": "效果：对尚未被自己攻击过的敌人，闪避属性 +12%。 负面：无",
        "effect": {
            "evasionPct": 12
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_skin_deviation_1",
        "name": "蜕皮期",
        "part": "skin",
        "state": "deviation",
        "description": "效果：本场首次承受的元素成为适应元素，之后该元素伤害降低 15%。 负面：尚未建立适应时受到元素伤害 +5%",
        "effect": {
            "damageReductionPct": 15
        },
        "negativeEffect": {
            "damageBonusPct": 5
        }
    },
    {
        "code": "mutation_skin_deviation_2",
        "name": "裂纹皮",
        "part": "skin",
        "state": "deviation",
        "description": "效果：自身没有护盾时，造成伤害 +8%。 负面：没有护盾时受到伤害 +3%",
        "effect": {
            "damageBonusPct": 8
        },
        "negativeEffect": {
            "damageBonusPct": 3
        }
    },
    {
        "code": "mutation_skin_deviation_3",
        "name": "过敏斑",
        "part": "skin",
        "state": "deviation",
        "description": "效果：雨天水、晴天火、雾天风对应的伤害降低 18%。 负面：相同天气下其他元素伤害 +3%",
        "effect": {
            "damageReductionPct": 18
        },
        "negativeEffect": {
            "damageBonusPct": 3
        }
    },
    {
        "code": "mutation_skin_deviation_4",
        "name": "渗水",
        "part": "skin",
        "state": "deviation",
        "description": "效果：雨天消耗品恢复效果 +15%。 负面：雨天耗魔 +3%",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_skin_deviation_5",
        "name": "硬壳僵化",
        "part": "skin",
        "state": "deviation",
        "description": "效果：处于原有防御姿态时，受到伤害额外降低 12%。 负面：速度属性 -4%",
        "effect": {},
        "negativeEffect": {
            "speedPct": -4
        }
    },
    {
        "code": "mutation_skin_deviation_6",
        "name": "灼痕",
        "part": "skin",
        "state": "deviation",
        "description": "效果：自身带普通灼烧时，造成伤害 +15%。 负面：普通灼烧对自身伤害 +5%",
        "effect": {
            "damageBonusPct": 15
        },
        "negativeEffect": {
            "damageBonusPct": 5
        }
    },
    {
        "code": "mutation_skin_deviation_7",
        "name": "瘙痒感",
        "part": "skin",
        "state": "deviation",
        "description": "效果：处于原有防御姿态时，反射实际受伤的 12%。 负面：命中属性 -3%",
        "effect": {},
        "negativeEffect": {
            "accuracyPct": -3
        }
    },
    {
        "code": "mutation_skin_deviation_8",
        "name": "褪色",
        "part": "skin",
        "state": "deviation",
        "description": "效果：夜间受到伤害降低 10%。 负面：白昼闪避属性 -3%",
        "effect": {
            "damageReductionPct": 10
        },
        "negativeEffect": {
            "evasionPct": -3
        }
    },
    {
        "code": "mutation_skin_deviation_9",
        "name": "异鳞",
        "part": "skin",
        "state": "deviation",
        "description": "效果：自己的双防较低项提高 8%，按无本词条时的属性比较。 负面：速度属性 -3%",
        "effect": {
            "physicalDefensePct": 8,
            "magicDefensePct": 8
        },
        "negativeEffect": {
            "speedPct": -3
        }
    },
    {
        "code": "mutation_skin_rare_1",
        "name": "叶脉皮",
        "part": "skin",
        "state": "rare",
        "description": "效果：所受溢出治疗的 20% 转成自身护盾。 负面：火属性受伤 +4%",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_skin_rare_2",
        "name": "潮汐鳞",
        "part": "skin",
        "state": "rare",
        "description": "效果：护盾实际吸收伤害的 5% 回复自身 HP。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_skin_rare_3",
        "name": "星砂肤",
        "part": "skin",
        "state": "rare",
        "description": "效果：夜间成功采矿时，普通产物数量 +10%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_skin_rare_4",
        "name": "岩壳胎衣",
        "part": "skin",
        "state": "rare",
        "description": "效果：满生命时受到伤害降低 12%。 负面：速度属性 -3%",
        "effect": {
            "damageReductionPct": 12
        },
        "negativeEffect": {
            "speedPct": -3
        }
    },
    {
        "code": "mutation_skin_rare_5",
        "name": "镜湖皮",
        "part": "skin",
        "state": "rare",
        "description": "效果：反射本场第一次命中自己的可普通驱散非硬控减益，本人不承受它（每战一次）。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_skin_rare_6",
        "name": "云纹皮",
        "part": "skin",
        "state": "rare",
        "description": "效果：高于自身速度的敌人，对自己造成伤害降低 10%。 负面：无",
        "effect": {
            "damageBonusPct": 10
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_chest_stable_1",
        "name": "双律心室",
        "part": "chest",
        "state": "stable",
        "description": "效果：现有生命自然恢复效果 +5%，不新增自动回血周期。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_chest_stable_2",
        "name": "静脉护环",
        "part": "chest",
        "state": "stable",
        "description": "效果：自己提供的有效治疗量的 4% 额外形成目标护盾。 负面：无",
        "effect": {
            "healingBonusPct": 4
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_chest_stable_3",
        "name": "深呼吸囊",
        "part": "chest",
        "state": "stable",
        "description": "效果：最大魔力 +5%。 负面：无",
        "effect": {
            "mpPct": 5
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_chest_stable_4",
        "name": "潮鸣肺叶",
        "part": "chest",
        "state": "stable",
        "description": "效果：雨天现有 MP 恢复效果 +12%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_chest_stable_5",
        "name": "绒膜肺",
        "part": "chest",
        "state": "stable",
        "description": "效果：受到的普通持续伤害降低 10%。 负面：无",
        "effect": {
            "damageReductionPct": 10
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_chest_stable_6",
        "name": "热核心房",
        "part": "chest",
        "state": "stable",
        "description": "效果：本场受到过冰属性伤害后，受到治疗 +10%。 负面：无",
        "effect": {
            "healingReceivedPct": 10
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_chest_stable_7",
        "name": "缓搏心律",
        "part": "chest",
        "state": "stable",
        "description": "效果：单次伤害不高于自身最大 HP 的 5% 时，该次伤害降低 15%。 负面：无",
        "effect": {
            "damageReductionPct": 5
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_chest_stable_8",
        "name": "共鸣胸骨",
        "part": "chest",
        "state": "stable",
        "description": "效果：对其他玩家的治疗效果 +6%。 负面：无",
        "effect": {
            "healingBonusPct": 6
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_chest_stable_9",
        "name": "储氧腔",
        "part": "chest",
        "state": "stable",
        "description": "效果：技能实际消耗 MP 的 8% 转为自身护盾。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_chest_stable_10",
        "name": "净血微囊",
        "part": "chest",
        "state": "stable",
        "description": "效果：身上有普通流血时，受到治疗 +15%。 负面：无",
        "effect": {
            "healingReceivedPct": 15
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_chest_stable_11",
        "name": "回春腺",
        "part": "chest",
        "state": "stable",
        "description": "效果：已有战斗外 HP 恢复效果 +8%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_chest_stable_12",
        "name": "光合胸腔",
        "part": "chest",
        "state": "stable",
        "description": "效果：白昼受到治疗 +10%。 负面：无",
        "effect": {
            "healingReceivedPct": 10
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_chest_stable_13",
        "name": "静压肺泡",
        "part": "chest",
        "state": "stable",
        "description": "效果：受到群体攻击伤害降低 10%。 负面：无",
        "effect": {
            "damageReductionPct": 10
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_chest_stable_14",
        "name": "脉冲心室",
        "part": "chest",
        "state": "stable",
        "description": "效果：自己主攻击击杀敌人时，回复当前缺失 HP 的 5%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_chest_stable_15",
        "name": "护巢反应",
        "part": "chest",
        "state": "stable",
        "description": "效果：本场生命不高于 30% 的其他玩家队友，受到伤害降低 5%。 负面：无",
        "effect": {
            "damageReductionPct": 30
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_chest_deviation_1",
        "name": "逆搏",
        "part": "chest",
        "state": "deviation",
        "description": "效果：生命不高于 30% 时，受到伤害降低 12%。 负面：受到治疗 -4%",
        "effect": {
            "damageReductionPct": 30
        },
        "negativeEffect": {
            "healingReceivedPct": -4
        }
    },
    {
        "code": "mutation_chest_deviation_2",
        "name": "心律失序",
        "part": "chest",
        "state": "deviation",
        "description": "效果：MP 低于一半时，技能耗魔降低 10%。 负面：道具恢复 MP -3%",
        "effect": {
            "manaCostReductionPct": 10
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_chest_deviation_3",
        "name": "喘鸣",
        "part": "chest",
        "state": "deviation",
        "description": "效果：对速度低于自己的目标，造成伤害的 3% 回复自身 HP。 负面：技能耗魔 +3%",
        "effect": {
            "damageBonusPct": 3
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_chest_deviation_4",
        "name": "血潮",
        "part": "chest",
        "state": "deviation",
        "description": "效果：受到治疗 +5%。 负面：受到伤害 +3%",
        "effect": {
            "healingReceivedPct": 5
        },
        "negativeEffect": {
            "damageBonusPct": 3
        }
    },
    {
        "code": "mutation_chest_deviation_5",
        "name": "空腔感",
        "part": "chest",
        "state": "deviation",
        "description": "效果：没有护盾时，闪避属性 +10%。 负面：最大 HP -3%",
        "effect": {
            "evasionPct": 10
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_chest_deviation_6",
        "name": "胸闷",
        "part": "chest",
        "state": "deviation",
        "description": "效果：MP 不高于 30% 时，韧性属性 +20%。 负面：速度属性 -3%",
        "effect": {
            "tenacityPct": 30
        },
        "negativeEffect": {
            "speedPct": -3
        }
    },
    {
        "code": "mutation_chest_deviation_7",
        "name": "灼肺",
        "part": "chest",
        "state": "deviation",
        "description": "效果：带普通灼烧时，MP 恢复效果 +18%。 负面：普通灼烧伤害 +4%",
        "effect": {},
        "negativeEffect": {
            "damageBonusPct": 4
        }
    },
    {
        "code": "mutation_chest_deviation_8",
        "name": "漏压",
        "part": "chest",
        "state": "deviation",
        "description": "效果：获得的生命护盾量 +5%。 负面：受到治疗 -3%",
        "effect": {},
        "negativeEffect": {
            "healingReceivedPct": -3
        }
    },
    {
        "code": "mutation_chest_deviation_9",
        "name": "共感痛",
        "part": "chest",
        "state": "deviation",
        "description": "效果：有其他存活玩家队友时，自身受到的单体伤害降低 5%。 负面：队伍只剩自己时，受到伤害 +3%",
        "effect": {},
        "negativeEffect": {
            "damageReductionPct": -3
        }
    },
    {
        "code": "mutation_chest_rare_1",
        "name": "潮汐心室",
        "part": "chest",
        "state": "rare",
        "description": "效果：溢出治疗的 20% 转为自身 MP。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_chest_rare_2",
        "name": "树心共鸣",
        "part": "chest",
        "state": "rare",
        "description": "效果：自己的生命盾被击破时，最后一次实际吸收量的 20% 回复自身 HP。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_chest_rare_3",
        "name": "恒星肺",
        "part": "chest",
        "state": "rare",
        "description": "效果：白昼造成伤害 +10%。 负面：技能耗魔 +3%",
        "effect": {
            "damageBonusPct": 10
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_chest_rare_4",
        "name": "冬眠胸腔",
        "part": "chest",
        "state": "rare",
        "description": "效果：敌伤使自己跌入 30% 生命线时，清除自身所有可普通驱散的持续伤害状态（每战一次）。 负面：速度属性 -3%",
        "effect": {},
        "negativeEffect": {
            "speedPct": -3
        }
    },
    {
        "code": "mutation_chest_rare_5",
        "name": "回声心",
        "part": "chest",
        "state": "rare",
        "description": "效果：其他玩家队友首次通过已有能力复苏时，自己获得 10% 最大 HP 的生命护盾（每战一次）。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_chest_rare_6",
        "name": "空鸣腔",
        "part": "chest",
        "state": "rare",
        "description": "效果：吟唱被打断时，返还该技能实际已支付 MP 的 50%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_bone_stable_1",
        "name": "空髓骨架",
        "part": "bone",
        "state": "stable",
        "description": "效果：闪避属性 +5%。 负面：无",
        "effect": {
            "evasionPct": 5
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_bone_stable_2",
        "name": "致密骨板",
        "part": "bone",
        "state": "stable",
        "description": "效果：双防 +4%。 负面：无",
        "effect": {
            "physicalDefensePct": 4,
            "magicDefensePct": 4
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_bone_stable_3",
        "name": "灵导骨",
        "part": "bone",
        "state": "stable",
        "description": "效果：韧性属性 +5%。 负面：无",
        "effect": {
            "tenacityPct": 5
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_bone_stable_4",
        "name": "弹簧踝",
        "part": "bone",
        "state": "stable",
        "description": "效果：生命不低于 80% 时，速度属性 +10%。 负面：无",
        "effect": {
            "speedPct": 80
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_bone_stable_5",
        "name": "攀附指骨",
        "part": "bone",
        "state": "stable",
        "description": "效果：攻击带防御增益的目标时，忽略其 15% 对应防御。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_bone_stable_6",
        "name": "稳握腕骨",
        "part": "bone",
        "state": "stable",
        "description": "效果：命中属性 +5%。 负面：无",
        "effect": {
            "accuracyPct": 5
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_bone_stable_7",
        "name": "悬韧脊柱",
        "part": "bone",
        "state": "stable",
        "description": "效果：普通降速效果的降低幅度减少 40%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_bone_stable_8",
        "name": "静骨节",
        "part": "bone",
        "state": "stable",
        "description": "效果：处于普通硬控时，受到伤害降低 12%。 负面：无",
        "effect": {
            "damageReductionPct": 12
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_bone_stable_9",
        "name": "轻鸣肋骨",
        "part": "bone",
        "state": "stable",
        "description": "效果：MP 不低于 80% 时，速度属性 +12%。 负面：无",
        "effect": {
            "speedPct": 80
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_bone_stable_10",
        "name": "锚定髋骨",
        "part": "bone",
        "state": "stable",
        "description": "效果：处于原有防御姿态时，韧性属性 +20%。 负面：无",
        "effect": {
            "tenacityPct": 20
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_bone_stable_11",
        "name": "石髓骨",
        "part": "bone",
        "state": "stable",
        "description": "效果：最大生命 +4%。 负面：无",
        "effect": {
            "hpPct": 4
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_bone_stable_12",
        "name": "弓弦锁骨",
        "part": "bone",
        "state": "stable",
        "description": "效果：暴击伤害 +5%。 负面：无",
        "effect": {
            "damageBonusPct": 5
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_bone_stable_13",
        "name": "扭转腰椎",
        "part": "bone",
        "state": "stable",
        "description": "效果：攻击与最近一次不同的目标时，暴击属性 +12%。 负面：无",
        "effect": {
            "critRatePct": 12
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_bone_stable_14",
        "name": "踏风趾骨",
        "part": "bone",
        "state": "stable",
        "description": "效果：风天造成伤害 +10%。 负面：无",
        "effect": {
            "damageBonusPct": 10
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_bone_stable_15",
        "name": "护臂骨刺",
        "part": "bone",
        "state": "stable",
        "description": "效果：敌方攻击被自己的盾完整吸收时，反射该次吸收量的 10%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_bone_deviation_1",
        "name": "共振骨鸣",
        "part": "bone",
        "state": "deviation",
        "description": "效果：对最大生命高于自己的敌人，造成伤害 +8%。 负面：受到伤害 +3%",
        "effect": {
            "hpPct": 8
        },
        "negativeEffect": {
            "damageBonusPct": 3
        }
    },
    {
        "code": "mutation_bone_deviation_2",
        "name": "脆节",
        "part": "bone",
        "state": "deviation",
        "description": "效果：速度属性 +5%。 负面：双防 -3%",
        "effect": {
            "speedPct": 5
        },
        "negativeEffect": {
            "physicalDefensePct": -3,
            "magicDefensePct": -3
        }
    },
    {
        "code": "mutation_bone_deviation_3",
        "name": "骨刺外翻",
        "part": "bone",
        "state": "deviation",
        "description": "效果：反射实际受到伤害的 5%。 负面：受到治疗 -3%",
        "effect": {},
        "negativeEffect": {
            "healingReceivedPct": -3
        }
    },
    {
        "code": "mutation_bone_deviation_4",
        "name": "关节错位",
        "part": "bone",
        "state": "deviation",
        "description": "效果：闪避属性 +5%。 负面：命中属性 -3%",
        "effect": {
            "evasionPct": 5
        },
        "negativeEffect": {
            "accuracyPct": -3
        }
    },
    {
        "code": "mutation_bone_deviation_5",
        "name": "石化感",
        "part": "bone",
        "state": "deviation",
        "description": "效果：双防 +5%。 负面：速度属性 -4%",
        "effect": {
            "physicalDefensePct": 5,
            "magicDefensePct": 5
        },
        "negativeEffect": {
            "speedPct": -4
        }
    },
    {
        "code": "mutation_bone_deviation_6",
        "name": "空洞骨",
        "part": "bone",
        "state": "deviation",
        "description": "效果：韧性属性 +8%。 负面：最大生命 -4%",
        "effect": {
            "tenacityPct": 8
        },
        "negativeEffect": {
            "hpPct": -4
        }
    },
    {
        "code": "mutation_bone_deviation_7",
        "name": "骨髓躁动",
        "part": "bone",
        "state": "deviation",
        "description": "效果：双攻 +5%。 负面：释放耗魔技能时，额外扣除相当于原耗魔量 3% 的 HP",
        "effect": {
            "physicalAttackPct": 5,
            "magicAttackPct": 5
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_bone_deviation_8",
        "name": "钙化",
        "part": "bone",
        "state": "deviation",
        "description": "效果：原有效受疗量的 5% 额外形成自身护盾，不截走原治疗。 负面：受到治疗 -3%",
        "effect": {
            "healingReceivedPct": 5
        },
        "negativeEffect": {
            "healingReceivedPct": -3
        }
    },
    {
        "code": "mutation_bone_deviation_9",
        "name": "断续痛",
        "part": "bone",
        "state": "deviation",
        "description": "效果：生命不高于 30% 时，双攻 +12%。 负面：生命高于一半时命中属性 -3%",
        "effect": {
            "physicalAttackPct": 30,
            "magicAttackPct": 30
        },
        "negativeEffect": {
            "accuracyPct": -3
        }
    },
    {
        "code": "mutation_bone_rare_1",
        "name": "岩王脊",
        "part": "bone",
        "state": "rare",
        "description": "效果：护盾存量不低于最大 HP 的 8% 时，双防 +12%。 负面：速度属性 -3%",
        "effect": {
            "physicalDefensePct": 8,
            "magicDefensePct": 8
        },
        "negativeEffect": {
            "speedPct": -3
        }
    },
    {
        "code": "mutation_bone_rare_2",
        "name": "月弓锁骨",
        "part": "bone",
        "state": "rare",
        "description": "效果：夜间暴击伤害 +15%。 负面：白昼命中属性 -3%",
        "effect": {
            "damageBonusPct": 15
        },
        "negativeEffect": {
            "accuracyPct": -3
        }
    },
    {
        "code": "mutation_bone_rare_3",
        "name": "云阶足骨",
        "part": "bone",
        "state": "rare",
        "description": "效果：本场首次受到敌方直接伤害后，速度属性 +10%（每战一次）。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_bone_rare_4",
        "name": "根锚盆骨",
        "part": "bone",
        "state": "rare",
        "description": "效果：盾被击破时，以最后一次实际吸收量的 15% 重建自身护盾。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_bone_rare_5",
        "name": "雷鸣指骨",
        "part": "bone",
        "state": "rare",
        "description": "效果：暴击造成的有效伤害的 2% 回复自身 MP。 负面：暴击属性 -3%",
        "effect": {},
        "negativeEffect": {
            "critRatePct": -3
        }
    },
    {
        "code": "mutation_bone_rare_6",
        "name": "古兽髓",
        "part": "bone",
        "state": "rare",
        "description": "效果：存活敌方单位多于己方时，双攻 +10%。 负面：无",
        "effect": {
            "physicalAttackPct": 10,
            "magicAttackPct": 10
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_stable_1",
        "name": "菌群胃囊",
        "part": "organ",
        "state": "stable",
        "description": "效果：PvE 普通材料产物价值的 5% 累计转成可选普通恢复品。 负面：无",
        "effect": {
            "dropBonusPct": 5
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_stable_2",
        "name": "节律肝叶",
        "part": "organ",
        "state": "stable",
        "description": "效果：本场已经用过的同代码恢复品，回复效果 +10%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_stable_3",
        "name": "净化肾囊",
        "part": "organ",
        "state": "stable",
        "description": "效果：中毒时使用的 HP 恢复品，效果 +18%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_stable_4",
        "name": "储蜜腺",
        "part": "organ",
        "state": "stable",
        "description": "效果：成功采矿后，恢复自身 4% 最大 HP。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_stable_5",
        "name": "余温胃",
        "part": "organ",
        "state": "stable",
        "description": "效果：恢复品造成的溢出治疗，30% 转成自身护盾。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_stable_6",
        "name": "滤毒胆囊",
        "part": "organ",
        "state": "stable",
        "description": "效果：普通中毒判定中，自身抵抗属性提高 20%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_stable_7",
        "name": "共生腔",
        "part": "organ",
        "state": "stable",
        "description": "效果：其他玩家或参战伙伴给予自己的治疗效果 +8%。 负面：无",
        "effect": {
            "healingBonusPct": 8
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_stable_8",
        "name": "回流肠道",
        "part": "organ",
        "state": "stable",
        "description": "效果：技能完成施放后，返还实际支付 MP 的 5%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_stable_9",
        "name": "硬化脾",
        "part": "organ",
        "state": "stable",
        "description": "效果：最大生命 +5%。 负面：无",
        "effect": {
            "hpPct": 5
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_stable_10",
        "name": "星盐腺",
        "part": "organ",
        "state": "stable",
        "description": "效果：夜间 MP 恢复品效果 +15%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_stable_11",
        "name": "灵酶胃",
        "part": "organ",
        "state": "stable",
        "description": "效果：进化注射时，普通材料需求减少 1 份，最低消耗 1 份。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_stable_12",
        "name": "潮汐肾",
        "part": "organ",
        "state": "stable",
        "description": "效果：雨天受到的有效治疗量的 10% 回复自身 MP。 负面：无",
        "effect": {
            "healingBonusPct": 10
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_stable_13",
        "name": "养分回收",
        "part": "organ",
        "state": "stable",
        "description": "效果：PvE 战斗胜利时，普通材料数量 +5%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_stable_14",
        "name": "安眠腺",
        "part": "organ",
        "state": "stable",
        "description": "效果：观察委托完成时，普通材料数量 +5%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_stable_15",
        "name": "代谢阀门",
        "part": "organ",
        "state": "stable",
        "description": "效果：使用 HP／MP 恢复品时，实际溢出部分的 20% 转为另一项资源；不返还道具。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_deviation_1",
        "name": "饥渴代谢",
        "part": "organ",
        "state": "deviation",
        "description": "效果：已装备任意普通恢复品快捷槽时，双攻 +5%。 负面：恢复品回复效果 -3%",
        "effect": {
            "physicalAttackPct": 5,
            "magicAttackPct": 5
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_deviation_2",
        "name": "反酸",
        "part": "organ",
        "state": "deviation",
        "description": "效果：HP 恢复品效果 +8%。 负面：技能带来的有效受疗 -3%",
        "effect": {},
        "negativeEffect": {
            "healingReceivedPct": -3
        }
    },
    {
        "code": "mutation_organ_deviation_3",
        "name": "菌群争鸣",
        "part": "organ",
        "state": "deviation",
        "description": "效果：成功采矿并获得普通产物时，恢复 5% 最大 MP。 负面：采矿原资源消耗 +3%",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_deviation_4",
        "name": "代谢过速",
        "part": "organ",
        "state": "deviation",
        "description": "效果：MP 恢复品效果 +8%。 负面：技能耗魔 +3%",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_deviation_5",
        "name": "排异反应",
        "part": "organ",
        "state": "deviation",
        "description": "效果：本场尚未使用过的恢复品，效果 +15%。 负面：重复使用同代码恢复品时效果 -3%",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_deviation_6",
        "name": "盐渍化",
        "part": "organ",
        "state": "deviation",
        "description": "效果：雨天受到的水属性伤害降低 20%。 负面：雨天 MP 回复 -3%",
        "effect": {
            "damageReductionPct": 20
        },
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_deviation_7",
        "name": "共生饥饿",
        "part": "organ",
        "state": "deviation",
        "description": "效果：指定一名实际参战伙伴，主人给予它的护盾量增加 15%。 负面：给该伙伴施加护盾时额外扣本次原耗魔量 3% 的 HP",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_deviation_8",
        "name": "胆汁逆流",
        "part": "organ",
        "state": "deviation",
        "description": "效果：被暴击时，原暴击额外伤害的 10% 回复自身 MP。 负面：MP 恢复品效果 -3%",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_deviation_9",
        "name": "梦食",
        "part": "organ",
        "state": "deviation",
        "description": "效果：生命不高于 30% 时，恢复品效果 +18%。 负面：来自技能的受疗 -3%",
        "effect": {},
        "negativeEffect": {
            "healingReceivedPct": -3
        }
    },
    {
        "code": "mutation_organ_rare_1",
        "name": "根须胃",
        "part": "organ",
        "state": "rare",
        "description": "效果：PvE 战斗胜利且获得普通材料时，额外获得 1 个稳定介质；每场最多 1 个、每个业务日最多 2 个。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_rare_2",
        "name": "潮汐囊",
        "part": "organ",
        "state": "rare",
        "description": "效果：将原溢出治疗的 20% 储成下一战 MP，最多 5% 最大 MP，每战储存并兑现一份。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_rare_3",
        "name": "星尘肝",
        "part": "organ",
        "state": "rare",
        "description": "效果：夜间领取观察委托，普通材料奖励 +10%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_rare_4",
        "name": "晶核脾",
        "part": "organ",
        "state": "rare",
        "description": "效果：精英或首领战斗胜利时，额外获得 1 个活性样本。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_rare_5",
        "name": "群居肠",
        "part": "organ",
        "state": "rare",
        "description": "效果：组队观察委托完成时，普通奖励数量 +8%。 负面：无",
        "effect": {},
        "negativeEffect": {}
    },
    {
        "code": "mutation_organ_rare_6",
        "name": "逆熵腺",
        "part": "organ",
        "state": "rare",
        "description": "效果：返还一次实际稳定处理消耗的稳定介质，每角色只触发一次。 负面：无",
        "effect": {},
        "negativeEffect": {}
    }
];
const mutationByCode = new Map(mutationCatalog.map(item => [item.code, item]));
const negativeEffectFromText = (text) => {
    const match = text.match(/负面：(.+)$/);
    const raw = match?.[1] ?? '';
    if (!raw || raw === '无')
        return {};
    const number = Number((raw.match(/[+＋-]?(\d+(?:\.\d+)?)%/) ?? [])[1]);
    if (!Number.isFinite(number))
        return {};
    const value = -Math.abs(number);
    if (raw.includes('双攻'))
        return { physicalAttackPct: value, magicAttackPct: value };
    if (raw.includes('双防'))
        return { physicalDefensePct: value, magicDefensePct: value };
    if (raw.includes('最大生命') || raw.includes('最大 HP'))
        return { hpPct: value };
    if (raw.includes('最大魔力'))
        return { mpPct: value };
    if (raw.includes('对非主目标造成伤害'))
        return { damageBonusPct: value };
    if (raw.includes('受到伤害') || raw.includes('所受伤害') || raw.includes('受伤') || raw.includes('对自己的伤害') || raw.includes('对自身伤害'))
        return { damageReductionPct: value };
    if (raw.includes('伤害') && !raw.includes('命中'))
        return { damageReductionPct: value };
    if (raw.includes('受到治疗') || raw.includes('受疗'))
        return { healingReceivedPct: value };
    if (raw.includes('恢复品') || raw.includes('恢复效果') || raw.includes('道具恢复') || raw.includes('回复'))
        return { recoveryEffectPct: value };
    if (raw.includes('采矿原资源消耗'))
        return { miningCostPct: value };
    if (raw.includes('外来数值增益'))
        return { externalBonusPct: value };
    if (raw.includes('命中'))
        return { accuracyPct: value };
    if (raw.includes('闪避'))
        return { evasionPct: value };
    if (raw.includes('速度'))
        return { speedPct: value };
    if (raw.includes('韧性'))
        return { tenacityPct: value };
    if (raw.includes('暴击伤害'))
        return { critDamagePct: value };
    if (raw.includes('暴击'))
        return { critRatePct: value };
    if (raw.includes('耗魔'))
        return { manaCostReductionPct: value };
    return {};
};
for (const item of mutationCatalog)
    item.negativeEffect = negativeEffectFromText(item.description);
const staticEffectOverrides = {
    mutation_nerve_deviation_8: { critDamagePct: 8 },
    mutation_bone_stable_12: { critDamagePct: 5 }
};
for (const item of mutationCatalog)
    if (staticEffectOverrides[item.code])
        item.effect = staticEffectOverrides[item.code];
const dynamicDamageMutationCodes = new Set([
    'mutation_eye_stable_1', 'mutation_eye_stable_13', 'mutation_eye_deviation_7', 'mutation_eye_deviation_9', 'mutation_eye_rare_3',
    'mutation_nerve_stable_5', 'mutation_nerve_stable_10', 'mutation_nerve_deviation_2',
    'mutation_bone_stable_14', 'mutation_bone_deviation_1', 'mutation_bone_deviation_9', 'mutation_chest_rare_3'
]);
const dynamicDamageReductionMutationCodes = new Set([
    'mutation_chest_deviation_1', 'mutation_skin_rare_4', 'mutation_skin_rare_6', 'mutation_nerve_stable_15'
]);

export { dynamicDamageMutationCodes, dynamicDamageReductionMutationCodes, mutationByCode, mutationCatalog };
