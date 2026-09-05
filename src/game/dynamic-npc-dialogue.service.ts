import { dynamicNpcDisplayName, dynamicWorldRegions, type DynamicWorldNpc } from './world-dynamics.content';

type Relation = 'stranger' | 'acquaintance' | 'friend' | 'close_friend' | 'confidant';
type DynamicNpcProfile = DynamicWorldNpc & { displayName: string; regionName: string; homeName: string; homeSiteCode: string; meeting: string };

const profiles = new Map<string, DynamicNpcProfile>(dynamicWorldRegions.flatMap(region => region.npcs.map(npc => {
  const home = region.buildings[npc.homeIndex]!;
  const firstImpression = npc.description.split('。')[0] ?? npc.description;
  const displayName = dynamicNpcDisplayName(npc);
  return [npc.code, { ...npc, displayName, regionName: region.name, homeName: home.name, homeSiteCode: home.code, meeting: `【${npc.role}】${displayName}停下脚步。${firstImpression}。` }] as const;
})));

// 一期已落库的五位巡游者沿用同一人物档案，避免旧存档升级后退回通用对白。
const legacyAliases: Record<string, string> = {
  patrol_fernwatch: 'dw_dark_forest_npc_1', courier_morningdew: 'dw_morningdew_riverbank_npc_1', forge_inspector: 'dw_rediron_pass_npc_1', storm_kitekeeper: 'dw_thundercliff_npc_1', marsh_lantern: 'dw_mistalgae_marsh_npc_1'
};
for (const [legacyCode, currentCode] of Object.entries(legacyAliases)) {
  const profile = profiles.get(currentCode); if (profile) profiles.set(legacyCode, profile);
}

type NpcVoice = { morning: string; afternoon: string; evening: string; caution: string; warmth: string; trust: string };
const voice = (morning: string, afternoon: string, evening: string, caution: string, warmth: string, trust: string): NpcVoice => ({ morning, afternoon, evening, caution, warmth, trust });
type SpeechHabit = { gesture: string; catchphrase: string };

/**
 * 每位巡游居民都拥有独立的生活细节与交往边界。时段和好感文案以这些锚点展开，
 * 而非仅把职业名称替换进同一句套话；每个分支都有两个可随机抽取的版本。
 */
const voices: Record<string, NpcVoice> = {
  dw_baina_town_npc_1: voice('先把昨夜被雨打花的字逐笔誊正', '在三份互相矛盾的申请条间找共同的名字', '把最后一盏廊灯下的借阅章擦干净', '记录会留下来，急着辩解的人往往漏掉最重要的一笔', '你肯把经过讲完整，这比漂亮的结论难得得多', '若有人质疑你的选择，我会把我亲眼所见写进公卷'),
  dw_baina_town_npc_2: voice('把热粥分给赶早船的客人，再清点空房钥匙', '一边翻晒湿斗篷，一边记住每位旅人的口味', '在门槛摆好干鞋与夜灯，等迟归的人敲门', '先坐下喝口热的，饥饿会把好人也逼得说错话', '你上次还了干净的碗，我就知道你是会回头的人', '若你深夜回来，给我留个暗号；我会替你守着后门'),
  dw_baina_town_npc_3: voice('借着钟声最清的时候核对异族地名的读音', '把模糊墨迹拿到窗边，一笔一笔比对旧卷', '听着旧钟余响整理索引卡，常忘了该回家', '不要只问答案，卷宗里的空白往往也有来处', '你肯陪我把一段旧话读完，我可以让你看未装订的部分', '我会把你的名字夹进安全的页码；以后查找它时不会迷路'),
  dw_world_tree_npc_1: voice('先摸过暴露的根节，确认没有新伤', '在树影移动前巡完最浅的一圈根脉', '把枝杖横在根隙旁，听夜风有没有不自然的回音', '别踩那条发亮的细根，它记得的痛比人久', '你走路懂得绕开幼根，树会把这份分寸还给你', '若根系向你发出警讯，我会先替你听完再告诉你'),
  dw_world_tree_npc_2: voice('给每封叶脉信补上防潮蜡，再辨认风铃方向', '把回信夹在最不易被风翻走的枝叶间', '清点未署名的信封，替它们留一盏小灯', '信可以迟到，不能被拿来试探别人的软处', '你交来的信没有多问一句，我愿意替你跑更远的枝路', '若有封信只能交给你，我会亲自绕过最险的冠层'),
  dw_world_tree_npc_3: voice('在露水蒸发前标出流光落下的第一道方向', '趴在枝台边缘，计算光点与风的偏差', '把一整日的光线记成细线，直到看不清字', '观测不是为了把天空占为己有，是为了少让人走错一步', '你愿意安静等一次完整的落光，我就愿意讲讲图上的秘密', '明日若有异象，我会先把最清楚的方位留给你'),
  dw_dark_forest_npc_1: voice('沿雾线重新描出归队者的脚印，连小孩的也不漏', '把巡图压在树桩上，听鸟鸣替她确认边界', '检查提灯芯与备用哨子，才肯放下弓带', '密林不怕陌生人，怕的是不肯承认自己迷路的人', '你把发现的脚印告诉我，这趟巡路就不是我一个人的了', '雾最重时跟紧我的灯；我会让你的脚印也回到图上'),
  dw_dark_forest_npc_2: voice('用指腹摸湿木纹，判断昨夜雾潮从何处经过', '蹲在断路旁给每块路牌重新上油', '把修好的木钉排成一行，像给路留下一排牙齿', '路标不是装饰，别为了抄近路把它转个方向', '你会把借走的绳子卷好还来，我就不必再提醒你规矩', '下次雾潮来，我给你做一块只认你脚步声的路牌'),
  dw_dark_forest_npc_3: voice('先闻柴火有没有潮味，再把兽皮抖到火边', '在屋檐下削新木楔，顺手给迷路人留一杯水', '数完柴垛才肯关门，担心有人会在夜里敲窗', '没有鸟鸣的林段，连老猎人也该放慢脚步', '你肯听劝不逞强，我就愿意把备用火种分给你', '我会把小屋的门虚掩着；你回来时不用先喊我的名字'),
  dw_dark_forest_deep_npc_1: voice('等根辉雾最薄的一刻，在石门上系第一枚引路结', '侧耳辨认雾里不同的回响，替队伍挑出安全线', '把白天留下的绳结逐一收紧，免得夜雾偷走方向', '看见光不代表出口，先看它会不会照出自己的影子', '你不催我赶路，我便能把真正能走的路告诉你', '若雾线突然翻转，抓住我的绳结，不要回头找我'),
  dw_dark_forest_deep_npc_2: voice('给采样瓶贴上精确时刻，连晨雾的颜色也写进去', '守着菌环等它吐出第二次孢光，谁来都不许碰', '把每只瓶子塞进棉套，像哄一群脾气古怪的孩子', '活孢不会因为你胆子大就变得温顺，手套戴好', '你肯替我等观察结束，这份样本的结论也有你一份', '等我确认它安全，就让你先看它在黑暗里如何呼吸'),
  dw_dark_forest_deep_npc_3: voice('逐根拉紧石门旁的回返绳，听纤维有没有断音', '把被雾浸湿的旧结拆开重编，手指从不偷懒', '在火光下数绳结数到最后一个，才允许自己吃饭', '进深林的人总爱留下承诺，至少留下能把人带回来的结', '你没有把绳结当一次性东西，我记住了', '若你失了方向，拉三下；我不问缘由，先把你拽回来'),
  dw_worldtree_meadow_npc_1: voice('听风铃停顿，给受惊兽群先让出草坡', '绕着饮水点修围栏，嘴里还在数铃声节拍', '把最后一只幼兽赶回棚里，才肯喝冷掉的茶', '草原的风会骗人，风铃不会；先听它再下判断', '你没有惊动幼兽，它们会记得你的气味', '来年迁徙时，我把最安静的一条路留给你同行'),
  dw_worldtree_meadow_npc_2: voice('趁花瓣未落地把药圃的露水收进细瓶', '逐片检查微光草的叶缘，像在给孩子量体温', '用晒干的花瓣压住药册，免得风把配方吹走', '药不是越多越好，错一味就会把好意变成负担', '你愿意告诉我身体哪里不舒服，我会认真听而不乱开方子', '我会为你留一小包最适合远行的草药，不记在账上'),
  dw_worldtree_meadow_npc_3: voice('在驿亭柱上更新避泥路线，把雨线画得很粗', '给过路新手讲第三遍岔路，也不嫌烦', '收起被风吹散的地图角，望着归途最后一抹光', '最快的路不一定让人平安，别把绕路当成丢脸', '你照着我画的路又回来报平安，这比谢礼实在', '若你想去更远处，我会替你把每个补水点都圈出来'),
  dw_morningdew_riverbank_npc_1: voice('先把潮湿信封平码在船舱口，等雾散再启程', '踩着浮桥试绳索，嘴上仍在同河水争辩', '把迟到的回执夹进油布，担心它们夜里受潮', '河水今天脾气不好，别拿一封急信跟它赌', '你愿意替人等一趟船，我便愿意替你记住这份人情', '若上游来信只剩半截，我也会把能读的那半截先交给你'),
  dw_morningdew_riverbank_npc_2: voice('敲过浮桥每块木板，确认哪一块昨夜喝饱了水', '拧紧缆索时不许旁人说话，怕漏听一声裂响', '把磨损的绳头剪齐，才肯放船夫收工', '借绳可以，先报风向；不知道风向的人也该知道怕', '你每次都把工具还回原位，我愿意教你看桥的脸色', '等你真要过险滩，我把自己最信得过的绳结借你'),
  dw_morningdew_riverbank_npc_3: voice('先听水鸟叫了几声，再决定渔火要挂在哪边', '把潮痕刻进亭柱，提醒后来人避开暗浅滩', '守着最后一盏渔火熄灭，才收起湿披风', '水面太安静时反而别靠近，它常在藏别的声音', '你肯把奇怪的水声说给我听，今晚的灯就没白点', '若河雾吞了岸线，看我的火；它一直为归人留着'),
  dw_gravelwind_shore_npc_1: voice('擦净潮位镜片，先辨清哪一道亮是盐雾的假影', '在潮池边描镜雾轮廓，鞋底沾满细盐', '把观潮册压在石下，等潮退给每页吹干', '盐雾会把礁石画成门，别急着相信第一眼', '你愿意把看到的假影告诉我，我会帮你找出它从哪面潮来的', '下一次镜雾升起，我让你站在灯塔最高的那扇窗边'),
  dw_gravelwind_shore_npc_2: voice('摸过船壳新刮痕，再决定该用哪种木钉', '在露天船坞里同锤声较劲，骂完又替它上油', '把修好的桨平码好，怕夜潮把它们卷走', '船会撒谎，刮痕不会；别只听船主说得好听', '你敢承认自己把船磕坏了，我就少收你一份麻烦钱', '等你有自己的船，我替你在船尾刻一枚不怕盐的印'),
  dw_gravelwind_shore_npc_3: voice('逐枚捡起破盐晶，在祭棚前洗去尖角', '把普通贝壳分给孩子，再收下渔人的沉默', '替晚归船点好小灯，不问他们带回了什么', '祈愿不是替人免去风浪，是让人记得为何回航', '你愿意替陌生人留一盏灯，我会替你留一枚完整盐晶', '若你有不敢说的愿望，放在贝壳里；我不替你打开'),
  dw_ridge_foothills_npc_1: voice('先看矿灯颜色，再准许任何人进未测绘矿道', '把塌方报告压在饭盒下，边吃边核对名单', '巡完最后一段断层，手上还沾着石粉', '山里最危险的不是黑，是有人为了逞强说里面没事', '你肯报出发现而不是偷偷进去，我会把你列进可靠名单', '真有塌方时跟在我身后；我知道哪块岩会先松口'),
  dw_ridge_foothills_npc_2: voice('迎着回风吹第一声石笛，听山口把它送回哪里', '换下受潮铜片，给每种风向重新编号', '在暮风里练短音，直到远处哨所回应', '听不懂信号就别硬猜，一个错误短音能叫整队人回不了家', '你记住了我的三个警报码，我便当你是能托付消息的人', '风起时我会替你吹最短的回家音，不会让你等到天黑'),
  dw_ridge_foothills_npc_3: voice('把水袋按重量排好，先挑出最不漏的一只', '背着支撑木在碎坡来回，笑称石头比人省心', '把没用完的绷带重新卷紧，放到谁都找得到的位置', '补给不是英雄故事，但少一卷绷带就会少一个人回来', '你把伤口说出来，我就不会拿“忍忍”敷衍你', '下次上坡前来找我，我给你塞一袋永远不会结冰的水'),
  dw_rediron_pass_npc_1: voice('先看灰的红度，再决定今天哪些炉道必须封闭', '围着警铃转一圈，耳朵比眼睛更早发现异常', '把巡检簿放在炉温外，怕纸也被脾气带着烧起来', '炉道不听漂亮话，只认准时的检查和肯停下的脚步', '你没有越过封线，我就愿意把真正的危险告诉你', '警铃一响别找我，按我教你的路线先出去；我随后就到'),
  dw_rediron_pass_npc_2: voice('把掌心贴在冷却管上，分辨哪一段水声不够安静', '在热浪里拆开铜阀，动作轻得像在缝衣服', '收好每一枚换下的螺栓，声称它们也有脾气', '热不是敌人，轻视热的人才是；护具扣好再说话', '你会先问能不能帮忙，而不是伸手乱碰，我很欣赏', '等你下次经过，我让你听听一条修好的水道是什么声音'),
  dw_rediron_pass_npc_3: voice('逐个数进避烬所的人，连睡着的矿工也不漏', '把门缝塞紧灰布，再给每人分一口温水', '留在门边等巡检归来，数人头比数星星认真', '门一关就别回头拿东西，命比工具贵得多', '你会替旁人让出干净的位置，这种人该有一碗热汤', '只要我还守着门，名单上就不会少写你的名字'),
  dw_mistalgae_marsh_npc_1: voice('擦亮引灯，只让它照出浮草的边缘不照水面', '用长篙试探安全路，每一杆都先听水下回声', '把灯芯压低，免得夜雾学会模仿它的光', '湿地最会借别人的脸说话，别回应水里的那个你', '你肯跟着灯的边缘走，我就愿意带你穿过最短的浅沼', '如果我叫你闭眼，就信我一次；我会把你带到有风的地方'),
  dw_mistalgae_marsh_npc_2: voice('贴着温室玻璃听孢群醒来的细响，像在等乐团调音', '给不同孢种换水，连呼吸节奏也记在册上', '把发亮样本罩进黑布，怕它们被月光宠坏', '孢子不是玩具，喜欢发光的不代表喜欢被人碰', '你肯站在门外等我记录完，我会给你讲它们真正的颜色', '有一段孢群呼吸谱，我只给愿意耐心听完的人看'),
  dw_mistalgae_marsh_npc_3: voice('先测石碑露水线，再把旧刻文擦出一小角', '守着半沉石碑等它露出新行，谁催也不快', '把当天多出来的字拓在布上，夜里反复比对', '碑文忽然变多从来不是好消息，别急着把它念出来', '你没有把新字当故事传开，我愿意让你看完整拓片', '若碑上出现你的名字，来找我；我们先把它从水里救出来'),
  dw_fallenstar_swamp_npc_1: voice('在雾散前放下测深杆，不相信任何一处旧刻度', '反复校准星纹砝码，连泥点也要擦净', '把今日水深划掉重写，承认沼泽从不重复昨天', '昨天的答案在这里最危险，水会笑着换掉它', '你肯跟我再测一遍而不嫌烦，我就把陨坑边的安全点告诉你', '若我说退，就一起退；我宁愿少一条数据也不要少一个同伴'),
  dw_fallenstar_swamp_npc_2: voice('轮流试三把库钥匙，确认每一把锁都没沾星泥', '把样本放进铅封柜，连影子也不许靠得太近', '逐项点清封条，再把钥匙贴身藏好', '好奇可以进档案，手指不能进封条里面', '你会先问规则，我可以让你从观察窗看一眼真正的样本', '有些记录我只能和守密的人分享；你已经证明自己算一个'),
  dw_fallenstar_swamp_npc_3: voice('给无名泥灯添一滴清油，念完才肯离开', '在祈棚前把失踪者的名字念得很慢，不让风带走', '收起熄灭的灯盏，为迟归的人再留一处空位', '别拿失踪者的故事取乐，沼泽听得见这种轻慢', '你愿意为陌生名字停一会儿，我便愿意听你说想找谁', '若你必须进深沼，我会把你的名字先写在等你回来的一页'),
  dw_frostcrown_plateau_npc_1: voice('先看护目镜有没有裂，再问旅人要往哪座雪丘去', '踩着旧雪印巡过风口，把兽迹和人迹分开', '把冻硬的绳扣烤软，仍不许任何人脱下护目', '高原不奖赏硬撑，雪盲的人连回家的方向都会忘', '你肯让人检查装备，我就愿意分享最稳的兽道', '暴风来时跟我的旗走；就算看不见，我也会数着你在不在'),
  dw_frostcrown_plateau_npc_2: voice('把地热石翻面，确保最靠门的那张床也暖和', '慢火煨汤时听客人讲行程，暗自记下真假', '把热汤分成小碗，怕冻僵的人喝得太急', '热汤可以续，逞强不能；先把手伸过来让我看看', '你说的路和鞋底的雪对得上，我就相信你没骗我', '以后回来不必客气，最安静的炉边位置一直给你留着'),
  dw_frostcrown_plateau_npc_3: voice('把雪镜错开角度，避免第一束极光照进眼底', '用细尺量影子偏差，连自己的也不完全相信', '将校准片收进绒盒，直到极光退去才松口气', '同一面雪镜不能看第二眼，记住第一次的路就够了', '你照我的方法避开倒影，我愿意教你辨认假的北方', '若极光把你引错，我会用我的镜片替你找回那条影子'),
  dw_thundercliff_npc_1: voice('放出测雷鸢前先向它道早安，再检查羽翼导线', '盯着云线训练它折返，宁可少一组数据', '把受惊的鸢安回笼里，听断崖吞掉最后一声雷', '雷云不会夸勇敢，靠得太近只会让它多劈一次', '你没有追着落雷跑，我就带你看测雷鸢怎样读云', '真正的异云来了，我会把最可靠的鸢放到你头顶上方'),
  dw_thundercliff_npc_2: voice('把耳朵贴上缆索，先听它有没有昨夜留下的颤音', '在桥腹换扣环，连玩笑也得等扳手停下', '给每根检修绳打记号，像在给老朋友写名字', '桥不会因为你着急就更结实，手离扣环远一点', '你肯帮我递工具却不乱问，我可以让你试着听一次缆索说话', '要过悬桥就来找我；我愿意亲手检查你那一侧的扣环'),
  dw_thundercliff_npc_3: voice('把避风墙后的碎石扫开，给早行者腾出坐处', '看风切过旗角的弧度，提前关上背风门', '在夜风里钉紧松木板，生怕它替谁受了一击', '有些风会把人推到崖边，觉得不对就趴下别逞强', '你愿意听“停下”，这在断崖上比会走路更重要', '风最凶的时候，墙后的位置永远有你一处'),
  dw_eclipse_ruins_npc_1: voice('在月井未醒时敲一遍封印铃，听它回音是否完整', '围着石亭巡一圈，把异常雨滴装进小瓶', '把铃绳缠回掌心，直到井底低鸣安静下来', '雨滴失色时别许愿，月井最爱记下含糊的话', '你肯把听见的回声原样说出，我会告诉你哪些该忘掉', '封印若真松动，站到我身后；这一次我不让你独自听铃'),
  dw_eclipse_ruins_npc_2: voice('把天仪碎片按星位排开，先向缺角那块道歉', '用细刷清理刻线，直到手背也沾满银灰', '给拼不回去的碎片盖上布，承认它们也需要休息', '碎片不是废料，它们只是还没想起属于哪片天空', '你能看见缺口而不急着填，我愿意让你参与下一次拼合', '等天仪重亮那晚，我会把第一束完整星光让给你看'),
  dw_eclipse_ruins_npc_3: voice('把烛火放到影子一侧，再读第一段残卷', '逐字抄录光暗交界处的句子，连错别字也保留', '收卷前先熄掉一半烛火，免得文字跟着月色改动', '遗迹的卷宗不怕被读，怕被人读得太快', '你肯陪我查完上下页，我就把被遮住的注脚指给你', '有些名字只适合交给愿意守夜的人；我想你能守住')
};

/** 每人独有的肢体习惯与口头禅。它们直接进入早中晚描写和各好感层对白，不再用通用关系套话填充。 */
const speechHabits: Record<string, SpeechHabit> = {
  dw_baina_town_npc_1: { gesture: '他把蘸水笔搁在墨台边，像先给每句话留出证据', catchphrase: '有名有据，事情才不会被风吹走' },
  dw_baina_town_npc_2: { gesture: '她说话时总会把冒着热气的碗往客人手边推半寸', catchphrase: '空着肚子的人，别急着给自己下结论' },
  dw_baina_town_npc_3: { gesture: '他会用指节轻敲书脊，等旧钟替自己把句子想完', catchphrase: '听不懂的字，先别急着把它读成答案' },
  dw_world_tree_npc_1: { gesture: '他指向根须前总先弯腰摸一摸土的温度', catchphrase: '根会记得脚步，脚步也该记得分寸' },
  dw_world_tree_npc_2: { gesture: '她捻封蜡时从不让信封离开掌心', catchphrase: '信要送到人手里，不是送进旁人的好奇里' },
  dw_world_tree_npc_3: { gesture: '他讲话前总抬头看一眼叶隙的光斑', catchphrase: '光会偏，记录别跟着偏' },
  dw_dark_forest_npc_1: { gesture: '她把靴底的泥在树根旁刮净，才肯展开巡图', catchphrase: '承认迷路，不比在雾里逞强丢脸' },
  dw_dark_forest_npc_2: { gesture: '他会把木钉在掌心排成一列，像给路牌数牙齿', catchphrase: '路牌替人站着，人别替路牌撒谎' },
  dw_dark_forest_npc_3: { gesture: '他听完来话总先闻一闻火种有没有潮味', catchphrase: '没鸟叫的地方，腿走慢些才是本事' },
  dw_dark_forest_deep_npc_1: { gesture: '她系绳结时不看旁人，只盯着雾最薄的缝', catchphrase: '见光先看影，见路先想回头' },
  dw_dark_forest_deep_npc_2: { gesture: '他把采样瓶转向暗处，仿佛怕它们听见谈话', catchphrase: '会发光的不一定愿意被看见' },
  dw_dark_forest_deep_npc_3: { gesture: '他用拇指逐个压过绳结，直到指腹沾满湿纤维', catchphrase: '承诺会松，绳结得有人重编' },
  dw_worldtree_meadow_npc_1: { gesture: '他侧耳听铃，连说话的节拍也会跟着风停顿', catchphrase: '风会耍花样，铃声不替谁遮掩' },
  dw_worldtree_meadow_npc_2: { gesture: '她把花瓣放在掌心掂一掂，才肯写进药册', catchphrase: '药救人靠准头，不靠一把好心' },
  dw_worldtree_meadow_npc_3: { gesture: '他用炭笔把岔路涂得很粗，生怕新手看漏', catchphrase: '绕远不是输，平安到了才算路对' },
  dw_morningdew_riverbank_npc_1: { gesture: '他把信封平码三遍，像在同河雾谈条件', catchphrase: '急信也得过河，河水可不认催促' },
  dw_morningdew_riverbank_npc_2: { gesture: '她说到缆索便收紧下颌，耳朵仍听着木板声', catchphrase: '报得出风向，才配借我的绳' },
  dw_morningdew_riverbank_npc_3: { gesture: '他会先数水鸟叫声，再把灯芯拨亮一点', catchphrase: '水太安静的时候，话要留在岸上' },
  dw_gravelwind_shore_npc_1: { gesture: '她用指甲刮过镜片边缘，确认上面没有盐雾结晶', catchphrase: '第一眼最会骗人，潮水知道这个' },
  dw_gravelwind_shore_npc_2: { gesture: '他骂着锤子手却很轻，敲完还替铁头抹油', catchphrase: '船壳有嘴，刮痕比船主老实' },
  dw_gravelwind_shore_npc_3: { gesture: '她把破盐晶洗圆了棱角，才肯放进祈棚篮子', catchphrase: '愿望别说太满，留点风浪给人自己过' },
  dw_ridge_foothills_npc_1: { gesture: '他吃着冷饭也不抬头，先把塌方名单对齐', catchphrase: '山里最黑的，不是矿道，是逞强' },
  dw_ridge_foothills_npc_2: { gesture: '她说到风险就用石笛敲掌心，短音干脆得像落石', catchphrase: '听不清就再听，猜错一声够人走丢' },
  dw_ridge_foothills_npc_3: { gesture: '他把水袋按重量提一提，笑完才递给人', catchphrase: '绷带不出名，可它比英雄故事可靠' },
  dw_rediron_pass_npc_1: { gesture: '他望灰不望人，像灰色比脸色更会交代真相', catchphrase: '炉道不听好话，只认按时停步' },
  dw_rediron_pass_npc_2: { gesture: '她用指背试铜阀余温，语气却像在安抚受惊的猫', catchphrase: '热没错，轻看热的人才容易出事' },
  dw_rediron_pass_npc_3: { gesture: '他发水时会逐个点头，像在给每条命重新点名', catchphrase: '门一合，工具算小事，人得算回来' },
  dw_mistalgae_marsh_npc_1: { gesture: '她把灯举得很低，刻意避开水面里的第二盏光', catchphrase: '水会借你的脸，别急着答它的话' },
  dw_mistalgae_marsh_npc_2: { gesture: '他贴着玻璃听孢群呼吸，连衣袖都不许碰到瓶架', catchphrase: '爱发光的东西，脾气常比夜色难猜' },
  dw_mistalgae_marsh_npc_3: { gesture: '他将拓布压在石碑边，等水纹自己退开', catchphrase: '碑文多一行，先别忙着念给风听' },
  dw_fallenstar_swamp_npc_1: { gesture: '她擦净砝码上的泥点，宁肯重测也不肯沿用旧数', catchphrase: '在这里，昨天的答案最容易害人' },
  dw_fallenstar_swamp_npc_2: { gesture: '他摸钥匙时会先碰铅封，确认封条没有学会说谎', catchphrase: '好奇可以进册子，手别进封条里' },
  dw_fallenstar_swamp_npc_3: { gesture: '她替泥灯添油时会把每个名字念得很慢', catchphrase: '没回来的人，也该有人把名字留在灯边' },
  dw_frostcrown_plateau_npc_1: { gesture: '他把护目镜递还前总要再看一遍镜片裂纹', catchphrase: '雪不奖赏硬撑，眼睛比面子贵' },
  dw_frostcrown_plateau_npc_2: { gesture: '她端汤时把最热的碗留在掌心，等客人手暖了才放开', catchphrase: '汤能续，逞强这味病得先停' },
  dw_frostcrown_plateau_npc_3: { gesture: '他将雪镜扣进绒盒，像把一句危险的话合上', catchphrase: '同一面镜，第二眼最容易把北方看丢' },
  dw_thundercliff_npc_1: { gesture: '她对测雷鸢说话比对云层多，放飞前总摸摸它的颈羽', catchphrase: '雷云不夸胆大，它只多劈一次' },
  dw_thundercliff_npc_2: { gesture: '他把耳朵贴在缆索上，停很久才肯回答', catchphrase: '桥不赶路，赶桥的人才会掉下去' },
  dw_thundercliff_npc_3: { gesture: '他扫碎石时总给墙后留一处干净坐位', catchphrase: '风把人往崖边推时，趴下比逞能漂亮' },
  dw_eclipse_ruins_npc_1: { gesture: '她绕月井走路从不踩自己影子的边缘', catchphrase: '雨滴没颜色时，愿望也该闭嘴' },
  dw_eclipse_ruins_npc_2: { gesture: '他给缺角碎片让出空位，仿佛它们会自己回家', catchphrase: '碎片不是废物，它们只是忘了天空' },
  dw_eclipse_ruins_npc_3: { gesture: '她总把烛火摆在影子一侧，再翻开残卷', catchphrase: '卷宗不怕读，怕人把它读得太快' }
};

/**
 * 不写进任务提示的生活碎片。每人有三段可随机抽取的近况，让同一次闲聊不只
 * 围绕职责与好感打转；它们也为委托交代提供人物当下的情绪和说话节奏。
 */
const personalNotes: Record<string, readonly [string, string, string]> = {
  dw_baina_town_npc_1: ['他把一张被雨泡皱的申请条压在镇石下，说主人会回来取，字不能再糊一次。', '有人在廊外争得很响，他却只把两人的名字写进不同栏位，等气消了再请他们各自补证。', '他总替不会写字的老摊主留一盏灯，收摊后才悄悄把代笔钱划掉。'],
  dw_baina_town_npc_2: ['她认得每只空碗的去向，见你站得太久，先把一碟温姜片推到你面前。', '她把一件晒不干的斗篷翻了第三遍，嘴上抱怨天气，手里却补好了脱线的扣子。', '有旅人把房钥匙落在桌上，她没有追出去，只在灯下留了张写着“回来再喝一碗”的纸条。'],
  dw_baina_town_npc_3: ['他把一张缺角的旧地图垫在杯底，怕窗缝的风再偷走一个地名。', '听见孩童把古族姓氏读错，他先忍住笑，等人自己问起才慢慢纠正。', '他把不能确定的注脚折到背面，宁肯少讲一段故事，也不肯让传言冒充史实。'],
  dw_world_tree_npc_1: ['他从幼根旁拾起半截木签，削圆了尖角才插回警示绳边。', '一只小兽在根桥下打转，他没有赶它，只等它自己闻到安全的土味。', '他给被踩实的泥地松土时很少说话，仿佛怕惊动地下还没醒的脉络。'],
  dw_world_tree_npc_2: ['她把一封没有收信人的信夹在最内层，称它总会等到愿意认领的人。', '风吹歪了枝头的邮铃，她先扶正铃，再去追那张险些飞走的回执。', '有人问她信里写了什么，她只笑着换了封蜡，说每个名字都该有自己的门。'],
  dw_world_tree_npc_3: ['他会把观测尺对着叶影比半天，最后承认今天的光不愿配合。', '有孩子问流光会不会掉下来，他认真回答会，只是落在懂得等待的人眼里。', '他在图纸角落画了一只歪歪的小鸟，说那是提醒自己别把天空算得太死。'],
  dw_dark_forest_npc_1: ['她把捡到的红绳系在低枝上，告诉后来的人这里曾有人平安折返。', '听到远处有鸟惊飞，她立刻停下脚步，却先示意身边人别拔武器。', '她把巡图上多余的一条线擦掉，轻声说有些路不该被好奇心画出来。'],
  dw_dark_forest_npc_2: ['他修路牌时总把旧木屑收进布袋，打算回去填屋后漏风的墙缝。', '有人想把路标转向近道，他把钉子递过去，让对方先试着在雾里辨一次方向。', '他会给每块新牌背面刻小小的年号，认定路也有被记住的资格。'],
  dw_dark_forest_npc_3: ['他把灶上多煨的一壶水留给夜行人，嘴上却说只是怕火塘熄得太快。', '雨把屋檐敲得很急，他先去看门外的脚印，再回来添柴。', '一只瘸脚狐狸在窗边蹲着，他把肉干掰成两半，自己只吃了面包。'],
  dw_dark_forest_deep_npc_1: ['她在每个新绳结里夹一根白纤维，摸到它的人就知道这条线还可信。', '雾里传来熟人的叫声，她没有应，只把灯朝地面压低了一寸。', '她把旧石门上的苔藓拨回原处，说有人曾靠它认出回来的路。'],
  dw_dark_forest_deep_npc_2: ['他给采样瓶起了过分认真的小名，连最凶的一瓶也被叫作“安静客人”。', '有人伸手想碰菌环，他先递手套，再讲整整一段失败案例。', '他会把废弃的标签撕得很碎，怕后来人把过期的时刻当成今天。'],
  dw_dark_forest_deep_npc_3: ['他数绳结时会漏掉自己系的第一枚，于是每次都从头再数一遍。', '一名巡游者嫌绳子碍事，他没争辩，只把对方的回返结系得格外牢。', '他把湿透的纤维放在火边烘干，连吃饭也用一只手压着，怕它卷边。'],
  dw_worldtree_meadow_npc_1: ['他把受惊的幼兽赶回草坡后，会蹲下来听很久，确认铃声重新松快。', '风把牧棚门吹得作响，他先替邻棚加了根横木，才回头修自家的。', '有人想抄近路穿过饮水点，他只吹了一声短铃，兽群便先替他让出了答案。'],
  dw_worldtree_meadow_npc_2: ['她把药草按叶缘深浅摆开，像在替每片叶子找合适的床位。', '她会给弄错药名的人一小撮薄荷，让对方记住味道而不是挨一句训。', '雨后她先去看花圃，不急着收露水，说活着的东西比配方更会等。'],
  dw_worldtree_meadow_npc_3: ['他把被踩湿的地图晾在驿亭梁上，连褶皱朝哪边都要记下来。', '有人绕路回来抱怨太远，他掏出炭笔，在对方鞋底旁画了一个安全的圈。', '他每晚都会数一遍借出的水袋，少一个就站到驿道口等到最后。'],
  dw_morningdew_riverbank_npc_1: ['他把每封急信按潮汐分堆，嘴里念着名字，像怕河雾替人忘了。', '渡船晚了半刻，他先把等船的老人扶到背风处，才去骂那条缆绳。', '他给油布补针脚时很专注，说信纸没做错事，不该替人受潮。'],
  dw_morningdew_riverbank_npc_2: ['她把断下的绳头编成小环，挂在桥头让孩子们辨认哪种纤维最怕雨。', '听见木板发出闷响，她会立刻叫停所有玩笑，连呼吸都放轻。', '有人把借来的钩索擦得很干净，她没夸，只把下一班的热茶多盛了一碗。'],
  dw_morningdew_riverbank_npc_3: ['他给每盏渔火取了颜色名字，却坚持最暗的一盏叫“等人”。', '水鸟突然噤声时，他会把话说到一半，先让岸边也安静下来。', '他把潮痕画得比实际高一点，承认自己宁愿被人笑胆小。'],
  dw_gravelwind_shore_npc_1: ['她把盐雾里的假影一一画下来，旁边还认真标注“别信这一道”。', '有渔人送来碎镜片，她先看反光，再问人有没有在潮池边许愿。', '她会把退潮后的脚印拍平，说礁石已经记得够多了。'],
  dw_gravelwind_shore_npc_2: ['他嘴上嫌弃船主不会爱护家伙，转身就给船底多钉了一块护板。', '他把磨坏的桨柄留在架上，说这是给学徒看的反面教材。', '海风卷走了他的帽子，他先笑骂一声，仍把掉在地上的钉子全数捡回。'],
  dw_gravelwind_shore_npc_3: ['她把孩子捡来的盐晶放进清水里泡开，再告诉他们愿望也该先洗净尖刺。', '晚归的船没有灯，她不问缘由，只把祈棚外那盏挂得更高。', '她听人诉苦时总低头编贝壳绳，等对方说完才把打好的结递过去。'],
  dw_ridge_foothills_npc_1: ['他把矿道外的空饭盒摞得很整齐，等人回来才肯收进筐里。', '有人吹嘘自己摸黑走过断层，他只递上一盏矿灯，请对方再走一遍亮处。', '他把塌方名单放在最上面，声称这些名字比矿脉走向更值得背熟。'],
  dw_ridge_foothills_npc_2: ['她给石笛的每个孔都缠上不同颜色的线，怕新人慌时分不清警报。', '回风把讯号送错了方向，她没有恼，只在崖边等到能听见正确回声。', '她说话短促，给受惊的孩子哼的安抚调子却很长。'],
  dw_ridge_foothills_npc_3: ['他把最后半袋干粮塞进陌生人的包里，笑称自己正好想减轻负重。', '有人把绷带用来绑工具，他摇着头重新卷好，又多教了一次止血结。', '他总能从脚步声听出谁在强撑，追上去时只问要不要喝水。'],
  dw_rediron_pass_npc_1: ['他在灰地上画出禁行线，画得歪了也要重来，说炉道看不懂借口。', '警铃响过后，他会独自站一会儿，像在和已经停下的余音核对。', '有人递来酒想暖身，他闻了闻便放到一旁，等巡检结束才肯碰。'],
  dw_rediron_pass_npc_2: ['她收集每枚换下的螺栓，给磨损最厉害的那一枚画了一张小像。', '蒸汽突然喷出时，她先把学徒推开，自己回头去拧最后半圈阀门。', '她会在冷却水里放一片薄荷叶，说机器也该知道今天不是最糟糕的一天。'],
  dw_rediron_pass_npc_3: ['他把避烬所的水杯摆成一排，数到最后总要再确认有没有小孩漏在角落。', '有人回来时满身灰，他先递湿布，再让对方把名字报一遍。', '他修门缝时留了一道很窄的光，说里面的人得知道外头还有白天。'],
  dw_mistalgae_marsh_npc_1: ['她把浮草拨成箭头，却从不让箭头直指深水。', '水面映出第二盏灯时，她会把真灯贴近胸口，等影子先散。', '有人喊她的名字，她总先看对方脚下有没有风吹动的草。'],
  dw_mistalgae_marsh_npc_2: ['他会为每一批孢群播放不同的轻敲声，坚信它们记得谁敲得礼貌。', '样本忽明忽暗时，他的表情比谁都严肃，嘴里却还在安抚那只瓶子。', '他把实验失败的培养皿埋进指定泥地，不肯让它们变成别人取乐的光。'],
  dw_mistalgae_marsh_npc_3: ['他拓碑前先把袖口卷到一样高，仿佛不对称会惹石字生气。', '水纹遮住一行新字，他宁愿坐到天暗，也不肯凭半个笔画猜全句。', '他给每张拓片背面写上天气，称雨天的文字比晴天更爱说谎。'],
  dw_fallenstar_swamp_npc_1: ['她把旧测深杆上的刻度刮去一截，说这是给沼泽留的体面。', '有人说昨日此处能走，她只是把新砝码递过去，请人先替自己称一称。', '她每次回到棚里都会洗两遍靴底，生怕星泥跟着她进了账本。'],
  dw_fallenstar_swamp_npc_2: ['他给钥匙串分了轻重，闭着眼也能知道少的是哪一把。', '有访客夸铅封柜漂亮，他立刻把话题转到柜外的安全线。', '他会把作废的封条放进火盆，看着最后一点字完全消失才离开。'],
  dw_fallenstar_swamp_npc_3: ['她给每盏无名泥灯留一张空白纸，等有人愿意把名字写上。', '雨打灭了灯火，她没有叹气，只用衣袖护住火种重新点亮。', '有人说该忘了旧事，她把那盏灯往前挪半寸，说记得不等于困住。'],
  dw_frostcrown_plateau_npc_1: ['他把护目镜的裂纹画进日志，连最浅的一道也不放过。', '有人想凭记忆穿过雪丘，他先请对方说出上一次是跟谁一起回来的。', '他会把迷路人的手套挂在旗杆上，等风小些再带人去找。'],
  dw_frostcrown_plateau_npc_2: ['她把汤勺擦得发亮，见客人缩手便先用自己的掌心暖一下碗沿。', '她听旅人吹嘘得太厉害也不拆穿，只往汤里多放一勺盐，让人记得喝水。', '夜里炉火将灭，她总留下最小一块地热石给最后进门的人。'],
  dw_frostcrown_plateau_npc_3: ['他给每副雪镜贴上细小的方向签，写完又担心字会被霜吃掉。', '极光升起时，他会先闭眼数十下，再允许自己抬头。', '有人说北方很美，他点头，却悄悄把那人背包上的绳扣紧了一圈。'],
  dw_thundercliff_npc_1: ['她替测雷鸢梳理颈羽时会念天气，像是在向它解释今天为什么不能飞远。', '鸢忽然折返，她不追着问数据，先检查它有没有被电弧烫伤。', '她把失效的导线绕成小环，挂在窗前提醒自己雷声也会撒谎。'],
  dw_thundercliff_npc_2: ['他听缆索时不许人跺脚，转身却会把自己的外套垫给怕冷的检修员。', '一颗松动的螺帽掉进崖雾，他记下方向，说明早要带磁钩回来找。', '他给桥腹的每一根绳都取了俗气名字，说这样它们不容易被忽略。'],
  dw_thundercliff_npc_3: ['他扫出的碎石从不倒在崖边，而是装进袋里垫在避风墙的根脚。', '有人在风里讲话太大声，他笑着指指耳朵，示意先把命令写下来。', '他把干净坐位让给受伤的人，自己靠着墙站了一晚也没提。'],
  dw_eclipse_ruins_npc_1: ['她把封印铃擦到能照出指尖，却从不让人从镜面看自己的脸。', '月井低鸣时，她会先把旁人带离井沿，再回头听第二遍。', '一滴失色的雨落在袖口，她剪下那片布，埋进石亭外的干土。'],
  dw_eclipse_ruins_npc_2: ['他把最小的碎片摆在桌中央，称它也许才是整幅天仪的开头。', '有人问缺口能不能用新金属补上，他先给碎片盖了布，等它们不再被盯着。', '他会对拼错的星位说一句抱歉，然后从头再来，绝不偷偷挪正。'],
  dw_eclipse_ruins_npc_3: ['她把残卷里的错别字也抄进副本，旁边写着“原貌不可替我受审”。', '烛火被风吹斜时，她先合卷，不肯让影子替文字补完句子。', '有人问她最想找哪页，她沉默片刻，只说想找一页能让人安心合上的。']
};

const relationFor = (affinity: number): Relation => {
  if (affinity >= 2000) return 'confidant';
  if (affinity >= 500) return 'close_friend';
  if (affinity >= 200) return 'friend';
  if (affinity >= 50) return 'acquaintance';
  return 'stranger';
};

const choose = <T>(items: readonly T[], variant?: number) => items[variant === undefined ? Math.floor(Math.random() * items.length) : Math.abs(variant) % items.length] ?? items[0];

/**
 * 动态 NPC 的词条均从内容注册表里的名字、岗位、常驻建筑与个性短句生成，
 * 从而保证巡游位置改变时仍保持同一人物口吻，而不必依赖地图坐标。
 */
export const dynamicNpcProfile = (code: string) => profiles.get(code) ?? null;

/** 供委托、互动等系统取用的角色锚点；不把通用称呼或职业模板误当作人物个性。 */
export const dynamicNpcVoiceAnchor = (code: string, affinity = 0, variant = 0) => {
  const npc = dynamicNpcProfile(code); if (!npc) return null;
  const persona = voices[npc.code] ?? voice('把手边的物件逐一归位', '沿着巡游线确认每一处记号', '在灯下收好今日的记录', '陌生人的脚步也该有来处', '你肯把经过说完整，便值得我停一停', '若路真要断了，我会陪你找到另一头');
  const habit = speechHabits[npc.code] ?? { gesture: '他把手边的物件逐一归位', catchphrase: '路总得有人认真看着' };
  const notes = personalNotes[npc.code] ?? ['他把手边的物件逐一归位。', '他认真听完每一段来话。', '他把未完的事情逐一记下。'] as const;
  return { displayName: npc.displayName, role: npc.role, gesture: habit.gesture, catchphrase: habit.catchphrase, caution: persona.caution, warmth: persona.warmth, trust: persona.trust, relation: relationFor(affinity), personalNote: choose(notes, variant) };
};

export const dynamicNpcChatDialogue = (code: string, affinity: number, now = new Date(), variant?: number) => {
  const npc = dynamicNpcProfile(code); if (!npc) return null;
  const hour = now.getHours(); const period = hour < 11 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'; const relation = relationFor(affinity);
  const persona = voices[npc.code] ?? voice('把手边的物件逐一归位', '沿着巡游线确认每一处记号', '在灯下收好今日的记录', '陌生人的脚步也该有来处', '你肯把经过说完整，便值得我停一停', '若路真要断了，我会陪你找到另一头');
  const habit = speechHabits[npc.code] ?? { gesture: '他把手边的物件逐一归位', catchphrase: '路总得有人认真看着' };
  const notes = personalNotes[npc.code] ?? ['他把手边的物件逐一归位。', '他认真听完每一段来话。', '他把未完的事情逐一记下。'] as const;
  const scenes = {
    morning: [
      `晨雾压过${npc.homeName}的门槛，${npc.displayName}${persona.morning}。${habit.gesture}。`,
      `${npc.displayName}把${npc.regionName}的清晨留给${persona.morning}，低声念道：“${habit.catchphrase}。”`
    ],
    afternoon: [
      `日光照进${npc.homeName}，${npc.displayName}${persona.afternoon}。${habit.gesture}。`,
      `${npc.displayName}在${npc.regionName}${persona.afternoon}，像把旁人的脚步也一并听进心里：“${habit.catchphrase}。”`
    ],
    evening: [
      `暮色沉进${npc.regionName}，${npc.displayName}${persona.evening}。${habit.gesture}。`,
      `${npc.displayName}${persona.evening}后仍没有离开，只把话说得很轻：“${habit.catchphrase}。”`
    ]
  } as const;
  const relations: Record<Relation, readonly string[]> = {
    stranger: [
      `“${persona.caution}。”`,
      `“${habit.catchphrase}——${persona.caution}。”`
    ],
    acquaintance: [
      `“${persona.warmth}。”`,
      `“${habit.catchphrase}；${persona.warmth}。”`
    ],
    friend: [
      `“${persona.warmth}。${persona.trust}。”`,
      `“${habit.catchphrase}。${persona.trust}。”`
    ],
    close_friend: [
      `“${persona.trust}。”`,
      `“${persona.warmth}；${habit.catchphrase}。”`
    ],
    confidant: [
      `“${persona.trust}。${habit.catchphrase}。”`,
      `“${habit.catchphrase}。${persona.warmth}。”`
    ]
  };
  return `${choose(scenes[period], variant)}\n${choose(relations[relation], variant === undefined ? undefined : variant + 1)}\n${choose(notes, variant === undefined ? undefined : variant + 2)}`;
};

/** 内容校核供自动化测试调用：全部新增域民必须有独立语音资料，且采样文本不能重复或回落到旧共用句。 */
export const auditDynamicNpcDialogues = () => {
  const expected = dynamicWorldRegions.flatMap(region => region.npcs.map(npc => npc.code));
  const missingVoices = expected.filter(code => !voices[code]); const missingHabits = expected.filter(code => !speechHabits[code]); const missingNotes = expected.filter(code => !personalNotes[code] || personalNotes[code].length < 3);
  const samples = new Map<string, string>(); const noteOwners = new Map<string, string>(); const duplicates: string[] = []; const duplicateNotes: string[] = []; const forbidden: string[] = [];
  const forbiddenPhrases = ['第一次见面，先把话说清楚', '我听着呢', '这话只对你说', '别让我白忙一场', '按你自己的步子慢慢说'];
  for (const code of expected) for (const note of personalNotes[code] ?? []) {
    if (noteOwners.has(note)) duplicateNotes.push(`${code} 与 ${noteOwners.get(note)}`); else noteOwners.set(note, code);
  }
  for (const code of expected) for (const [hour, affinity] of [[8, 0], [14, 50], [20, 200], [8, 500], [14, 2000]] as const) for (const variant of [0, 1, 2]) {
    const text = dynamicNpcChatDialogue(code, affinity, new Date(2026, 0, 1, hour), variant) ?? '';
    if (samples.has(text)) duplicates.push(`${code} 与 ${samples.get(text)}`); else samples.set(text, code);
    if (forbiddenPhrases.some(phrase => text.includes(phrase))) forbidden.push(`${code}@${hour}/${affinity}`);
  }
  return { profileCount: expected.length, missingVoices, missingHabits, missingNotes, duplicateSamples: duplicates, duplicateNotes, forbiddenSamples: forbidden, sampleCount: samples.size };
};
