import { generatedOpeningRoutes } from './opening-content.generated';
import { generatedSevenOpeningRoutes } from './opening-seven.generated';
import { finalOpeningRewrites } from './opening-rewrites-final.config';
import { openingExpandedLesson, openingNarrativeExpansions } from './opening-narrative-expanded.config';
import { applyOpeningRewardPolicy } from './opening-reward-policy';
import { retainOpeningRoute } from './opening-retained.config';
import { polishRetainedOpening } from './opening-prose-polish.config';
import type { OpeningChoice, OpeningRoute } from './opening.types';
export { talentDefinitions } from './talent.config';

const forestChoice = (code: 'A' | 'B', label: string, text: string, quest: string, task: string, rewardName: string, pack?: string): OpeningChoice => ({ code, label, pages: [{ title: quest, text }], quest, task, rewardCode: '', rewardName, rewardUse: '初行的支持', future: quest, farewell: '', pack });
const forestRoutes: OpeningRoute[] = [
  { code: 'F01', version: 3, region: 'dark_forest', destination: 'baina_town', title: '金光尚未熄灭',
    moveEntry: '你顺着林间较干的路寻找出口，灌木下忽然漏出一点不该属于晨光的金色。你停下来，听见极轻的喘息。',
    huntEntry: '你拨开压低的草叶，辨认泥里的细小脚印。脚印凌乱地停在树根旁，一团微弱金光随呼吸起伏。',
    pages: [{ title: '草窝里的金光', text: '一只兔子蜷在草窝里，皮毛间流着淡淡的金光。它想撑起身体，前爪却在湿泥里滑了一下，重新倒回去。\n\n它的目光追着你腰间的口粮袋，鼻尖轻轻抽动。你摸到袋子里最后一块干粮，自己也已经有些饿了。\n\n兔子没有扑上来，只将脑袋低下，像是连讨食的力气也快没有了。' }],
    choices: [forestChoice('A', '把最后的口粮喂给它', '你掰下一小块干粮，托到兔子嘴边。它吃得很慢，每咽下一口，皮毛间的金光便稳住一点。\n\n等最后一点面包也吃完，它颤巍巍站起来，先蹭了蹭你的指尖，又回头叼住空口粮袋，认真放回你脚边。\n\n它没有跑远。你走一步，它便跟一步；你停下，它也停下，仰着鼻尖，像在确认这次不会被丢下。', '金色的小小旅伴', '在公会兽栏用免费饲料照料黄金兔', '黄金兔'),
      forestChoice('B', '出手砍下去', '你握紧短杖，向草窝中的金光挥下。\n\n金光骤然散开，草窝里再没有柔软的身影。几枚细小的光片相互扣合，化作一只沉甸甸的黄金宝箱，箱角压住了湿草。\n\n你伸手将它提起，林间重新安静下来。远处摇晃的引灯靠近，一个披着旧斗篷的人停下脚步：“新来的？这里不能久留。跟我去有灯的地方。”', '草窝中的遗物', '打开黄金宝箱，在装备台查看获得的物品', '黄金宝箱')], arrival: [] },
  { code: 'F02', version: 3, region: 'dark_forest', destination: 'baina_town', title: '断角上的微光',
    moveEntry: '一条红色布带挂在低枝上，下面有浅浅的拖行痕。你沿较稳的石根靠近，听见树后有人压抑着疼痛吸气。',
    huntEntry: '你在泥地看见杂乱的爪痕与靴印，正想分辨方向，一滴血从低垂的披风边缘落下。树后的身影先抬起了头。',
    pages: [{ title: '树根旁的少女', text: '少女靠着树根坐着，额边弯角缺了一小块，斗篷下的银饰仍带着未散的暗红微光。她用掌心压住肩口，听见脚步便立刻绷直背。\n\n“再往前一步，我可不保证会客气。”\n\n话很冷，尾音却因疼痛轻轻发颤。她的目光扫过你尚未用过的武器，像要判断你是追兵，还是又一个迷路的人。' }],
    choices: [forestChoice('A', '与她战斗', '你举起武器，少女的眼神一下冷下来。她撑地翻身，挥出一道只为逼退你的暗红火光，借烟退入林间。\n\n“我记住你了。”\n\n你没有追上去。地上留下一件带有王印纹样的护具，原本连接它的银扣已经在之前的战斗中断裂。引灯人循火光赶来，皱着眉提醒：“别追。这里的路，你还不认识。”', '落在草间的王印', '将王印护具交给公会鉴物员查看后归还', '猩红王冠随机部位'),
      forestChoice('B', '询问伤势，给予微光草药', '“刚才和什么打起来了？”\n\n“赢了。”她把目光移向别处，停了一息，“然后没能躲开最后那一下。”\n\n你从包里取出微光草药，将药叶揉开，递到她仍在渗血的伤口旁。“先止血。赢了的人也得包扎。”\n\n她抿紧嘴唇，最后接过药叶：“……手法轻一点。我的意思是，别把药浪费了。”', '一封未拆的邀请', '将魔界邀请函交给鉴物员查看后归还', '金币 ×1、魔界邀请函')], arrival: [] },
  { code: 'F03', version: 3, region: 'dark_forest', destination: 'baina_town', title: '火星、盾牌与白绷带',
    moveEntry: '树间有一盏被人刻意抬高的灯。你循着灯找路，先听见盾牌碰撞和两个年轻人压低的争吵声。',
    huntEntry: '你刚辨认出黏液留下的痕迹，就听见低处有人讨论史莱姆。顺着声音看去，三名冒险者正在准备下一次前进。',
    pages: [{ title: '林中的三人', text: '红发少女把燃着火星的手指举到盾牌旁：“你再把黏液甩过来，我连盾一起烘。”\n\n持盾青年立刻把盾转向另一边：“知道了。你别每句话都点火。”\n\n白袍少女叹了口气，先看见站在树影里的你：“等等，有人迷路了。”\n\n青年转过来：“我叫莱昂。”他指向红发少女，“这是伊芙。”又指向替你拉开树枝的白袍少女：“这是希娅。我们准备处理前面的史莱姆，你想留在我们看得见的地方吗？”' }],
    choices: [forestChoice('A', '帮忙举灯，观察史莱姆', '希娅把灯交给你：“站在我能看见的地方，就已经帮上忙了。”\n\n莱昂以盾挡住第一团黏液，伊芙沿灯光找到核心，火星接连落下。你照她的提示将灯移向低处，看清了史莱姆收缩前的征兆。\n\n最后一团黏液落地，莱昂朝你抬起拇指。伊芙收起火：“灯举得比某人的盾稳。”\n\n“我听见了。”莱昂说。', '第一盏战地灯', '在安全教具台完成观察与基础战斗练习', '初行守护补给', 'R守'),
      forestChoice('B', '帮希娅整理急救包', '伊芙递来一卷绷带，语气难得放软：“打结别太紧，莱昂怕疼，只是不肯说。”\n\n你在希娅身边将药瓶分好，先看标签，再垫稳容易碰碎的瓶底。她教你如何递绷带，才不会让拿盾的人被缠住手。\n\n等莱昂与伊芙带着史莱姆黏液回来，药包已经整理齐全。莱昂摸摸刚包好的手：“下次也能这么整齐吗？”\n\n希娅看向你，轻轻笑了。', '把绷带留给归来的人', '用免费药包完成安全治疗教学', '初行医疗补给', 'R医')], arrival: [] }
];

const escorts: Record<string, string> = {
  M01: '菲萝缇领你从到达台沿花桥进入风枝会馆，亲手在航务记录上写下“已平安抵达”。',
  M02: '艾蕾诺驾车抵达根桥的公开中继亭，将求助铃记录与婚约一并交给登记员。她收起婚礼花冠，第一次以自己的名字向公会说明来意。',
  M03: '摊主的补给车驶向世界树。奥文抱着小狗坐在车尾，到门前才跳下来，认真替你向前台说明经过。',
  A01: '接引光落在世界树的安全石台旁。岑渡递来干毛巾，确认你站稳，领你穿过根桥前往公会。',
  A02: '观测队让你先坐稳撤离舟，莱斯最后登船。到世界树，他将信匣交给调查员，没有再报候补勇者的名号。',
  C01: '季节钟响过，汤橇沿重新显出的雪灯路线滑入雪灯坳。咕暖掀开温泉旅店的门帘，招呼你把冻僵的手先伸到火边。',
  C02: '格琳达将你安置在暖房外的接待前厅，拿来一份字迹端正的住约。通往雪灯坳的接力车已经停好，不必再穿过外面的暴雪。',
  C03: '卡洛雇来的暖篷车将众人送进雪灯坳。他挨个确认孩子下车，才拄着旗杆走向公会；他替你点的热汤，账写在自己名下。',
  T01: '伊赛带你与七号进入云上旧修理站，确认人偶有可靠的照料后，陪你乘有护栏的正常升降舱落到世界树接驳台。',
  T02: '逆鸣开启旧撤离桥，让风马拖着带护栏的车架缓缓前行。世界树纪念接引站的灯亮起，他郑重将最后一位旅人交给站内工作人员。',
  T03: '滴算将你领到鲸背的公会柜台，指明身后随时可用的世界树返程舱。鲸的呼吸平稳下来，窗边的灯不再摇晃。',
  E01: '烛十七交还属于旅人的凭物，磐签开启连接世界树的旧外交通道。澄叶在另一端接到你，先确认没有未解除的任职义务。',
  E02: '梅尔文收回影子，打开来时留下的返程门。赫棋自行走出棋盘，与你们抵达世界树图书馆外，决定先去登记客居。',
  E03: '余炉打开连接世界树遗物台的维修通道，带上已经站起来的囚像。止声得到妥善安置，你也终于能放下紧绷的手。',
  F01: '引灯人接过照明灯，领你沿有巡逻标记的林道走向百纳镇。城门的灯逐渐清楚，他一直等你跟上才继续走。',
  F02: '引灯沿林道指向百纳镇。城门前，一名抱着纸袋、长着猫耳和尾巴的少女停住脚步：“第一次来喵？我叫梨子，公会就在里面，我可以带路。”',
  F03: '莱昂在前面举盾开路，伊芙收起火星，希娅与你并肩。百纳镇灯火渐近，梨子喵朝三人挥手，听说你刚到，立刻带你去公会。'
};
/**
 * 抵达安全区后的第一段交接，必须延续初行中实际遇见的人和事件。
 * 七图新版已有各自的 lessonText；其余路线在这里补足，避免落入同一段“接引人备好教具”的通用文案。
 */
const routeLessonTexts: Record<string, string> = {
  M01: '花桥尽头，菲萝缇抱着改了又改的航务表跑进风枝会馆。她把我名字旁的“古木长老回程”划掉，另起一行写上“降临旅人，临时搭乘”，又请我亲眼核对。“这回由你自己确认，”她说，“我不替你填。”',
  M02: '根桥尽头，艾蕾诺先把歪掉的花冠收进怀里，才走进前台。维萝没有替她开口，只将两张空白陈述单分别推给你们。艾蕾诺把那份没有自己签名的婚约压在桌上，抬眼问你：“刚才我说的话，你愿意如实写下来吗？”',
  M03: '奥文抱着小狗从补给车尾跳下来，帽徽上的黑市仓号还没擦掉。他这次先用最短的话讲清阵脚、货单和退货口，把摊主的货架一并归位。“传奇称号可以晚点说，”他把教具放到桌上，“先把不会坑人的部分弄明白。”',
  A01: '世界树的女神办事桌前留着一张补救单。负责送你落地的人把事故经过写在最上方，没再替你解释；岑渡则把干毛巾放到一边，等你自己确认是否平安。桌上的接引印仍亮着，提醒所有人这一次要先把安全写清楚。',
  A02: '莱斯将信匣交给调查员后，红斗篷安静地垂在椅背上。他把悬赏画像翻到背面，请你指出追兵的武器、旧哨站的信号与自己说过的假话。“别替我补英雄故事，”他低声说，“把真的那段写进去就好。”',
  C01: '雪灯坳的火边，霜芙把过长的冰裙卷到凳脚旁，咕暖则把季节钟的零件一一烘干。她们没有再摆女王的仪式，只请你确认钟口、雪崩线和热汤雪橇经过的位置。霜芙端着碗，小声说：“冬天收尾，也该按规矩来。”',
  C02: '格琳达先将龙蛋安置在暖房最里侧，才把住约与猎龙人的赎金纸摆上柜台。她用尾尖把椅子推到你够得着的地方，请你核对烟雾、包裹和来人的话。“住客的安全写在第一条，”她说，“不是在押金后面。”',
  C03: '卡洛把救援雪橇停在公会屋檐下，挨个数完孩子才肯松开旗杆。他将半张收据铺平，请你确认补贴去向与最后一名下车的人。炉火映着旧旗，他的声音终于放轻：“他们都到了，这比什么勋章都要紧。”',
  T01: '伊赛带着七号在接驳台前停下，先关掉会把人认作货物的旧召回器。七号将自己的维修记录平码在桌上，等你确认它是主动拉下栏门、而非被谁当作工具。伊赛把装反的烟花支架转正：“先把出口画出来，才谈下一次起飞。”',
  T02: '逆鸣将头盔端端正正放在柜台上，胸甲里的雷声已经停了。它请你辨认旧行军印、撤离桥和那句误判敌军的命令，再把最后一页撤离记录压平。“战争结束了，”它说，“这一次由我亲自签退。”',
  T03: '滴算把那张“眠汐的梦”契约摊在账房，薄利站在一旁，尾巴难得没再往出口挪。它们请你核对商品名、保管人和鲸真正醒来的时刻，先把不该成交的条目作废。鲸背缓缓起伏，灯下只剩翻账本的轻响。',
  E01: '烛十七将作废的任职表压在蜡台下，磐签把束缚链的旧印章隔到另一张桌上。它们请你确认那把椅子何时扣住了人、临时决定如何留下，又由谁解除链条。“记录要写清，”烛十七说，“免得下一位路过的人又被叫成陛下。”',
  E02: '梅尔文把影子留在棋盘外，赫棋则自己挑了一张靠窗的椅子。两人将旧誓约的条款、落子顺序和守卫的离席记录排开，请你说明真正让棋局停下的那一步。老法师难得没有争辩：“这次，算我认输。”',
  E03: '余炉将囚像安置在有灯的维修台旁，止声缩在剑匣里，离包扎用的布远远的。它们请你核对过期罪牌、行刑机关和没有出鞘的那一刻。止声的声音从匣中传来：“本剑想把今天写成……一次没有伤人的开门。”',
  F01A: '黄金兔一路跟到百纳镇门边，见到兽栏的干草才终于敢松开你的衣角。契兽员没有急着碰它，只将一小把饲料放在地上，等它自己靠近。她请你记住它回头确认你的样子：“同行要靠它愿意，不靠绳子。”',
  F01B: '引灯人将你带到百纳镇明亮的装备台前，把沉甸甸的黄金宝箱放在木垫上。鉴物员先检查箱角的锁扣，再请你自己决定何时开启；林间那道金光已经熄灭，留下的东西仍该由你看清。',
  F02A: '莫妮卡将猩红护具放进带锁的鉴物匣，没有追问少女的去向。她请你只写下自己见到的火光、听到的那句警告与捡到的位置；猜测会另页存放，不能冒充事实。门外的林风吹过，桌上的王印纹样仍微微发暗。',
  F02B: '梨子喵把还温着的汤放到你手边，瑟芙菈留下的火漆信则被单独放进鉴物匣。莫妮卡请你先说明草药怎样交到她手中，再由鉴物员核验邀请函的印记。“她肯把路交给你，”梨子喵小声说，“你也要把它收好喵。”',
  F03A: '莱昂把战地灯扣在桌沿，伊芙用指尖压住不肯熄灭的火星，希娅则把史莱姆的收缩图画给你看。三人请你指出灯照到核心前的征兆，确认观察和出手之间要留出距离。伊芙挑眉：“看清楚，也是一种本事。”',
  F03B: '希娅将已经分类的药瓶摆在干净布上，莱昂主动伸出刚包好的手，伊芙在旁边盯着他别乱动。她请你按标签重新递一次绷带和药瓶，确认紧急时什么该先做、什么不该猜。希娅笑着说：“今天只是练习，慢一点没关系。”',
  S01: '背着小屋的寄居蟹停在岸站外，把被人塞进壳缝的认领告示吐到木板上。值守没有替它决定留下哪一只壳，而是请你说明告示从哪里抽出、原主人是否在场。先把住处与所有权分开记清，才不会让小屋再次变成陷阱。',
  S02: '潮钟的余音退去后，岸站将船影留下的灯号抄在干净纸上。值守请你分清哪一段是回应、哪一段是潮沟传来的回声，再把仍未找到的船只单列。“能听见，”她说，“不等于已经平安。”',
  D01: '骷髅把缺字的名牌放在桌沿，没有抢着说自己是谁。莫妮卡请你对照悬赏单、名牌残字和猎人的说法，只写亲眼见到的追逐与救援。名字确认以前，他先作为一名需要保护的来访者坐进灯下。',
  D02: '乌禾把沾土的手套放到一旁，等墓后的警钟完全停下才开始说明。她请你标出新土、警钟和通往安全处的小路，确认没有人仍被困在里面。害怕黑并不妨碍她救人，但接下来的挖掘交给带工具的值守。',
  H02: '芮娜先检查鸟巢是否稳在安全架上，才让石巨人活动手掌。她请你说明绳钩来自哪里、谁在碰石心、鸟巢怎样离开危险位置。巡护会追查偷猎者，麦穗和她则留在明亮的照料区休息。',
  I01: '珂珂在停炉铃旁等炉温彻底降下，把泄压孔和卸料单并排交给工匠。你说明火从哪里窜出、谁试图继续卸料、哪一次铃声让人停下。炉场重新开工以前，所有人先确认出口和停炉信号都能用。',
  W01: '雾婆把船靠稳后，将两个人的伤势和各自说过的话分开记录。你说明谁握过桨、谁请求回家、船是怎样避开谎言与危险水道的。她可以载人回岸，却不会替任何人把未说出口的同意写进船票。',
  W02: '药师先喝下经核对的解药，学徒则把每只瓶签重新挂正。你说明哪一瓶被错换、何时发出求助信号、谁确认了药舟的回应。治疗与教学都留在有监督的桌前，不再让人拿自己的身体猜药。',
  B01: '梨子喵将秤盘、银币和点心盒摆在同一张桌上，先请摊主重新报数。你说明硬币藏在哪里、谁看见了秤盘下的机关，莫妮卡据此记录价目与见证。算错不是羞辱人的借口，收钱的人也得把账算明白。',
  B02: '霍砺坐进修好的椅子前，先问旁边的人有没有被车架擦伤。你说明临时支撑为何倒下、谁曾嘲笑又谁帮忙抬车，莫妮卡把道歉和修缮分别记进记录。门口的空椅子留给下一位需要坐稳的人。',
  B03: '瑟米把被撕下的告示平码在柜台上，蓝墨和黑墨分开摆放。你说明是谁索要保证金、哪句接头话不对劲、有哪些新人险些交钱。真正的委托由前台重新公布，假的告示与可疑地点交给巡卫追查。',
  Y01: '蓝穗把从天上掉下来的借书箱锁进阅览台，先确认里面没有仍在活动的机关。你说明它提出了什么要求、哪一个回答能够当场验证、谁拒绝了签名。图书馆可以暂存危险书箱，却不会用一张借阅单困住来访者。',
  Y02: '木芽扶着刚松开的公会门，先摸了摸疼痛的合页，再检查门后没有人被压住。你说明门为何卡住、重量落在哪边、哪一条缝先让人出来。修门的人只换损坏零件，不把会说话的门当成没有感受的家具。',
  Y03: '朵菈把热食分成小份，先送到老人和孩子手里，再把商会男子的名单压在案板边。你说明谁需要食物、谁试图截留、每一份最后交到了哪里。欢迎宴不必等贵客到场，饿着的人先吃上饭。'
};
export const openingLessonText = (route: OpeningRoute, choice: OpeningChoice) => openingNewcomerText(openingExpandedLesson(route.code,choice.code)
  ?? route.lessonText
  ?? routeLessonTexts[`${route.code}${choice.code}`]
  ?? routeLessonTexts[route.code]
  ?? '你已抵达安全区。请根据自己亲眼见到的事，完成这一次交接。');
const applyOpeningRewrite=(route:OpeningRoute):OpeningRoute=>{
  const rewrite=finalOpeningRewrites[route.code];
  if(!rewrite)return route;
  return {...route,...rewrite,choices:route.choices.map(choice=>{
    const branch=rewrite.choices[choice.code];
    return branch?{...choice,...branch}:choice;
  })};
};
const applyOpeningNarrativeExpansion=(route:OpeningRoute):OpeningRoute=>{
  const expansion=openingNarrativeExpansions[route.code];
  if(!expansion)return route;
  return{...route,...expansion,choices:route.choices.map(choice=>({...choice,...expansion.choices[choice.code]}))};
};
const retainedRouteVersions: OpeningRoute[] = [...generatedSevenOpeningRoutes, ...generatedOpeningRoutes, ...forestRoutes].map(applyOpeningRewrite).map(applyOpeningNarrativeExpansion).map(applyOpeningRewardPolicy).map(retainOpeningRoute).filter((route):route is OpeningRoute=>Boolean(route)).map(polishRetainedOpening).map(route => ({ ...route,
  person: Object.prototype.hasOwnProperty.call(finalOpeningRewrites[route.code]??{},'person')?finalOpeningRewrites[route.code].person:route.person,
  arrival: route.arrival.length ? route.arrival : [{ title: '灯火已经在前方', text: escorts[route.code] }],
  choices: route.choices.map(choice => ({ ...choice, rewardCode: choice.rewardCode || `opening_${route.code.toLowerCase()}_${choice.code.toLowerCase()}`,
    farewell: choice.farewell }))
}));
export const openingRouteVersions: OpeningRoute[] = retainedRouteVersions.filter((route,index,all)=>all.findIndex(r=>r.code===route.code)===index);
export const openingRoutes: OpeningRoute[] = [...openingRouteVersions];
export const openingRouteByCode = (code: string, version?: number) => openingRouteVersions.find(route => route.code === code && (version === undefined || route.version === version));
/** 初到安全区时，主角尚未认识接应人员；姓名留到实际交谈中的自我介绍。 */
export const openingNewcomerText=(text:string)=>text
  .replaceAll('世界树岸站的岑渡','世界树岸站的一名工作人员')
  .replaceAll('岑渡','岸站工作人员')
  .replaceAll('维萝','前台书记官')
  .replaceAll('莫妮卡','前台接待员')
  .replaceAll('菈芮','风枝会馆接待员')
  .replaceAll('温棠','雪灯坳接待员')
  .replaceAll('澄叶','图书馆鉴物员');
/** 将内部岗位简称换成主角能立刻理解的人与动作。 */
export const openingNarrativeText=(text:string)=>text
  .replaceAll('无人值守','无人看守')
  .replaceAll('岸站值守','岸站工作人员')
  .replaceAll('山站值守','山站工作人员')
  .replaceAll('正规值守','收到求援后赶来的工作人员')
  .replaceAll('值守人','守在现场的工作人员')
  .replaceAll('值守者','负责接应的工作人员')
  .replaceAll('值守','在场的工作人员');
const firstMeetingIntroductionOffsets: Record<string,number> = {
  S01:1,S02:2,S03:1,D01:0,D02:2,D03:1,H01:1,H02:2,H03:1,I01:1,I02:1,I03:1,W01:2,W02:2,W03:1,
  B01:0,B02:2,B03:1,Y01:2,Y02:2,Y03:2,M01:2,M02:2,M03:2,R01:2,R02:2,R03:2,A02:2,A03:2,C01:3,C02:2,C03:2,T01:2,T02:2,T03:2,E01:2,E02:2,E03:2
};
/** 首次相遇前只使用可观察到的身份称呼，不能让旁白抢先泄露姓名。 */
const firstMeetingAliases: Record<string,string> = {
  S01:'那名修造师',S02:'那名吟游诗人',H02:'女骑士',I01:'炉场工匠',
  W01:'戴帽的船工',W02:'戴尖帽的药师',B02:'木腿老人',B03:'女文书',
  Y01:'借还员',Y02:'抱着工具袋的人',Y03:'蜜獾厨娘',M01:'尖耳少女',M02:'逃婚的少女',M03:'倒挂的法师',
  A02:'红斗篷男子',
  C01:'银白长裙的女子',C02:'霜龙掌柜',C03:'守旗人',T01:'精灵修理师',T02:'无头骑士',
  T03:'狐兽人账房',E01:'短角书记',E02:'老法师',E03:'空围裙的管理员'
};
/** 同场人物也要先以可见身份出现；在主角获知姓名的对白中再明确称呼。 */
const firstMeetingCompanionAliases: Record<string,Record<string,string>> = {
  D02:{ 乌禾:'柜后的送葬学徒' },
  W02:{ 小苇:'药师的学徒' },Y03:{ 萨芙:'第一位魔族客人' }
};
const firstMeetingIntroductions: Record<string,string> = {
  F01:'',
  F02:'',
  F03:'',
  S01:'对方把扳手在围裙上抹了一下，先朝我抬抬下巴：“桥务站的贝娅。先别让那把剑再松一寸，剩下的事我边修边说。”',
  S02:'女子用沾湿的手指在沙上写下“弥莎”，又画了个歪歪的音符。她指着自己发不出声的喉咙，认真朝我一鞠躬。',
  S03:'',
  D01:'',
  D02:'斗篷男子用尚未冒烟的手背扶正领结：“认识一下，维兰。柜后那位是乌禾，受惊了也没丢下我；眼下先别碰那扇窗。”',
  D03:'',
  H01:'',
  H02:'女骑士先安抚狮鹫的耳羽，才朝我点头：“芮娜，见习骑士，算是麦穗的搭档。它怕陌生的网，比我怕高还厉害；我们先把它们赶远。”',
  H03:'',
  I01:'炉场工匠把烧焦的纸鸟夹进铁钳，语气又急又稳：“叫我珂珂就行。那封信可以等，炉火和人等不了；先跟着地上的黄线走。”',
  I02:'',
  I03:'',
  W01:'戴帽的狼人耳朵抖了抖，抢在浪头前说：“那个……我叫苇牙，摆渡学徒。我真的不咬人……先把这块防水布盖好，船会听雾婆的话。”',
  W02:'药师把空瓶藏到身后，努力维持庄重：“药师露缇，记住是药师。这是我学徒小苇；今天这副样子是个错误示范，别靠近那锅绿泡。”',
  W03:'',
  B01:'',
  B02:'木腿老人用晾衣杆敲开歪倒的凳子，向我颔首：“孩子们爱叫我勇者爷爷，霍砺是我的本名。先把小家伙们带到门外。”',
  B03:'文书将两色墨瓶并排摆好，语速很快却字字清晰：“我是瑟米，公会文书。你先别碰那面镜子，真的登记册在我手里，假的照片也跑不了。”',
  Y01:'半精灵借还员把单据翻到背面，耳尖微红：“借还员蓝穗。刚才那句不该问，机器把你认成书了；我先让它停下。”',
  Y02:'抱着工具袋的人按住会滑动的盆栽，向我无奈挥手：“叫我木芽，管门窗和这些倔家具的。门想看夕阳可以，先别把来访者堵在外面。”',
  Y03:'蜜獾厨娘用锅铲敲了敲烤盘边缘，干脆地说：“朵菈管这间厨房。递请柬的叫萨芙；饿的人先吃饭，想占便宜的等把手从甜点盘里拿开再谈。”',
  M01:'',
  M02:'',
  M03:'倒挂的男人先伸手扶正漂浮的帽子，才尴尬一笑：“奥文，暂时别写传奇法师……先帮我拆掉这份黑市条款。”',
  R01:'',
  R02:'',
  R03:'',
  A02:'红斗篷男人把声音压低，拱手时仍想摆出英雄姿势：“莱斯，至少这是我的真名。画像上的勇者大半是假的，信匣是真的；追我们的人也不是什么巡卫。”',
  A03:'',
  C01:'银白长裙的女王慌忙接住皇冠，仍努力维持威严：“雪灯坳的霜芙向你致意，冬之女王。刚才的失态不记入礼仪；季节钟得先从雪里挖出来。”',
  C02:'',
  C03:'守旗人咬紧布条打好结，才抬头说：“救人的卡洛。车上都是孩子，银币的事可以查，先别让雪把他们埋住。”',
  T01:'精灵把装反的支架转了半圈，耳尖更低了：“伊赛，空港修理师。七号比我会记错，我负责让升降机和人都回到该走的方向。”',
  T02:'骑士腰间的头盔向我郑重一低，声音从甲胄里传来：“旧军守桥骑士逆鸣，请记下这个称呼。若我忽然把你当敌军，请先相信这不是你的错。”',
  T03:'狐兽人把“好运”牌翻到背面，露出账房印：“账房滴算，负责先把错账翻出来。眠汐的梦不该被卖出去；我们得先让鲸知道它还能自己做梦。”',
  E01:'短角书记抱着案卷冲到我面前，几乎要哭出来：“我是临时书记烛十七。陛下这个称呼是椅子乱叫的，您先别再坐回去。”',
  E02:'老人把棋子藏到掌心，清了清嗓子：“法师梅尔文。刚才那步确实手滑……好吧，先把赫棋从我的赌局里放出来。”',
  E03:'空围裙在石台旁微微欠身，声音平静得像在报修：“旧遗物管理员余炉。剑叫止声，它怕血也怕承认；囚像不是机关的祭品。”'
};
/** 新旅人尚未认识路线人物时，由对方在首次相遇页先报出姓名。 */
export const openingFirstMeetingIntroduction=(route:OpeningRoute)=>{
  if(route.version<3)return'';
  if(route.code in firstMeetingIntroductions)return firstMeetingIntroductions[route.code];
  if(!route.person)return'';
  const {name,description}=route.person;
  const identity=description.split('。')[0].replace(`${name}是`,'是').replace(/^(?:他|她|它)是/,'是');
  return `我还在判断该不该靠近，对方已经先开口：“我叫${name}，${identity}。”`;
};
/** 自我介绍必须发生在相遇推进以后，不能覆盖事件刚发生时的未知感。 */
export const openingFirstMeetingText=(route:OpeningRoute,text:string,pageIndex=0)=>{
  const introduction=pageIndex===0?openingFirstMeetingIntroduction(route):'';
  if(!introduction)return text;
  const paragraphs=text.split(/\n\n/);const offset=Math.min(firstMeetingIntroductionOffsets[route.code]??1,paragraphs.length);
  const before=paragraphs.slice(0,offset).map(paragraph=>{
    let result=paragraph;
    for(const [name,alias] of Object.entries(firstMeetingCompanionAliases[route.code]??{}))result=result.replaceAll(name,alias);
    return route.person?result.replaceAll(route.person.name,firstMeetingAliases[route.code]??'对方'):result;
  });
  return [...before,introduction,...paragraphs.slice(offset)].join('\n\n');
};
