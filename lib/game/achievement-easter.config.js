const easterAchievementDefinitions = [
    {
        "id": "ACH_EGG01",
        "name": "你怎么又来了",
        "description": "门口的怪物已经认识你，连开场白都懒得换了。",
        "rarity": "稀有",
        "attribute": "体质+5",
        "condition": "同一生涯独自挑战同一正式敌人生命实例，连续10场真实战败；每场须受到实际伤害并HP归零，换敌、胜利或撤退打断，重复结算不计。",
        "scope": "场",
        "dependency": "现",
        "category": "秘闻"
    },
    {
        "id": "ACH_EGG02",
        "name": "这次轮到你了",
        "description": "它准备好了第十句嘲笑，你没让它说完。",
        "rarity": "稀有",
        "attribute": "精神+5",
        "condition": "同一生涯独自连续败于同一正式敌人生命实例至少9场后，在下一场独自有效击败该实例；换敌、其他胜利或撤退打断。",
        "scope": "场",
        "dependency": "现",
        "category": "秘闻"
    },
    {
        "id": "ACH_EGG03",
        "name": "血条只是装饰",
        "description": "旁人以为那是空的，只有你知道还剩一个数字。",
        "rarity": "传说",
        "attribute": "感知+8",
        "condition": "无其他玩家或NPC队友，独自有效击败至少同级的正式Boss，胜利时恰好剩1点HP。",
        "scope": "场",
        "dependency": "现",
        "category": "秘闻"
    },
    {
        "id": "ACH_EGG04",
        "name": "彩虹不是天气",
        "description": "它抬头看了看天，终于明白今天不会下雨。",
        "rarity": "史诗",
        "attribute": "智力+12",
        "condition": "同一场至少同级正式Boss胜利中，本人实际造成至少6种不同非无属性元素伤害；光看特效、未命中或零伤害不计。",
        "scope": "场",
        "dependency": "现",
        "category": "秘闻"
    },
    {
        "id": "ACH_EGG05",
        "name": "全员拒绝躺平",
        "description": "担架准备了三副，最后一副也没借出去。",
        "rarity": "传说",
        "attribute": "敏捷+8",
        "condition": "至少3名玩家且无NPC队友共同击败不低于全队最高等级的正式Boss；所有人均有有效贡献并存活，结算时每人HP均不超过最大HP的10%。",
        "scope": "场",
        "dependency": "现",
        "category": "秘闻"
    },
    {
        "id": "ACH_EGG06",
        "name": "这盾售后很忙",
        "description": "保修单上写着正常使用，你认真想了想，还是没填。",
        "rarity": "稀有",
        "attribute": "力量+5",
        "condition": "无其他玩家或NPC队友，独自有效击败至少同级正式Boss；该场本人承受至少30次有效敌方命中（包括实际吸收伤害的护盾命中）并存活。",
        "scope": "场",
        "dependency": "现",
        "category": "秘闻"
    },
    {
        "id": "ACH_EGG07",
        "name": "房顶比配方先熟",
        "description": "配方还没记住，邻居已经学会了提前关窗。",
        "rarity": "稀有",
        "attribute": "体质+5",
        "condition": "个人三槽炼金累计10次实际炸炉；必须整单失败且系统判定炸炉。普通失败、代工、取消与重复请求不计。",
        "scope": "账",
        "dependency": "现",
        "category": "秘闻"
    },
    {
        "id": "ACH_EGG08",
        "name": "运气开始收费",
        "description": "你把偶然做成了惯例，命运正在重新报价。",
        "rarity": "稀有",
        "attribute": "精神+5",
        "condition": "个人三槽炼金累计50批大成功；按实际大成功批数计，额外产物不增加次数，代工不计。",
        "scope": "账",
        "dependency": "现",
        "category": "秘闻"
    },
    {
        "id": "ACH_EGG09",
        "name": "配方拒绝署名",
        "description": "笔记上的每一行，都曾坚称自己绝不可能。",
        "rarity": "稀有",
        "attribute": "智力+5",
        "condition": "个人三槽炼金成功完成30种不同槽位配方；按主材、辅材、催化剂物品编号及顺序去重，数量变化不算新配方，代工不计。",
        "scope": "账",
        "dependency": "现",
        "category": "秘闻"
    },
    {
        "id": "ACH_EGG10",
        "name": "请把剑寄存在门口",
        "description": "你学会了十二种问候，其中没有一种需要出鞘。",
        "rarity": "稀有",
        "attribute": "感知+5",
        "condition": "本人作为操作交涉者，成功和平结算12种不同怪物模板；同种怪物重复不计，仅开启对话、赠礼未成功及队友旁观不计。",
        "scope": "账",
        "dependency": "现",
        "category": "秘闻"
    },
    {
        "id": "ACH_EGG11",
        "name": "万物皆有螺丝",
        "description": "有些东西本来没有，你拆完以后就说不准了。",
        "rarity": "稀有",
        "attribute": "力量+5",
        "condition": "个人解构30种不同物品定义且每种至少一次实际得到产物；构造物回拆、代工、零产物不计，重复同种物品不计。",
        "scope": "账",
        "dependency": "现",
        "category": "秘闻"
    },
    {
        "id": "ACH_EGG12",
        "name": "地皮有话要说",
        "description": "这片土地终于发现，你低头并不是为了认路。",
        "rarity": "稀有",
        "attribute": "敏捷+5",
        "condition": "累计实际完成1000处不同出生实例的资源采集并得到产物；采集中、取消、已被采走及重复领取不计。",
        "scope": "账",
        "dependency": "现",
        "category": "秘闻"
    }
];

export { easterAchievementDefinitions };
