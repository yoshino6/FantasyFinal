import { advancedProfessionByCode, inheritancePassiveFor, renameAdvancedMentorText, type AdvancedProfession } from './advanced-profession.config';
import { spiritDefinitions } from './spirit-summoner.config';

type MentorDialogue = { introduction: string; chats: { morning: string; afternoon: string; evening: string }; success: string };

const relation = (affinity: number) => affinity >= 500 ? '他看见你时，语气比从前松缓了些。' : affinity >= 200 ? '他认出了你，停下手里的事认真回应。' : affinity >= 50 ? '他向你点头，示意可以聊几句。' : '他先打量了你一眼，随后平静地开口。';
const period = () => { const hour = new Date().getHours(); return hour < 11 ? 'morning' as const : hour < 18 ? 'afternoon' as const : 'evening' as const; };

export const mentorDialogues: Record<string, MentorDialogue> = {
  mentor_bulwark_gareth: { introduction: '盾卫不是把所有伤害都扛在身上，而是在最危险的一瞬，替队友守住仍能选择的余地。加雷斯会教你判断何时站定、何时让步，以及一面盾该为谁举起。', chats: { morning: '加雷斯在根须旁擦拭旧盾。“晨练时先检查站姿。脚下不稳，再厚的盾也会被撞开。”', afternoon: '加雷斯看着树影移动。“下午的风会让人松懈。真正的守卫，应在没人看见时也保持警觉。”', evening: '加雷斯把盾靠在石旁。“夜里最难守的不是路口，是疲惫。回去休息，也是一种负责。”' }, success: '加雷斯的盾重重落在地上，根须间的尘屑随之散开。他没有立刻称赞，只让你回想方才每一次后退与站定。“你终于明白，盾不是为了挡住世界，而是让身后的人仍有向前的一步。”他将旧盾的缺角贴向你的掌心，光纹沿着臂甲亮起。世界树的叶影掠过肩头，你听见同伴的脚步声，也第一次清楚知道自己愿意守住什么。\n\n你已二转成功：盾卫。' },
  mentor_warlord_oren: { introduction: '战旗使以位置、号令和时机连接队伍。奥伦不教人只顾着冲在最前，而是让每个人在混战里知道该跟随什么、相信什么。', chats: { morning: '奥伦校正旗绳。“晨风最诚实。旗先向哪边倒，队伍就该先知道哪里有风。”', afternoon: '奥伦望向远处。“午后喧闹，号令要短。战场上说得太多，反而没人听得见。”', evening: '奥伦收起战旗。“夜里清点人数，比清点战果重要。别漏下任何一个人。”' }, success: '奥伦将战旗递给你，却没有替你系上旗结。你在风里亲手把旗结勒紧，回忆起山麓中每一次呼喊、停步与转向。“旗帜不会替队伍赢下战斗，”他朗声说道，“它只提醒所有人，他们并非独自站在这里。”旗面被叶脉的光照亮，风从你身后穿过，仿佛有许多人同时向前。你抬起旗杆，声音不再被风吞没。\n\n你已二转成功：战旗使。' },
  mentor_ironbreaker_noll: { introduction: '剑豪追求的是准确而克制的锋芒。诺尔要你明白，一剑的价值不在声势，而在看见破绽后仍能忍住多余的挥砍。', chats: { morning: '诺尔用钝剑敲了敲石面。“清晨练慢剑。慢下来，才能看出自己的手什么时候在发抖。”', afternoon: '诺尔看着晒热的岩石。“热会让人急，急会让剑路变宽。剑路宽了，空当就多。”', evening: '诺尔收剑入鞘。“今天的剑到这里。把一半力气留给明天，才走得远。”' }, success: '诺尔没有闪开最后一剑。剑势在他身前停住，只有风从刃脊滑过去。他望着你，许久后才点头：“这一剑该停就停，才算真能出。”岩脊核心在掌中裂开细亮的纹路，映出你曾犹豫、也曾果断的每一次挥斩。诺尔将木片从你的剑刃旁取下，锋光并不刺眼，却足以切开前路。你收剑时，心里只剩一条清楚的线。\n\n你已二转成功：剑豪。' },
  mentor_elementalist_sen: { introduction: '元素使并非单纯堆叠更大的法术。澜烬教导的是读懂火、冰、风与雷的关系，在失衡前借势，在失衡后复位。', chats: { morning: '澜烬捻起一片带露的叶子。“晨雾里火最躁，冰最静。先看见差异，再谈掌控。”', afternoon: '澜烬听着枝叶摩擦。“午风杂乱，别急着施法。让元素先告诉你它想往哪去。”', evening: '澜烬熄去指尖火光。“夜里元素会收声。能听见收声的人，才配让雷鸣回应。”' }, success: '澜烬抬手让最后一缕火星停在你们之间。它没有爆裂，只在冰冷的根影里安静旋转。你循着风、温度、雷鸣与魔力的细微变化，将错位的回响重新归到平衡。“这不是压服，”澜烬说，“而是回应。”火星在你掌中分成数色光点，沿着叶脉远去又回归。你第一次感到元素并非远处的工具，而是愿意与你共同呼吸的潮汐。\n\n你已二转成功：元素使。' },
  mentor_summoner_mia: { introduction: '唤灵师不是只带着一只灵兽作战的人。米娅教导灵契、灵位与分工：炽羽雀负责追击，清泉鹿照看伤者，苔甲龟守住阵线，逐风貂与弯月猫则改写敌我节奏。真正的共鸣，是让不同的回应在同一场战斗里各得其所。', chats: { morning: '米娅在三张空椅前各放一束叶芽。“早安。先别急着叫醒它们；想一想，今天谁该照看队伍，谁该盯住敌人。”', afternoon: '米娅侧耳听风。“午后的灵息说得很快。听清不同的声音，别让最响亮的那个替所有人作答。”', evening: '米娅替枝灯添油。“夜里最适合练习收回灵契。会让灵兽安心归位的人，才不会在危急时把同伴忘在身后。”' }, success: '米娅没有替你驱散最后一道灵息。炽羽雀先落在你的肩头，清泉鹿随后从根须间踏出，苔甲龟伏在石旁，逐风貂与弯月猫也在不同的位置停下。它们没有争抢同一个命令，而是各自看向前线、伤者与仍未熄灭的枝灯。米娅轻声说：“这才是灵契。不是把所有力量握紧，而是知道何时让每一份回应去完成它最擅长的事。”微光在你身旁连成安静的环，像为未来留出的更多席位。\n\n你已二转成功：唤灵师。' },
  mentor_spellblade_vane: { introduction: '战斗法师将术式带到近身距离。维恩重视脚步、时机与护身咒的衔接，让施法者在逼近的威胁前也能保持自己的节奏。', chats: { morning: '维恩把法杖横在腕上。“早上先练两步。一步进攻，一步脱离，别把它们混成逃跑。”', afternoon: '维恩转了转短杖。“太阳越高，影子越短。靠得越近，咒语越要干净。”', evening: '维恩收拢魔力。“夜战最怕贪招。留一道咒给自己，才有资格谈赢。”' }, success: '维恩的术刃停在你眉前，而你的咒纹也恰好封住他下一步的位置。短暂的寂静后，他笑了：“这才是两步之间。”你没有靠蛮力拉开距离，也没有退到咒语够不着的地方；每一次移动都给下一道术式留下了位置。世界树的光沿着你的武器与掌纹并行，金属与魔力不再互相排斥。你踏出一步，近处的危险反而变得清晰。\n\n你已二转成功：战斗法师。' },
  mentor_nightblade_loke: { introduction: '夜刃擅长从缝隙切入，也要为同伴留下退路。洛克不把隐匿当作逃避，而是把它视作看清战场、选择关键一击的能力。', chats: { morning: '洛克站在树影边缘。“早上的影子短，别怪它不够藏人。先学会不让人想看你。”', afternoon: '洛克摸了摸地面的灰。“午后脚印最明显。能回来的人，才配谈潜入。”', evening: '洛克望向远枝。“夜色会帮你，也会骗你。不要把黑暗误认成安全。”' }, success: '洛克在你视野中消失的瞬间，你没有追着影子乱斩。你停下脚步，等风吹动叶片、等脚下灰尘留下不该有的痕迹，随后将刃锋送向唯一的空隙。他的短刃在半空停住，随即收入鞘中。“你终于会看见退路，也会看见该出手的时机。”根影落在肩头，却不再遮住方向。你离开时没有留下多余脚印，只留下能够带同伴回来的路。\n\n你已二转成功：夜刃。' },
  mentor_venomancer_ning: { introduction: '蚀毒师研究的是剂量、时机与后果。宁要求你既能让敌人失去节奏，也始终为伤势、同伴与局势留下可控的解法。', chats: { morning: '宁在晨露里分拣药叶。“同样的草，露水不同，药性就不同。别信名字，信观察。”', afternoon: '宁封好一支药瓶。“太阳太烈，药会变，人也会。下手前多问一遍为什么。”', evening: '宁把解毒剂放回腰包。“夜里用毒更容易，留下解法却更难。别忘了后一件事。”' }, success: '宁将两支颜色相近的药剂放在石面上，让你自己选。你没有急着取毒性更强的那支，而是先辨认余烬、湿度与目标身上的旧伤。最后的药痕被你稳稳封住，没有继续蔓延。“很好，”她说，“你知道力量要在哪里停下。”岩脊核心的冷光融入瓶底，像给锋刃留了一道清醒的界线。你握住新的药瓶，明白真正的掌控从不以失控为代价。\n\n你已二转成功：蚀毒师。' },
  mentor_trickster_vera: { introduction: '机关游侠用路线、机关与判断改写战场。维拉教你预判敌人的选择，让同伴走向安全，让威胁走进你预留的空位。', chats: { morning: '维拉拉紧一根细线。“清晨风轻，最适合校准。机关不怕复杂，怕的是差一寸。”', afternoon: '维拉看着索道晃动。“下午的风会骗人。别只看线怎么动，要看是谁让它动。”', evening: '维拉收起钩索。“入夜前检查每个结。留下一个松结，明天就可能少一个同伴。”' }, success: '维拉的细线在根影间交错，逼你在极短的时间里选择落点。你没有只盯着她的位置，而是看见风向、石面和她故意留下的空隙。机关被你一一反向利用，最后的响扣恰好落在她身后。“不错，你开始让战场自己说话了。”岩脊核心嵌入新的机括，发出清脆而稳定的回响。你收线时，前方的路已经被悄悄分成了敌人会走的路与同伴该走的路。\n\n你已二转成功：机关游侠。' },
  mentor_saint_mare: { introduction: '圣愈者以治疗、净化和续航维系队伍。玛蕾希望你理解，治愈不是否认伤痛，而是让受伤的人仍有再次选择前路的力量。', chats: { morning: '玛蕾整理白枝。“早上的伤口最诚实。先替它清洁，再谈让它愈合。”', afternoon: '玛蕾给叶片浇水。“午后最容易透支。别等倒下了，才想起休息。”', evening: '玛蕾护住烛火。“晚归的人需要灯，也需要有人说一句：你已经做得够多。”' }, success: '玛蕾让你走到最后一盏枝灯前。灯火很弱，周围却仍有被惊扰的灵息徘徊。你没有急着让光变得刺眼，而是先安抚、净化，再一点点续上温度。灯终于亮起，照见每一道归途。“你记得了，”玛蕾微笑道，“治疗不是替谁承担全部痛苦，而是让他们有继续前行的勇气。”柔和的白光绕过你的手腕，像一份不必说出口的承诺。\n\n你已二转成功：圣愈者。' },
  mentor_aegis_hector: { introduction: '圣盾使以祷言与壁垒替队伍争取时间。赫克托的教导并非让你永远不退，而是让你知道何时站在缺口前、何时把机会交给同伴。', chats: { morning: '赫克托检查祷墙裂缝。“晨光能照出细缝。守护从来不是等裂缝变大才开始。”', afternoon: '赫克托扶住石墙。“午后石头发烫，手会松。誓言也一样，越累越要记得它。”', evening: '赫克托收起祷典。“守夜的人不必一直清醒，但交班前要确认下一盏灯亮着。”' }, success: '赫克托连续三次重击落下，你没有用蛮力硬顶，而是将祷言与盾面在最恰当的瞬间衔接。冲击顺着壁垒散开，身后的根须毫发无损。他放下手臂，低声念完最后一句祷词：“这面盾现在有了该有的重量。”石墙上的裂纹被温和的光填平，也映出你站在缺口前的身影。你并未变得不可撼动，却已能为同伴争取最宝贵的一息。\n\n你已二转成功：圣盾使。' },
  mentor_dawn_sola: { introduction: '晨星祷者把光化为攻击与祝福。索拉要求你辨认光该照向何处：不是替人决定道路，而是在最需要时给出方向与勇气。', chats: { morning: '索拉望着枝隙的天光。“第一束光不急着驱散黑暗，它先让人看见脚下。”', afternoon: '索拉拨正晨星坠饰。“午光最亮，也最容易让人看不见阴影。别忘了回头照顾同伴。”', evening: '索拉合拢掌心微光。“夜并不等于失败。只要还有一颗晨星，方向就还在。”' }, success: '索拉让你在明灭不定的光幕中前行。每一次你想把光推得更亮，黑暗便从别处反扑；直到你学会把光落在同伴、路标与敌人最关键的破绽上，晨星才真正稳定下来。“光不是命令，”索拉说，“它是邀请人继续向前的理由。”一枚柔亮星痕在你掌中成形，穿过世界树的枝冠直指天际。你举起它时，也为身边的人照出了一段能走下去的路。\n\n你已二转成功：晨星祷者。' }
};

for (const dialogue of Object.values(mentorDialogues)) {
  dialogue.introduction = renameAdvancedMentorText(dialogue.introduction);
  dialogue.chats.morning = renameAdvancedMentorText(dialogue.chats.morning);
  dialogue.chats.afternoon = renameAdvancedMentorText(dialogue.chats.afternoon);
  dialogue.chats.evening = renameAdvancedMentorText(dialogue.chats.evening);
  dialogue.success = renameAdvancedMentorText(dialogue.success);
}

export const mentorChatDialogue = (mentorCode: string, affinity: number) => {
  const dialogue = mentorDialogues[mentorCode];
  return dialogue ? `${dialogue.chats[period()]}\n${relation(affinity)}` : '导师沉默地看着世界树的叶影。';
};
export const mentorSuccessDialogue = (professionCode: string) => {
  const profession = advancedProfessionByCode(professionCode);
  return profession ? mentorDialogues[profession.mentor.code]?.success : undefined;
};

/** 二转前只谈方向；完整数值与机制在仪式完成后才作为职业档案公开。 */
export const advancedProfessionReveal = (profession: AdvancedProfession) => {
  const introduction = mentorDialogues[profession.mentor.code]?.introduction ?? profession.role;
  const lines = [`职业定位：${profession.role}`, `核心玩法：${introduction}`, `固有被动【${profession.passive.name}】：${profession.passive.description}`];
  const inheritance = inheritancePassiveFor(profession.code);
  if (inheritance) lines.push(`传承被动【${inheritance.name}】：${inheritance.ownDescription}`, `旁修效果：${inheritance.studyDescription}（Lv.30 后可在其他导师处学习；只能装备一条已学旁修。）`);
  if (profession.code === 'spirit_summoner') {
    lines.push(`灵契名录：${spiritDefinitions.map(spirit => `${spirit.name}（${spirit.role}）`).join('、')}`);
    lines.push(`灵兽继承：${spiritDefinitions.map(spirit => `${spirit.name} HP${Math.round(spirit.statScale.hp * 100)}%｜法攻${Math.round(spirit.statScale.magicAttack * 100)}%｜双防${Math.round(spirit.statScale.physicalDefense * 100)}/${Math.round(spirit.statScale.magicDefense * 100)}%`).join('；')}`);
    lines.push('灵兽各自占用灵位、进入独立速度回合，可被怪物攻击；生命归零即退场。');
  }
  return lines.join('\n');
};
