// 按有效Boss遭遇编目，不包括剧情角色、王庭随从与无正式入口的旧模板。
export const bossAchievementFlavours:Record<string,Record<string,{name:string;description:string}>> = {
  "rootcrown_ram": {
    "ordinary": {
      "name": "请勿践踏冒险者",
      "description": "草地上的告示，终于换了一个收件人。"
    },
    "powerful": {
      "name": "今天不顶班",
      "description": "它很有冲劲，可惜方向需要重新考虑。"
    },
    "heroic": {
      "name": "角逐冠军",
      "description": "颁奖台只够站一个，羊角算违章加盖。"
    },
    "infernal": {
      "name": "根须够不到的地方",
      "description": "它把根扎得很深，你仍找到了天空。"
    },
    "abyssal": {
      "name": "烤全羊只是传闻",
      "description": "火已经备好，故事却没有按菜谱发展。"
    },
    "crimson": {
      "name": "红角不等于红灯",
      "description": "它以为那是警告，你把它当作了终点。"
    },
    "corrupted": {
      "name": "病树前头",
      "description": "旧根盘踞的地方，终于容得下一株新芽。"
    },
    "holy": {
      "name": "羊也有失蹄时",
      "description": "顶着光环，仍须看路。"
    },
    "golden": {
      "name": "金角不保值",
      "description": "森林没有交易所，王冠也没有保底价。"
    },
    "brilliant": {
      "name": "请把远光关掉",
      "description": "那对角太耀眼，以至于看不见脚下。"
    },
    "dreamlike": {
      "name": "羊群之外的醒者",
      "description": "数到最后一只羊时，你没有睡着。"
    },
    "fixed": {
      "name": "这片草归风了",
      "description": "没有角抵着的清晨，连草也敢抬头。"
    }
  },
  "forest_slime": {
    "ordinary": {
      "name": "果冻不接受道歉",
      "description": "它晃了很久，最后还是没能把道理晃明白。"
    },
    "powerful": {
      "name": "弹性有待商榷",
      "description": "生活教会它反弹，你教会它落地。"
    },
    "heroic": {
      "name": "软实力到此为止",
      "description": "森林第一次发现，软也可以是一种逞强。"
    },
    "infernal": {
      "name": "深绿处的句号",
      "description": "林荫把声音吞下，你留下了最后一笔。"
    },
    "abyssal": {
      "name": "请勿高温存放",
      "description": "包装上没有写的事，森林替它记住了。"
    },
    "crimson": {
      "name": "草莓味是误会",
      "description": "颜色不能证明配方，勇气也不能代替常识。"
    },
    "corrupted": {
      "name": "保质期的尽头",
      "description": "不是所有长满绿色的东西，都还活着。"
    },
    "holy": {
      "name": "圣水也会凝固",
      "description": "被祝福过的弹性，仍有自己的极限。"
    },
    "golden": {
      "name": "这不是翡翠",
      "description": "珠宝商没有来，你也没打算等。"
    },
    "brilliant": {
      "name": "一地碎光",
      "description": "树叶漏下的阳光，终于不用再绕过它。"
    },
    "dreamlike": {
      "name": "梦见一口森林",
      "description": "醒来后，嘴里只剩青草与胜利的气息。"
    },
    "fixed": {
      "name": "森林恢复松软",
      "description": "路重新能走，脚步不再需要征求果冻同意。"
    }
  },
  "black_slime": {
    "ordinary": {
      "name": "墨水用完了",
      "description": "黑夜想多写几行，你提前合上了笔盖。"
    },
    "powerful": {
      "name": "黑得很有分量",
      "description": "影子也会沉，尤其在它不肯让路的时候。"
    },
    "heroic": {
      "name": "不粘锅理论",
      "description": "谁也没带锅，但这场争论总算结束了。"
    },
    "infernal": {
      "name": "比黑更深的沉默",
      "description": "深处没有回应，因为你已问到最后。"
    },
    "abyssal": {
      "name": "焦糖不是这个色",
      "description": "厨师拒绝签字，冒险者负责善后。"
    },
    "crimson": {
      "name": "红与黑的退稿",
      "description": "两种颜色争了很久，纸最终留给了黎明。"
    },
    "corrupted": {
      "name": "墨池换水",
      "description": "沉积太久的东西，不能永远叫作传统。"
    },
    "holy": {
      "name": "白光照不到的脾气",
      "description": "它拒绝变白，你也没打算替它漂洗。"
    },
    "golden": {
      "name": "黑金谢绝炒作",
      "description": "罕见并不自动等于值得收藏。"
    },
    "brilliant": {
      "name": "反光不代表前途",
      "description": "它曾亮得像答案，落地后仍是一团疑问。"
    },
    "dreamlike": {
      "name": "今晚不用留灯",
      "description": "床底下的黑暗，已经知道你的名字。"
    },
    "fixed": {
      "name": "留白也是结局",
      "description": "那团最浓的墨散去，世界多出一小块空白。"
    }
  },
  "dawntide_crocodile": {
    "ordinary": {
      "name": "清晨禁止张嘴",
      "description": "河岸终于能说话，不必先数对面的牙。"
    },
    "powerful": {
      "name": "皮厚不是理由",
      "description": "它的防线很长，你的意见很明确。"
    },
    "heroic": {
      "name": "岸上不设王座",
      "description": "离开水面以后，称号需要重新审核。"
    },
    "infernal": {
      "name": "深水暂停营业",
      "description": "那张常年开着的嘴，今天挂上了歇业牌。"
    },
    "abyssal": {
      "name": "沸水不留客",
      "description": "河道滚烫，你还是把路走了回来。"
    },
    "crimson": {
      "name": "血潮退订",
      "description": "它送来的晨报太红，你拒绝续费。"
    },
    "corrupted": {
      "name": "旧鳞落尽",
      "description": "水会记住伤口，也会学着洗净它。"
    },
    "holy": {
      "name": "河神请排队",
      "description": "今天的通行权，不归最亮的鳞片。"
    },
    "golden": {
      "name": "镀金牙医",
      "description": "没有预约，也没人愿意留在诊室。"
    },
    "brilliant": {
      "name": "晨光不必借鳞",
      "description": "太阳升起以后，河面自己会亮。"
    },
    "dreamlike": {
      "name": "梦渡无牙河",
      "description": "船还没来，你已不必害怕对岸。"
    },
    "fixed": {
      "name": "潮来它不来",
      "description": "渔人照常出门，少问了一句天气以外的话。"
    }
  },
  "shadow_wolf_king": {
    "ordinary": {
      "name": "月下少一声",
      "description": "山谷没变小，只是回声终于不那么拥挤。"
    },
    "powerful": {
      "name": "犬科谢绝大声",
      "description": "嗓门能传很远，未必能传到胜利那边。"
    },
    "heroic": {
      "name": "头狼也需让行",
      "description": "路权没有写在獠牙上。"
    },
    "infernal": {
      "name": "回声找不到主人",
      "description": "你向深处走时，那声长嚎开始退后。"
    },
    "abyssal": {
      "name": "冥犬今天休假",
      "description": "地狱少了一位门卫，月亮没有追问。"
    },
    "crimson": {
      "name": "红月不是饭点",
      "description": "它以为夜色已经摆好餐桌。"
    },
    "corrupted": {
      "name": "狼顾之后",
      "description": "它身后有太多阴影，你让森林看见了空处。"
    },
    "holy": {
      "name": "月光不封王",
      "description": "被照亮的獠牙，并没有比别的更高贵。"
    },
    "golden": {
      "name": "金牙不包终身",
      "description": "山里没有售后，只有继续向前的脚印。"
    },
    "brilliant": {
      "name": "群星不随嚎",
      "description": "它喊得再响，天上的座次也没有改变。"
    },
    "dreamlike": {
      "name": "月亮不再替它圆谎",
      "description": "梦中的狼影散去，月色第一次没有藏起牙印。"
    },
    "fixed": {
      "name": "晚安不必低声",
      "description": "营火旁的人，终于敢把最后一句话说完。"
    }
  },
  "shattertide_crab": {
    "ordinary": {
      "name": "横着走到头了",
      "description": "海岸很宽，也不是每一步都归它管。"
    },
    "powerful": {
      "name": "钳制关系解除",
      "description": "你不喜欢这份握手礼，它终于松开了。"
    },
    "heroic": {
      "name": "八条腿也赶不上",
      "description": "路很多，结局却只有一个。"
    },
    "infernal": {
      "name": "海底不讲横理",
      "description": "潮声再大，也盖不过落锤的那一下。"
    },
    "abyssal": {
      "name": "蒸汽不等于开席",
      "description": "岸边的人拿来盘子，你让他们先拿担架。"
    },
    "crimson": {
      "name": "红壳未必熟了",
      "description": "颜色不能替勇气验明正身。"
    },
    "corrupted": {
      "name": "换壳之前",
      "description": "有些旧东西，海水冲了很久也没冲掉。"
    },
    "holy": {
      "name": "圣钳请松手",
      "description": "祝福不是扣住整片海岸的许可证。"
    },
    "golden": {
      "name": "金壳不带找零",
      "description": "你付出的不是钱，它还不了。"
    },
    "brilliant": {
      "name": "沙滩停止闪烁",
      "description": "终于能看清脚印，而不是满地的炫耀。"
    },
    "dreamlike": {
      "name": "梦里也要直着走",
      "description": "那条弯了太久的海岸线，在你脚下松开了。"
    },
    "fixed": {
      "name": "潮水收回钳印",
      "description": "明天的沙滩，不必记得每一道威胁。"
    }
  },
  "death_knight": {
    "ordinary": {
      "name": "下马谈谈",
      "description": "它迟到了很多年，这次总算赴了最后一场约。"
    },
    "powerful": {
      "name": "铠甲里的空响",
      "description": "声音很重，回答却轻得像一阵风。"
    },
    "heroic": {
      "name": "骑士资格复审",
      "description": "誓言没有过期，持有者需要重新签名。"
    },
    "infernal": {
      "name": "马蹄停在深处",
      "description": "那条通往黑暗的路，终于少了一位熟客。"
    },
    "abyssal": {
      "name": "不再替地狱赶路",
      "description": "马卸下看不见的缰，火也没能叫它回头。"
    },
    "crimson": {
      "name": "赤誓到期",
      "description": "血写下的契约，也有最后一页。"
    },
    "corrupted": {
      "name": "锈不是勋章",
      "description": "时间替他穿上了许多层，你一层层问到沉默。"
    },
    "holy": {
      "name": "请归还那道光",
      "description": "借来的圣洁，终究照不亮空的胸膛。"
    },
    "golden": {
      "name": "金甲不抵旧债",
      "description": "铠甲可以重铸，欠下的告别不能。"
    },
    "brilliant": {
      "name": "荣光需要呼吸",
      "description": "它亮得像凯旋，却没有人能在里面欢呼。"
    },
    "dreamlike": {
      "name": "梦醒卸甲",
      "description": "有人终于可以不再骑着昨天赶路。"
    },
    "fixed": {
      "name": "最后一次下马",
      "description": "路边没有授勋的人，只有等了很久的安静。"
    }
  },
  "skeleton_general": {
    "ordinary": {
      "name": "骨干也要休息",
      "description": "它带的队伍很硬，假条却一直没批下来。"
    },
    "powerful": {
      "name": "硬仗硬着打",
      "description": "双方都没退让，只有一方还能完整地点头。"
    },
    "heroic": {
      "name": "将军的散会令",
      "description": "最后一声号令，终于没人需要执行。"
    },
    "infernal": {
      "name": "深处不再点兵",
      "description": "黑暗翻遍名册，也没等到那声应到。"
    },
    "abyssal": {
      "name": "白骨不添柴",
      "description": "火想留下它，你替它拒绝了。"
    },
    "crimson": {
      "name": "军旗无需染红",
      "description": "风把旗吹开，里面不必再裹着旧命令。"
    },
    "corrupted": {
      "name": "朽令作废",
      "description": "不是所有从坟里传来的话，都值得再服从一次。"
    },
    "holy": {
      "name": "圣骨不是豁免证",
      "description": "站得再端正，也不能替昨天免罪。"
    },
    "golden": {
      "name": "镶金不补钙",
      "description": "军需官的建议，从一开始就偏了方向。"
    },
    "brilliant": {
      "name": "阅兵到此结束",
      "description": "满地光芒，没有一根还能立正。"
    },
    "dreamlike": {
      "name": "不必梦回沙场",
      "description": "那双没有眼睛的眼眶，终于不再朝向战线。"
    },
    "fixed": {
      "name": "解甲不归田",
      "description": "他已经没有田可归，好在也不必再出征。"
    }
  },
  "goblin_king": {
    "ordinary": {
      "name": "王冠借我看看",
      "description": "戴上去不一定像国王，摘下来倒轻松许多。"
    },
    "powerful": {
      "name": "陛下请讲道理",
      "description": "他提高了音量，你结束了发言。"
    },
    "heroic": {
      "name": "王的体面退场",
      "description": "没有仪仗队，泥地也算一种红毯。"
    },
    "infernal": {
      "name": "地下王国到期",
      "description": "他统治过很深的黑暗，却没管住最后一口气。"
    },
    "abyssal": {
      "name": "王座不耐高温",
      "description": "传位诏书还没写完，扶手已经不够结实。"
    },
    "crimson": {
      "name": "朱批退回",
      "description": "写得再红，也不能命令胜负改口。"
    },
    "corrupted": {
      "name": "国库里长蘑菇",
      "description": "腐烂的不只是粮食，还有不肯开门的王座。"
    },
    "holy": {
      "name": "天授之权待核验",
      "description": "天空从未签过那份任命书。"
    },
    "golden": {
      "name": "王冠按克算",
      "description": "摘下来以后，工匠终于敢说实话。"
    },
    "brilliant": {
      "name": "陛下有点晃眼",
      "description": "臣民低头多年，今天总算能看看路。"
    },
    "dreamlike": {
      "name": "醒来没有臣民",
      "description": "梦里的万岁，没能多借给他一秒。"
    },
    "fixed": {
      "name": "从前有个国王",
      "description": "讲故事的人停在这里，孩子们已经会接下一句。"
    }
  },
  "gruen_mountainheart": {
    "ordinary": {
      "name": "山也会心软",
      "description": "它把沉默藏在岩层里，你听见了裂开的那一声。"
    },
    "powerful": {
      "name": "石头不肯点头",
      "description": "你们谈了很久，最后地面替它作了回答。"
    },
    "heroic": {
      "name": "移山不必搬家",
      "description": "路还是那条路，只是山学会了让开。"
    },
    "infernal": {
      "name": "地底少一声鼓",
      "description": "深处的心跳停了，地上的人终于睡稳。"
    },
    "abyssal": {
      "name": "熔心冷却",
      "description": "炽热不是永远，山也需要一场长眠。"
    },
    "crimson": {
      "name": "山脉不必流血",
      "description": "那道红色裂隙，终于停止模仿伤口。"
    },
    "corrupted": {
      "name": "病山有了风",
      "description": "厚重的壳散开，腐朽第一次无处藏身。"
    },
    "holy": {
      "name": "山神摘下尊号",
      "description": "大地托住所有人，并没有另设贵宾席。"
    },
    "golden": {
      "name": "金矿不等于心脏",
      "description": "挖开闪亮的表面，里面仍有会停下的东西。"
    },
    "brilliant": {
      "name": "石光散尽",
      "description": "星星照回岩壁，山不必自己发光。"
    },
    "dreamlike": {
      "name": "群山梦见平原",
      "description": "一颗执拗的心停下，远方忽然变得宽阔。"
    },
    "fixed": {
      "name": "请让山安静",
      "description": "它不再回答，但风终于能替它说话。"
    }
  },
  "necromancer_uz": {
    "ordinary": {
      "name": "请勿返聘死者",
      "description": "坟上的草比合同诚实，它知道事情已经结束。"
    },
    "powerful": {
      "name": "人手不是这么补的",
      "description": "缺员通知贴了很久，你让它不再招人。"
    },
    "heroic": {
      "name": "续命申请驳回",
      "description": "理由写了三页，签字处只剩一道剑痕。"
    },
    "infernal": {
      "name": "深处停止招魂",
      "description": "有人终于可以不回应自己的名字。"
    },
    "abyssal": {
      "name": "地狱拒收中介",
      "description": "这笔生意两头收费，最后两头都不欢迎。"
    },
    "crimson": {
      "name": "血墨签不了来生",
      "description": "纸可以染红，明天不能伪造。"
    },
    "corrupted": {
      "name": "腐败劳动关系",
      "description": "连骨头都在抱怨，他仍说这是大家庭。"
    },
    "holy": {
      "name": "神迹不含售后",
      "description": "死而复生的承诺，今天不再接受咨询。"
    },
    "golden": {
      "name": "灵魂不收金币",
      "description": "他数了一生的价码，忘了有些门只收沉默。"
    },
    "brilliant": {
      "name": "灯火不替亡者上班",
      "description": "亮得再晚，也不是叫人不许休息的理由。"
    },
    "dreamlike": {
      "name": "亡者终于没梦见他",
      "description": "这一次，惊醒的不是被叫回来的那些人。"
    },
    "fixed": {
      "name": "让名单停在这里",
      "description": "最后一个名字，没有再从纸上站起来。"
    }
  },
  "threehead_mother": {
    "ordinary": {
      "name": "三票也没通过",
      "description": "她们一致同意反对你，你让表决失去了意义。"
    },
    "powerful": {
      "name": "意见大于头数",
      "description": "三张嘴都很坚决，结果还是只写了一份。"
    },
    "heroic": {
      "name": "会议到此结束",
      "description": "谁也没说服谁，但总算不用再同时发言。"
    },
    "infernal": {
      "name": "三声沉入深处",
      "description": "雾里回音少了，归路反而清楚了。"
    },
    "abyssal": {
      "name": "沸沼不留客",
      "description": "三份恶意同锅翻滚，你掀开了最后一层雾。"
    },
    "crimson": {
      "name": "红字联合签名",
      "description": "她们把警告写得很长，你只回了一个句号。"
    },
    "corrupted": {
      "name": "三份坏主意",
      "description": "不是多长一颗头，腐朽就能分摊少一点。"
    },
    "holy": {
      "name": "神谕请逐个说",
      "description": "天意若真有三份，也该允许人听完再答。"
    },
    "golden": {
      "name": "三头不等于三倍赔偿",
      "description": "保险员缺席，这场纠纷由你现场结清。"
    },
    "brilliant": {
      "name": "雾里不再晃眼",
      "description": "三道光都灭了，沼泽终于露出本来的边界。"
    },
    "dreamlike": {
      "name": "梦中蛇不再打结",
      "description": "三个噩梦各有开头，你给了它们同一个结尾。"
    },
    "fixed": {
      "name": "多数服从归途",
      "description": "最后留在雾里的意见，是请你平安走出去。"
    }
  },
  "valk_forge_overseer": {
    "ordinary": {
      "name": "今天准点下班",
      "description": "没人敢先放下工具，于是你先让他放下了。"
    },
    "powerful": {
      "name": "绩效不能当盾",
      "description": "他把指标举得很高，没能挡住最后一下。"
    },
    "heroic": {
      "name": "优秀员工不参评",
      "description": "这份表彰留给炉火，你只替大家开门。"
    },
    "infernal": {
      "name": "地下不算工龄",
      "description": "往下再挖一层，也不会多出一个明天。"
    },
    "abyssal": {
      "name": "熔炉停工通知",
      "description": "这次不是检修，是火终于可以小一点。"
    },
    "crimson": {
      "name": "血汗分开结算",
      "description": "账上写着产量，地上写着代价。"
    },
    "corrupted": {
      "name": "坏掉的不只是机器",
      "description": "润滑油换过许多次，问题一直站在旁边。"
    },
    "holy": {
      "name": "奉神加班不批",
      "description": "天上的光，也不该照着永不熄灭的工牌。"
    },
    "golden": {
      "name": "奖金不抵欠薪",
      "description": "金光耀眼的承诺，终于到了兑现的时候。"
    },
    "brilliant": {
      "name": "厂区禁止强光",
      "description": "它掩得住灰尘，掩不住每一张疲倦的脸。"
    },
    "dreamlike": {
      "name": "梦里没有打卡声",
      "description": "有人睡到自然醒，第一次没有为此道歉。"
    },
    "fixed": {
      "name": "炉火自己会烧",
      "description": "少了一声催促，铁反而听见了自己的温度。"
    }
  },
  "fallingstar_mudid": {
    "ordinary": {
      "name": "落地请签收",
      "description": "天上寄来的东西，地面并不照单全收。"
    },
    "powerful": {
      "name": "重力不包退货",
      "description": "它落得很有气势，你处理得很有耐心。"
    },
    "heroic": {
      "name": "星坠也要排队",
      "description": "再远的来处，也不能插在活人的归途前面。"
    },
    "infernal": {
      "name": "天外来客失联",
      "description": "深处收不到回信，你也不必再等它解释。"
    },
    "abyssal": {
      "name": "烧不回天上",
      "description": "火越旺，泥土越清楚自己属于哪里。"
    },
    "crimson": {
      "name": "红星不是许愿灯",
      "description": "你许下的不是愿望，是让今夜到此为止。"
    },
    "corrupted": {
      "name": "星尘也会发霉",
      "description": "远道而来，并不能免去时间的检查。"
    },
    "holy": {
      "name": "天降不等于天命",
      "description": "抬头看见的东西，不必跪着接受。"
    },
    "golden": {
      "name": "陨石不按克崇拜",
      "description": "估价可以交给商人，敬畏不必。"
    },
    "brilliant": {
      "name": "把星光还回去",
      "description": "它把夜空穿在身上，你让天上重新完整。"
    },
    "dreamlike": {
      "name": "流星梦见回程",
      "description": "它曾以为落下就是结局，你替它打开了另一页。"
    },
    "fixed": {
      "name": "泥土接住了星星",
      "description": "这次坠落没有巨响，只剩大地慢慢合拢。"
    }
  },
  "frostking_whiteantler": {
    "ordinary": {
      "name": "角上还挂着冬天",
      "description": "你经过以后，枝头终于敢有别的季节。"
    },
    "powerful": {
      "name": "霜期到此截止",
      "description": "寒冷擅长拖延，你替春天写下了日期。"
    },
    "heroic": {
      "name": "白王请卸冕",
      "description": "雪落在谁头上，都不会自动成为王冠。"
    },
    "infernal": {
      "name": "冰下有了回声",
      "description": "沉默封得再厚，也没能把你的脚步冻住。"
    },
    "abyssal": {
      "name": "冷火烧完之前",
      "description": "那场不肯熄灭的冬天，终于失去了燃料。"
    },
    "crimson": {
      "name": "雪不必学会红",
      "description": "白色已经能记住许多事，不必再添一种。"
    },
    "corrupted": {
      "name": "冻住不等于保鲜",
      "description": "藏在严寒里的旧伤，仍然需要结束。"
    },
    "holy": {
      "name": "圣雪也会化",
      "description": "祝福没有答应替冬天永远守门。"
    },
    "golden": {
      "name": "金角不换春天",
      "description": "季节不收赎金，只认离去的脚步。"
    },
    "brilliant": {
      "name": "雪盲之后",
      "description": "光芒退去时，你看见远方正慢慢变绿。"
    },
    "dreamlike": {
      "name": "鹿梦尽处是春山",
      "description": "那对角走出梦境，再也带不走整场冬天。"
    },
    "fixed": {
      "name": "迟来的融雪",
      "description": "山溪恢复声音，比任何加冕都更像庆典。"
    }
  },
  "askr_stormroc": {
    "ordinary": {
      "name": "天空不是私产",
      "description": "它画过许多盘旋的圈，没有一个算地契。"
    },
    "powerful": {
      "name": "大风请系好自己",
      "description": "翅膀很宽，也不是每次都能替傲慢兜底。"
    },
    "heroic": {
      "name": "高处允许别人来",
      "description": "它守着高度，你证明了那不是身份。"
    },
    "infernal": {
      "name": "逆风没有尽头",
      "description": "你没有等风停，风先等到了你的回答。"
    },
    "abyssal": {
      "name": "雷火不签通行证",
      "description": "天再坏，也不能替它决定谁该留下。"
    },
    "crimson": {
      "name": "血羽不改航线",
      "description": "那片红色飘下来时，你仍朝着自己的方向。"
    },
    "corrupted": {
      "name": "病风停在翼下",
      "description": "天空终于不用把腐朽带去下一个村庄。"
    },
    "holy": {
      "name": "神鹰也有落点",
      "description": "离地再远，影子仍得向大地报到。"
    },
    "golden": {
      "name": "金羽不抵航费",
      "description": "这趟旅程的代价，它到落地时才算明白。"
    },
    "brilliant": {
      "name": "闪电不抢镜",
      "description": "最后留在眼前的，是没有低头的那个人。"
    },
    "dreamlike": {
      "name": "梦里不再失重",
      "description": "云层散开，你终于握住自己的落点。"
    },
    "fixed": {
      "name": "风暴请走正门",
      "description": "天空安静以后，屋檐第一次没替人发抖。"
    }
  },
  "seles_eclipse_watcher": {
    "ordinary": {
      "name": "守望也有盲点",
      "description": "它看了月亮很久，忘了地上也有人走来。"
    },
    "powerful": {
      "name": "月蚀不必延期",
      "description": "夜色已经足够长，你替黎明催了一次场。"
    },
    "heroic": {
      "name": "长夜不是王座",
      "description": "站得久，不代表世界该永远停在这一页。"
    },
    "infernal": {
      "name": "深夜有人回信",
      "description": "那束投向虚无的目光，终于遇到了回答。"
    },
    "abyssal": {
      "name": "月背不留余火",
      "description": "烧过整场黑夜的执念，没能烧掉归途。"
    },
    "crimson": {
      "name": "红月不收祭品",
      "description": "你带来的不是献礼，是一份不肯签字的拒绝。"
    },
    "corrupted": {
      "name": "旧月洗去阴翳",
      "description": "有些黑暗贴得太久，连守望者都当它是皮肤。"
    },
    "holy": {
      "name": "神圣也有背面",
      "description": "你绕过光环，见到了它不愿被看见的地方。"
    },
    "golden": {
      "name": "金月不能买天明",
      "description": "夜色没有标价，黎明也不接受独占。"
    },
    "brilliant": {
      "name": "群星终于有座位",
      "description": "那道过分耀眼的目光，终于不再挡住整片天。"
    },
    "dreamlike": {
      "name": "月蚀之外还有醒来",
      "description": "它守住了梦的边缘，你带走了清晨。"
    },
    "fixed": {
      "name": "守望者先闭眼",
      "description": "月亮继续走，终于不必向谁解释自己的圆缺。"
    }
  }
};
