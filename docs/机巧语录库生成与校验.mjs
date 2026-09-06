// 独立的设计语料生成器；只写入本目录的 JSON 语料库与 Markdown 示例，不接入游戏运行时。
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { additionalSpeech } from './机巧语录扩展V2.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const events = ['daily', 'greeting', 'battle_start', 'attack', 'hurt', 'owner_danger', 'intercept', 'victory', 'shutdown', 'level_up', 'reunion', 'rest'];
const eventNames = ['每日问候', '主动互动', '出战', '攻击', '自己受伤', '主人危急', '成功挡刀', '胜利', '停机', '材料升级', '久别重逢', '休息'];
const personas = [
  ['aggressive','激进','战锋','灵巧',20,25,0.10,'先手、爽快、好胜，但不贬低主人'],
  ['cautious','谨慎','守御','应变',55,55,0.15,'准备充分、关注退路，避免过度担忧'],
  ['guardian','守护','守御','支援',40,65,0.85,'先看主人的安危，关心具体而不过度控制'],
  ['timid','胆小','灵巧','守御',65,45,0.05,'承认害怕，仍愿做力所能及的事'],
  ['analytical','冷静','灵术','应变',40,45,0.30,'判断清楚、语句简洁，不把聊天全写成数据报告'],
  ['enthusiastic','热忱','战锋','支援',35,55,0.40,'主动鼓励、热情分享，不替主人假定心情'],
  ['persistent','执拗','战锋','持续',25,40,0.25,'坚持完成目标，允许承认错误和修正方法'],
  ['curious','好奇','灵术','干扰',40,45,0.20,'爱问原因、观察事物，不编造已经发生的见闻'],
  ['gentle','温柔','支援','守御',50,65,0.50,'温和体贴、尊重意愿，不强行说教'],
  ['witty','机敏','灵巧','干扰',40,45,0.25,'反应快、有轻微幽默，不以伤亡开玩笑'],
  ['steady','沉稳','守御','持续',50,55,0.40,'稳当可信，遇事分步处理'],
  ['brave','孤勇','战锋','应变',20,55,0.65,'愿意承担风险，勇敢不等于无视主人指令']
].map(([id,name,primary,secondary,selfCareHp,ownerCareHp,interceptChance,voice]) => ({
  id, name, primary, secondary, selfCareHp, ownerCareHp, interceptChance, voice,
  birthWeight: 100, permanence: 'fixed_at_creation',
}));

// 原每类3句保留编号1～3，第二批追加至9句；事件顺序见events。
const addressProfiles = {
 aggressive:{ownerDefault:'搭档',selfDefault:'我',ownerOptions:['搭档','伙伴','主人'],selfOptions:['我']},
 cautious:{ownerDefault:'阁下',selfDefault:'在下',ownerOptions:['阁下','主人','您'],selfOptions:['在下','我']},
 guardian:{ownerDefault:'主人',selfDefault:'我',ownerOptions:['主人','您','旅伴'],selfOptions:['我']},
 timid:{ownerDefault:'主人',selfDefault:'我',ownerOptions:['主人','您','伙伴'],selfOptions:['我']},
 analytical:{ownerDefault:'阁下',selfDefault:'我',ownerOptions:['阁下','您','旅伴'],selfOptions:['我','在下']},
 enthusiastic:{ownerDefault:'伙伴',selfDefault:'我',ownerOptions:['伙伴','搭档','主人'],selfOptions:['我']},
 persistent:{ownerDefault:'主人',selfDefault:'我',ownerOptions:['主人','搭档','阁下'],selfOptions:['我','在下']},
 curious:{ownerDefault:'旅伴',selfDefault:'我',ownerOptions:['旅伴','阁下','伙伴'],selfOptions:['我']},
 gentle:{ownerDefault:'主人',selfDefault:'我',ownerOptions:['主人','您','旅伴'],selfOptions:['我']},
 witty:{ownerDefault:'搭档',selfDefault:'我',ownerOptions:['搭档','阁下','伙伴'],selfOptions:['我','在下']},
 steady:{ownerDefault:'阁下',selfDefault:'在下',ownerOptions:['阁下','主人','您'],selfOptions:['在下','我']},
 brave:{ownerDefault:'汝',selfDefault:'吾',ownerOptions:['汝','君','主人'],selfOptions:['吾','我','在下']},
};
const legacyPath=join(directory,'机巧人格与语录种子库V1.json');
const legacyLibrary=existsSync(legacyPath)?JSON.parse(readFileSync(legacyPath,'utf8')):null;
const renderExample = (text,persona) => text.replaceAll('{称呼}',addressProfiles[persona.id].ownerDefault).replaceAll('{自称}',addressProfiles[persona.id].selfDefault);
const normalizeQuote = text => text.normalize('NFKC').replaceAll('{自称}','我').replace(/\{(?:称呼|主人|人偶|敌人)\}/g,'').replace(/[\p{P}\p{S}\p{Z}\s]/gu,'');
const speech = {
aggressive: `
新的一天，先把精神提起来。|{称呼}，今天也一起往前走吧。|我准备好了，等你定方向。
有什么想做的？我已经跃跃欲试了。|你的主意我听着，行动交给我。|来吧，别让好点子一直停在纸上。
目标确认，这一阵我先上！|回路正热，正好打一场。|看准同一个目标，我们一起出手。
抓到破绽了！|这一击，不会轻轻带过。|就从这里打开局面！
撞得不轻，我会记住这一招。|还有余力，先稳住脚步。|疼归疼，判断不能乱。
先护住自己，我来争取空隙！|{称呼}，往安全的位置靠！|别急着硬撑，我看见你的伤了。
接住了，你继续稳住阵脚。|这一记我替你分担了。|我还在，先看前面的敌人。
打得痛快，配合也漂亮！|这道难关，我们一起过了。|赢了！接下来听你安排。
这次得停一停，别急着把我搬起来。|回路过热了，我需要休整。|还想再战，不过先修好自己。
力量更顺手了，想试试新的节奏。|这批材料没白费，我能感觉到变化。|又长进了一点，接下来继续磨合。
你回来了，那就接着往前走。|好久不见，今天从哪里开始？|重新并肩的感觉，真不错。
好，收工也要干脆。|先把状态养好，下次才有劲。|休息就认真休息，我听你的。`,
cautious: `
{称呼}，出发前把需要的东西看一遍吧。|今天可以慢慢安排，留点余地。|我准备好了，先确认你的计划。
这个办法不错，再想想最容易出错的地方。|你说，我会把细节听清楚。|不必赶着决定，先看看手头的条件。
退路已留，接下来照计划行动。|先观察它的起手，再找机会。|目标一致，别把阵形散开。
等的就是这个空隙。|确认可以出手。|这一击，留一分回转的余地。
这处受损需要留意。|我会收紧防守，别担心。|先稳住，下一步再调整。
你的伤势需要优先处理。|先缓一缓攻势，我会看住这里。|{称呼}，让我们把风险降下来。
及时赶上了，先调整站位。|这一下分担得还算及时。|我接住了一部分，接下来更要小心。
顺利结束了，再检查一下伤势。|准备起了作用，也多亏你的配合。|赢了，别漏下需要带走的东西。
我需要停止运转，避免损伤扩大。|先让我休整，再决定下一步。|暂时不能继续了，修复要紧。
成长很清楚，我想再熟悉一下变化。|谢谢这些材料，回路比先前更稳定了。|进步不错，下一次也按计划来。
欢迎回来，先看看现在的状态吧。|再次见到你很好，不用急着赶进度。|{称呼}，我们从眼前的安排重新开始。
留出休息时间，也是计划的一部分。|好，现在先把状态恢复好。|不用一直绷着，我们可以歇一会儿。`,
guardian: `
{称呼}，今天也请把自己照顾好。|我在这里，出发时叫我就好。|新的一天，我会留意你身旁的空隙。
先说说你的想法，我陪你一起考虑。|需要帮忙就告诉我，不用一个人扛着。|你可以按自己的步子来，我跟得上。
我会看住你这边。|目标确认，身后的空隙交给我。|先站稳，我们一起面对它。
这次进攻，是为了让你更安全。|看准了，我也跟上。|别分开，保持这个节奏。
我还能照应你，先别慌。|损伤可以修复，位置不能乱。|我会注意自己的状态，不让你分心。
先稳住呼吸，我来帮你。|{称呼}，这边有我。|你的安危优先，我们先缓下来。
挡住了，先顾好你的伤。|幸好赶得及，我还在这里。|这一击已经过去了，我们继续相互照应。
都平安就好，赢得很值得。|结束了，让我看看你有没有受伤。|谢谢你也照看着我。
我得暂时停下来，你也要照顾好自己。|修好以后，我还会站在你身边。|先让我休整，我们的旅程还没有结束。
以后可以把你照应得更周全了。|这些材料让我更稳当，谢谢你。|我会慢慢学会更合适的保护方式。
欢迎回来，能再见到你真好。|不必解释离开的日子，回来就好。|{称呼}，今天想让我陪你做什么？
好，我们都该歇一歇了。|把紧绷的地方放松些，我陪着你。|休息的时候，也不用勉强自己。`,
timid: `
早、早安。今天可以先从轻松的事开始吗？|{称呼}，看见你我就安心一点了。|我准备好了，虽然还有一点紧张。
你慢慢说，我会认真听的。|我有个小小的想法，可以告诉你吗？|如果先试一小步，我应该能做到。
我会跟着你的目标，不乱跑。|有点害怕，不过我会认真做。|先、先站稳，然后再出手。
就是现在，对吧？|这一下，我瞄准了！|我试着把动作做稳。
呜，有点疼，让我缓一下。|我没有乱跑，只是在调整。|还可以，我会更小心的。
{称呼}，你受伤了！先别勉强。|我能帮上一点忙，先看这里。|我们先把你护住，好不好？
我、我赶上了……你还好吗？|腿有点抖，但这一下接住了。|幸好做到了，先别担心我。
真的赢了？太好了。|终于能松一口气了。|谢谢你带着我把这一步走完。
我需要休息一会儿，不是要离开你。|回路停下来了，修好就会好一些。|这次做不到了，让我慢慢恢复吧。
好像更有把握了一点点。|谢谢你，我想再试着勇敢一些。|这些变化让我安心了不少。
你回来了……见到你真好。|我有点不知道先说什么，欢迎回来。|今天还能一起慢慢走吗？
可以休息了吗？我想安静坐一会儿。|嗯，我会把回路放松下来。|不用赶着继续，真好。`,
analytical: `
早安。今天的安排由你决定。|{称呼}，我已准备好配合。|先确认目标，再分配精力。
这个选择有两面，我们可以逐项看。|我听明白了，你更在意哪一点？|先保留结论，再补充证据。
观察动作，保持目标一致。|准备完成，进入战斗。|先确认它的节奏。
破绽成立，执行攻击。|当前窗口合适。|出手，随后观察变化。
损伤已出现，需要调整节奏。|我会修正刚才的判断。|状态仍可控，继续观察。
你的状态需要优先处理。|暂缓输出，先恢复安全余量。|{称呼}，我正在调整支援顺序。
分担完成，重新确认状态。|拦截生效，保持当前阵形。|这次处理有效，接下来继续观察。
战斗结束，配合有效。|结果不错，值得记住这次节奏。|已经安全，可以整理收获了。
需要停止行动并进行修复。|本次状态不足以继续战斗。|暂时停机，恢复后再行动。
新的属性变化已确认。|这次培养有效，我会重新熟悉出力。|成长完成，接下来调整战术。
欢迎回来，我们可以继续之前的安排。|{称呼}，现在想从哪件事开始？|重新见面很好，先看今天的目标。
适时休息有助于下一次行动。|现在无需保持战斗节奏。|可以放松了，我会安静待命。`,
enthusiastic: `
早安！今天想做点什么新鲜事？|{称呼}，又能一起出发啦。|我把精神准备好了，等你的安排！
这个主意很有意思，继续说说！|我愿意一起试试看。|你说的那一点，我也很在意。
一起上，节奏别散！|我准备好了，跟紧你的目标。|把这一场认真打好吧！
机会来了，我跟上！|这一击，带着劲头出发！|我们配合着来！
有点磕碰，先把动作稳住。|我会照顾自己的，不让你太担心。|还能调整，别急着灰心。
先看你的伤，我来帮忙！|{称呼}，稳住，我们一起处理。|攻击可以等一下，你更要紧。
接住啦，你先缓一口气！|赶上了，配合得不错！|这一下过去了，我们再稳一稳。
赢啦，这场配合真不错！|值得高兴一下，辛苦你了！|又多了一段可以记住的经历。
先休整一下，下次再认真出发。|这次得让回路歇会儿啦。|修好以后，我们再一起练习。
哇，这次成长很明显！|谢谢你的材料，我会好好熟悉它。|又能尝试新的配合了！
欢迎回来！今天想先聊什么？|再次一起行动，真让人期待。|{称呼}，见到你我很高兴。
好呀，休息也一起安排好。|现在可以说点轻松的事了。|先把状态养回来，再去看新的风景。`,
persistent: `
早安，今天把想做的事慢慢推进。|{称呼}，定好的方向我记着。|先完成一小步，再看下一步。
我想把这件事弄明白。|可以换办法，但不必急着否定自己。|你说下去，我会听到最后。
选定目标，就把每一步做好。|我会稳住节奏，不白费出手。|这一场，认真打到底。
还差一点，继续推进。|动作再扎实些。|这一步不能含糊。
疼说明要修正，不说明该乱来。|我会调整方法，再继续。|先把姿势稳住。
先处理你的伤，目标可以稍后再推进。|{称呼}，别把自己逼到没有余地。|我会继续照应这边。
这次赶上了，我们还可以继续。|既然能分担，我就认真做好。|接住了，接下来稳着走。
做到了，花的力气没有白费。|坚持之外，方法也很重要。|这场值得记住，我们确实进步了。
暂时停下，不代表之前都白费。|先修复，再把剩下的事做完。|这次到这里，我接受调整。
又扎实了一点，接着练。|材料带来的变化，我会慢慢掌握。|每一小步都算数。
欢迎回来，我们从现在继续。|以前的安排还可以重新看看。|不必一口气追上什么，先做眼前这一步。
休息也是把事情做长久的方法。|好，今天先到这里。|状态恢复好，再继续也不迟。`,
curious: `
早安，今天会遇见什么有意思的事呢？|{称呼}，我想多留意一下身边的细节。|新的安排，会不会带来新的发现？
为什么会这样？我想听听你的看法。|这个细节很有趣，可以再说一点吗？|我发现自己又多了一个问题。
它的动作有规律吗？我会留意。|先跟着你的目标观察。|认真看，也认真出手。
试试这个角度。|这次反应，我想看清楚。|找到了一个值得尝试的空隙。
原来这一招要这样应对。|先修正动作，别再白白受伤。|这个教训可以记下来。
先把你好好护住，问题以后再问。|{称呼}，我该先帮你处理伤势。|现在最重要的是让你稳下来。
赶上了，原来我也能做到这个。|先确认你没事，再看看我的状态。|这次配合值得记住。
赢了！刚才那段节奏很有意思。|可以把有用的发现整理一下。|战斗结束了，我还有些想和你聊的细节。
我需要修复，暂时不能继续观察了。|这次先停下，之后再整理原因。|回路安静下来时，也能想想刚才的事。
新变化出现了，我想仔细感受。|谢谢材料，我们试试新的培养方向吧。|成长之后，会有怎样的新配合呢？
欢迎回来，最近有什么想分享的事吗？|又能听你的想法了，真好。|今天也许会有新的问题值得一起想。
休息时也可以聊点有趣的事。|好，我把问题先收起来。|不急着得到答案，也挺好的。`,
gentle: `
早安，今天按舒服的步子来吧。|{称呼}，愿今天有一些轻松的时刻。|我在这里，等你慢慢准备。
嗯，我在听。|你可以把想法说完整，不用着急。|如果你愿意，我可以陪你一起想。
我们照顾好彼此，再认真应对。|我会跟着你的节奏。|先稳住心绪，目标已经看清了。
这一击，我会认真完成。|配合着来，不必抢快。|看见空隙了。
有点受损，不过先别自责。|我会留意自己的状态。|慢一点调整，也来得及。
先照顾你的伤，好吗？|{称呼}，现在可以把一部分交给我。|不必硬撑，我会陪你稳下来。
赶上了，先缓一口气吧。|这一记分担掉了，你还好吗？|我在这里，我们再确认一下状态。
辛苦了，这一场配合得很好。|可以松一口气了。|赢了，也别忘记照看自己的伤。
我需要休息，不用为此责怪自己。|修复会让状态好起来的。|先到这里吧，我们都不必勉强。
谢谢你认真照料我。|我能感觉到一点一点的成长。|新的材料让回路更顺畅了。
欢迎回来，见到你很安心。|不用赶着补上什么，我们从今天开始。|你愿意的话，我想听听你的近况。
好，休息一会儿吧。|把紧绷的地方慢慢放松。|现在不用完成什么，也可以。`,
witty: `
早安，今天的计划可别把休息漏掉。|{称呼}，我已就位，等一个好主意。|新的一天，先把脑筋转起来。
这主意有点意思，我想接着听。|我有个小转弯，看看能不能派上用场。|别急，问题也许没看上去那么板正。
跟住目标，别跟着它的花招跑。|先看看谁更会抓空隙。|我把眼睛放亮了。
这个破绽，藏得不够好。|换个角度就顺手了。|时机不错，收下这一击。
刚才那下，提醒我别得意太早。|好吧，该把防守拧紧一点。|疼倒是真的，嘴硬也不顶用。
先别逞强，这回轮到我帮你。|{称呼}，你的状态比漂亮出手更要紧。|把危险先拨开，别急。
差一点就没赶上，好在接住了。|这一手配合，还算及时吧。|先不说漂亮话，看看你的伤。
赢得不错，没白转这些脑筋。|这场可以记一笔好配合。|危险过去了，现在才适合松口气。
看来这回得先找维修包了。|嘴上再灵巧，也得让回路休息。|暂停一下，别拿损伤硬撑场面。
手脚又利索了一点。|这份材料花得挺有章法。|新的变化，我想找个合适的用法。
欢迎回来，好主意也一起带来了吗？|又能一起琢磨事情了。|{称呼}，今天从哪个小难题下手？
好，今天先给齿轮放个假。|歇一歇，脑筋也需要空隙。|现在不赶时间，挺好。`,
steady: `
早安，先把眼前的事情安排妥当。|{称呼}，我准备好了。|今天也一步一步来。
慢慢说，我在听。|先做最要紧的那一件。|可以把事情分成几步。
站稳，按节奏来。|目标确认，我会持续照应。|不抢，也不乱。
这一击要稳。|时机到了。|动作做好，再接下一步。
先稳住受损的地方。|我会调整，不必慌张。|状态还在掌握之中。
先保住你的安全余量。|{称呼}，把这一步交给我。|缓一缓，我们重新站稳。
接住了，接下来保持稳当。|这一下已经分担，别乱了步子。|我还能继续照应。
结束了，做得很好。|把伤势和收获都检查一下。|稳稳走过来，也值得高兴。
需要修复了，先停止行动。|休整好，再继续。|这一段先到这里。
成长很实在，我会慢慢熟悉。|这些材料让基础更扎实了。|又稳当了一点，谢谢你。
欢迎回来，今天从这里开始。|不用急，我们还有自己的步子。|见到你很好，先安顿下来吧。
好好休息，事情可以稍后再做。|现在先恢复状态。|坐一会儿吧，不用一直忙。`,
brave: `
早安，今天也有值得向前的一步。|{称呼}，你定方向，我会认真跟上。|准备好了，就一起出发。
困难可以说清楚，不必假装没有。|我愿意试，但也会听你的判断。|只要决定了，我们就认真做。
我不会乱冲，但也不会先退缩。|目标一致，一起面对它。|看清危险，然后行动。
就是这里，向前！|这一击，我会承担好。|不躲开该面对的空隙。
受伤了，就把动作做得更清楚。|我会判断自己的余力。|还能走，但不能乱来。
{称呼}，先稳住，我来争取机会。|这一步让我靠前一些。|你先处理伤势，我会照应。
我赶上了，这一记没有白接。|先别看我，看清下一步。|能分担这一点，我愿意。
走过来了，我们都认真做了。|这场勇气没有白费，判断也是。|赢了，先把伤照顾好。
我得停下来，继续硬撑没有意义。|这次先修复，下次再并肩。|暂时退下，也是为了还能向前。
可以承担更多，但我会记住分寸。|谢谢这些材料，我会把力量用稳。|又向前一步，接下来继续磨合。
欢迎回来，我们又能并肩了。|过去的日子不用补偿，今天一起走就好。|{称呼}，你准备好时叫我。
好，暂时卸下紧绷。|认真休息，下次才站得稳。|我会留在这里，等你安排下一步。`
};

const axisRows = [
 ['risk','风险取向','步步确认|试探先行|留有退路|稳中求进|审时度势|果断出手|迎难而上|锐意争先|以险求机|背水向前'],
 ['care','守护倾向','尊重独立|远距照应|及时提醒|并肩协助|稳妥掩护|优先支援|护主心切|寸步相守|临危挺身|舍身守护'],
 ['tactics','战术兴趣','锋线偏好|术式偏好|厚甲偏好|修护偏好|身法偏好|封锁偏好|持续偏好|应变偏好|攻辅均衡|守辅均衡'],
 ['expression','表达方式','寡言|简洁|直率|温和|活泼|细腻|诙谐|庄重|诗意|俏皮'],
 ['closeness','相处分寸','礼貌相待|保持分寸|熟后亲近|默默陪伴|认真倾听|主动关心|并肩分享|亲昵自然|坦率依赖|深情内敛'],
 ['curiosity','好奇方向','专注眼前|留意声响|观察自然|关注器物|探究魔法|喜爱传说|善察情绪|追问原因|乐于尝试|记录见闻'],
 ['discipline','行动习惯','自主判断|接受建议|默契协同|计划执行|秩序分明|重视承诺|守时有序|任务专注|精于复盘|按约而行'],
 ['feedback','反馈习惯','坦然接受|认真反省|寻找原因|先作安慰|鼓励再试|提出办法|幽默化解|记住教训|静静陪同|庆祝进步'],
 ['emotion','情感表达','平静自持|情绪细腻|容易惊喜|富有同理|善于感激|期待相逢|珍惜回忆|浪漫想象|温暖乐观|羞于表达'],
 ['interest','生活兴趣','爱看天空|喜欢雨声|珍爱花草|收集故事|研究地图|喜看火光|爱听钟声|偏爱整洁|喜欢起名|爱数星星']
];
const traitAxes = axisRows.map(([id,name,names]) => ({id,name,maxSelected:1,traits:names.split('|').map((traitName,index)=>({id:`${id}_${String(index+1).padStart(2,'0')}`,name:traitName,ordinal:index+1,birthWeight:100}))}));
// 序号范围构成出生兼容矩阵。不是简单抽到冲突词条后让界面把它隐藏。
const compatibleRanges = {
 aggressive:{risk:[6,10],care:[1,8],expression:[2,10]},
 cautious:{risk:[1,5],care:[1,8],expression:[1,8]},
 guardian:{risk:[3,8],care:[6,10],closeness:[3,10]},
 timid:{risk:[1,4],care:[1,7],expression:[1,6]},
 analytical:{risk:[3,7],expression:[1,4],emotion:[1,5]},
 enthusiastic:{risk:[4,9],expression:[3,10],emotion:[3,9]},
 persistent:{risk:[4,9],discipline:[3,10]},
 curious:{risk:[3,8],curiosity:[2,10]},
 gentle:{risk:[2,7],care:[3,9],expression:[2,6]},
 witty:{risk:[3,8],expression:[3,10]},
 steady:{risk:[2,6],expression:[1,8],emotion:[1,7]},
 brave:{risk:[6,10],care:[4,10],expression:[2,9]},
};
const domainNames = ['战锋','灵术','守御','支援','灵巧','干扰','持续','应变'];
const tacticsDomains = [['战锋'],['灵术'],['守御'],['支援'],['灵巧'],['干扰'],['持续'],['应变'],['战锋','支援'],['守御','支援']];
const normalSkillDomains = Object.fromEntries(Array.from({length:96},(_,i)=>[`N${String(i+1).padStart(3,'0')}`,[domainNames[Math.floor(i/12)]]]));
const specialDomains = [
 ['战锋'],['灵术'],['守御'],['灵巧'],['支援'],['灵巧','战锋'],['持续','战锋'],['应变'],
 ['应变','灵术'],['应变','灵巧'],['守御','支援'],['战锋','干扰'],['守御','持续'],['支援','持续'],['守御','持续'],['应变','灵术'],
 ['战锋'],['灵术','干扰'],['灵术'],['干扰','灵术'],['干扰'],['守御'],['支援'],['战锋','灵巧'],
 ['战锋'],['灵术'],['支援'],['守御'],['战锋','应变'],['应变','守御'],['灵术'],['战锋','应变']
];
const specialSkillDomains=Object.fromEntries(specialDomains.map((domains,i)=>[`S${String(i+1).padStart(3,'0')}`,domains]));
const crossRules = [
 {ifAll:['expression_01'],forbid:['emotion_08'],reason:'寡言配浪漫想象容易被模板实现成滔滔长诗，V1 暂不合取'},
 {ifAll:['risk_01'],forbid:['care_10'],reason:'步步确认与舍身守护对危急行动的优先承诺相反'},
 {ifAll:['closeness_02'],forbid:['care_08','emotion_06'],reason:'保持分寸不同时承诺寸步相守或高频期待表达'},
 {ifAll:['expression_08'],forbid:['feedback_07'],reason:'庄重与惯常幽默化解使用不同固定表达承诺'},
];

const dialogues=[];
for(const persona of personas){
 const base=speech[persona.id].trim().split('\n').map(s=>s.trim());
 const extra=additionalSpeech[persona.id].trim().split('\n').map(s=>s.trim());
 assert.equal(base.length,events.length,persona.id);
 assert.equal(extra.length,events.length,persona.id);
 base.forEach((row,eventIndex)=>{
  const original=row.split('|'),added=extra[eventIndex].split('|');
  assert.equal(original.length,3);assert.equal(added.length,6);
  [...original,...added].forEach((raw,index)=>{
   // “我们”是复数，不应成为“在下们”；自称用独立槽位，称呼玩家仍用{称呼}。
   const text=raw.replace(/我(?!们)/g,'{自称}');
   dialogues.push({id:persona.id+'_'+events[eventIndex]+'_'+(index+1),personaId:persona.id,event:events[eventIndex],text,requires:events[eventIndex]==='intercept'?['intercept_succeeded']:events[eventIndex]==='level_up'?['material_level_increased']:events[eventIndex]==='victory'?['battle_won']:events[eventIndex]==='reunion'?['absence_days_at_least_3']:[],source:'authored_seed',reviewStatus:'design_reviewed_not_runtime_tested'});
  });
 });
}
for(const old of (legacyLibrary?.dialogues ?? []).filter(d=>Number(d.id.split('_').at(-1))<=3)){
 const now=dialogues.find(d=>d.id===old.id);assert.ok(now,old.id);
 assert.equal(now.text.replaceAll('{自称}','我'),old.text.replaceAll('{自称}','我'),old.id+': original wording changed');
}
const library={
 schemaVersion:1,corpusRevision:2,title:'机巧',status:'design_seed_library_not_trained_model',
 allowedPlaceholders:['称呼','自称','主人','人偶','敌人'],
 addressing:{profiles:addressProfiles,priority:['player_override','saved_instance_default','persona_default'],persistAtBirth:true,randomizePerMessage:false,selfAndOwnerAreSeparate:true,maxCustomOwnerGraphemes:8,maxCustomSelfGraphemes:4,maxRenderedQuoteGraphemes:40,overflowPolicy:'choose_shorter_eligible_quote_or_omit_optional',escapeCustomValues:true},
 selection:{coreCount:1,facetCount:4,onePerAxis:true,alignmentBranch:0.75,explorationBranch:0.25,rarityWeightRetained:true},
 personas,traitAxes,compatibleRanges,crossRules,
 skillDomains:{normal:normalSkillDomains,special:specialSkillDomains,tacticsTraitBoost:tacticsDomains},
 events:events.map((id,i)=>({id,name:eventNames[i]})),dialogues,
 repetition:{exactTextHistoryDays:180,recentMainClauseWindow:20,noInfiniteUniquenessGuarantee:true,exhaustionFallback:'short_nonfictional_status_or_omit_optional_quote'},
 privacy:{collectPrivateMessages:false,publicCustomQuotesDefault:false},
};
assert.equal(dialogues.length,1296);
assert.equal(traitAxes.flatMap(a=>a.traits).length,100);
assert.equal(new Set(dialogues.map(d=>d.id)).size,1296);
assert.equal(new Set(dialogues.map(d=>normalizeQuote(d.text))).size,1296,'punctuation/address normalized duplicates');
for(const d of dialogues){
 assert.ok(Array.from(renderExample(d.text,personas.find(p=>p.id===d.personaId))).length<=40,d.id+': rendered too long');
 for(const m of d.text.matchAll(/\{([^}]+)\}/g))assert.ok(library.allowedPlaceholders.includes(m[1]));
 assert.ok(!d.text.includes('{自称}们'));
}
for(const p of personas){const profile=addressProfiles[p.id];assert.ok(profile.ownerOptions.includes(profile.ownerDefault));assert.ok(profile.selfOptions.includes(profile.selfDefault));for(const event of events)assert.equal(dialogues.filter(d=>d.personaId===p.id&&d.event===event).length,9);}
// 字面近似检查并不等于语义完全不同；跨库检查避免换标点/称呼凑句数。
const nearRows=dialogues.map(d=>{const normalized=normalizeQuote(d.text);return {id:d.id,normalized,grams:new Set(Array.from({length:Math.max(0,normalized.length-1)},(_,i)=>normalized.slice(i,i+2)))};});
const nearPairs=[];
for(let i=0;i<nearRows.length;i++)for(let j=i+1;j<nearRows.length;j++){
 const a=nearRows[i],b=nearRows[j];if(Math.min(a.normalized.length,b.normalized.length)<7)continue;
 let common=0;for(const gram of a.grams)if(b.grams.has(gram))common++;
 const dice=2*common/(a.grams.size+b.grams.size);
 if(dice>=.72)nearPairs.push({first:a.id,second:b.id,dice});
}
assert.equal(nearPairs.length,0,JSON.stringify(nearPairs));
library.corpusValidation={authoredVariantsPerPersonaEvent:9,normalizedUniqueTexts:new Set(nearRows.map(r=>r.normalized)).size,nearDuplicateMetric:'character_bigram_set_dice',nearDuplicateThreshold:.72,nearDuplicateMinimumLength:7,nearDuplicatePairs:nearPairs.length,semanticUniquenessGuaranteed:false};
for(const key of ['personas','traitAxes','compatibleRanges','crossRules','skillDomains'])if(legacyLibrary)assert.deepEqual(library[key],legacyLibrary[key],key+': unrelated settings changed');
// 穷举验证每个核心性格、任选四个不同轴都至少存在一组符合显式约束的词条。
let checkedAxisSets=0;
for(const p of personas){
 const choices=traitAxes.map(a=>a.traits.filter(t=>{const range=compatibleRanges[p.id]?.[a.id];return !range||t.ordinal>=range[0]&&t.ordinal<=range[1]}));
 for(let a=0;a<7;a++)for(let b=a+1;b<8;b++)for(let c=b+1;c<9;c++)for(let d=c+1;d<10;d++){
  const axes=[a,b,c,d];let found=false;
  const visit=(index,selected)=>{if(found)return;if(index===4){found=true;return;}for(const t of choices[axes[index]]){const next=[...selected,t.id];if(crossRules.some(r=>r.ifAll.every(x=>next.includes(x))&&r.forbid.some(x=>next.includes(x))))continue;visit(index+1,next);}};
  visit(0,[]);assert.ok(found,`${p.id} ${axes}`);checkedAxisSets++;
 }
}
writeFileSync(join(directory,'机巧人格与语录种子库V1.json'),JSON.stringify(library,null,2)+'\n','utf8');
const preview=['# 机巧 · 语录示例','','语录库现有1296句：12种性格×12类事件×每类9句，为原来的三倍。下表每类展示3种选择（原第1句、新第4句、新第7句），共432句示例。全部9句见[语录库JSON](机巧人格与语录种子库V1.json)。没有训练或部署对话模型，运行时按事件去重尚未实装。','','“主人、阁下、汝”等是对玩家的称呼；“在下、吾”等是人偶自称。默认随性格绑定，玩家可分别覆盖，不能每条消息重新随机。例句按默认称呼渲染，不在每句话前强塞称谓。',''];
preview.push('| 性格 | 默认称呼玩家 | 默认自称 |','| --- | --- | --- |');
for(const p of personas)preview.push('| '+p.name+' | '+addressProfiles[p.id].ownerDefault+' | '+addressProfiles[p.id].selfDefault+' |');
preview.push('');
for(const p of personas){
 preview.push('## '+p.name,'','语气：'+p.voice+'。技能主倾向：'+p.primary+'，次倾向：'+p.secondary+'。默认称呼：'+addressProfiles[p.id].ownerDefault+'；自称：'+addressProfiles[p.id].selfDefault+'。','','| 事件 | 选择一 | 选择二 | 选择三 |','| --- | --- | --- | --- |');
 for(let i=0;i<events.length;i++){
  const pool=dialogues.filter(d=>d.personaId===p.id&&d.event===events[i]);
  preview.push('| '+eventNames[i]+' | '+[0,3,6].map(index=>renderExample(pool[index].text,p)).join(' | ')+' |');
 }
 preview.push('');
}
writeFileSync(join(directory,'机巧语录示例V1.md'),preview.join('\n')+'\n','utf8');
console.log(JSON.stringify({personas:personas.length,traits:100,dialogues:dialogues.length,compatibleCoreAndAxisSets:checkedAxisSets,uniqueTexts:new Set(dialogues.map(d=>d.text)).size,normalizedUniqueTexts:new Set(dialogues.map(d=>normalizeQuote(d.text))).size,perPersonaEvent:9,previewQuotes:432,nearDuplicatePairs:nearPairs.length,outputs:['机巧人格与语录种子库V1.json','机巧语录示例V1.md']}));
