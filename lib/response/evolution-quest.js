import { useEvent, useMessage, Format, useRoute } from 'alemonjs';
import { advanceEvolutionQuest, openGaStudy, contemplateEvolutionSeed, evolutionQuestStage } from '../game/main-quest.service.js';
import { messageFormat } from '../game/message.js';

const libraryButtons = () => Format.createButtonGroup()
    .addRow().addButton('前往 大厅', '/建筑区域 world_library 大厅', { type: 'command', autoEnter: true, style: 'blue' }).addButton('前往 阅览室', '/建筑区域 world_library 阅览室', { type: 'command', autoEnter: true, style: 'blue' })
    .addRow().addButton('前往 资料室', '/建筑区域 world_library 资料室', { type: 'command', autoEnter: true, style: 'blue' }).addButton('前往 休息室', '/建筑区域 world_library 休息室', { type: 'command', autoEnter: true, style: 'blue' })
    .addRow().addButton('前往 无尽回廊', '/建筑区域 world_library 无尽回廊', { type: 'command', autoEnter: true, style: 'blue' })
    .addRow().addButton('离开 世界图书馆', '/建筑离开 world_library', { type: 'command', autoEnter: true });
const investigationStories = {
    hall: {
        title: '世界图书馆·大厅', next: '阅览室',
        text: '接待树灵看了借阅条很久，最终也没能认出借阅者，只将厚重目录推到你面前。\n\n“这类记录很少，大多只是无从解释的个例，未必能回答你的问题。”\n\n你用很久才在“生物奥秘”与“灵阶异常现象”的交叉索引里找见一张破损索引卡。卡片没有名字，只有一行铅笔字：\n\n“进化不是赐福；感知无法承受其变化的人，终会先被世界吞没。”\n\n批注下方印着阅览室的旧索引号。'
    },
    reading: {
        title: '世界图书馆·阅览室', next: '资料室',
        text: '旧索引并未给出研究者姓名。书架上的大多数条目，都只是对少数失控者留下的零碎描述，既没有共同规律，也没有可供复制的突破方法。你翻过一整排关于寿命、灵魂与异常感知的书，终于在一本夹页中找见同样的笔迹。\n\n批注写道：真正的突破会扩大感知，代价则是灵魂必须承受万千信息的涌入；若来者的灵魂本就带着不属于此世的痕迹，变化或许会比常理更早降临。\n\n页面角落压着一枚褪色火漆，旁边写着：\n\n“引荐函封存于资料室第七列；留待真正需要它的人。”'
    },
    archive: {
        title: '世界图书馆·资料室', next: '休息室',
        text: '第七列并不是第七排书架，而是一组按生命形态归档的无编号木盒。你根据批注中的术语反复比对，才在最底层找出一封封存的引荐函。\n\n信中写道：“若你遇见了无法归入既有灵阶的变化，请去找【噶】。她不会接待慕名而来的人，但会记得真正读懂这封信的人。”\n\n原来这位研究者早已预料，终有一天会有人需要这封信；它并非寄给某个姓名，而是留给同样面对异常灵阶变化、仍愿意追寻答案的人。\n\n信封内侧还有一行短笺：她偶尔会在休息室喝苦茶，随后走进没有尽头的门。'
    },
    rest: {
        title: '世界图书馆·休息室', next: '无尽回廊',
        text: '守馆人看到推荐信后沉默良久，才为你续上一杯同样苦涩的茶。\n\n“她不在任何固定书库。无尽回廊里的每一扇门都可能通向一段知识，也可能什么都没有。她研究的，正是那些无法被现有记录解释的人。别靠运气；带着这封信，记住她写下的那句话——进化从不替人承担代价。”\n\n他将推荐信重新封好交还。书页间吹来微凉的风，像有一扇门正在远处等待。'
    }
};
const libraryTime = () => {
    const hour = new Date().getHours();
    return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
};
const roomAtmospheres = {
    大厅: {
        morning: '晨光穿过世界树的叶脉，在年轮状书梯上洒下细碎光斑。接待树灵正安静整理归还的书册。',
        afternoon: '午后的大厅浮着纸张与木香，来访者沿着书梯上下，偶有书页在高处自行翻动。',
        evening: '夜色被枝冠隔在窗外，馆灯沿书梯逐级亮起，大厅只剩低缓的脚步声与远处的翻页声。'
    },
    阅览室: {
        morning: '晨雾尚未从叶窗散尽，静音叶幕微微垂落，几位读者已在索引抽屉前翻找自己的课题。',
        afternoon: '阅览室的光线温和而稳定，书架间没有交谈，只有羽笔划过纸面的细响。',
        evening: '晚间的阅览室更显空阔，叶脉灯在书脊间投出柔光，散页在无风处轻轻颤动。'
    },
    资料室: {
        morning: '晨光只照到资料室门口，树根般延展的档案架仍浸在幽暗里，封存盒的铜扣泛着冷光。',
        afternoon: '午后的资料室干燥安静，值守人推着小梯在高架间整理无编号的档案盒。',
        evening: '入夜后，资料室的通道被几盏小灯切成明暗不一的段落，远处传来木盒轻合的闷响。'
    },
    休息室: {
        morning: '清晨的休息室飘着淡茶香，研究者们尚未聚起，只留下几只未收好的杯盏。',
        afternoon: '午后有人在低声交换笔记，也有人靠着窗边的枝干小憩，苦茶的香气混着纸墨味。',
        evening: '夜里的休息室只余暖灯与零星交谈，茶壶在炉上发出极轻的沸响。'
    },
    无尽回廊: {
        morning: '回廊深处没有晨光，只有门缝间零星渗出的亮色。你听不见自己的脚步落到了哪里。',
        afternoon: '即使外面正是午后，无尽回廊依旧分不清时辰。成排门户静默伫立，像等待被翻开的书页。',
        evening: '夜色似乎让回廊更深了一层，几盏早已熄灭的魔石灯映不出尽头，唯有门牌的文字缓慢变化。'
    }
};
const worldLibraryFormat = async (qqUserId) => {
    const stage = await evolutionQuestStage(qqUserId);
    const hint = stage === 0 ? '书架与枝干一同向上延展，来访者可以在此自由阅读、查阅资料，或只是找一处安静的角落停留。'
        : stage < 2 ? '树心般安静的大厅里，悬着一枚指向各处馆藏的导览叶。先从大厅的总目录开始。'
            : stage < 5 ? '你掌握的线索尚未连成一线。不同房间里的旧档与值守记录，或许会补上缺失的一环。'
                : stage < 7 ? '无尽回廊深处有一道始终半掩的门。门牌上没有姓名，只有一道像鸟喙般的古老笔画。'
                    : '枝冠间的书页依旧缓缓翻动。你已带着自己的答案离开那条回廊，图书馆重新只是图书馆。';
    return Format.create().addMarkdown(Format.createMarkdown().addTitle('世界图书馆').addNewline().addNewline().addText('世界树的枝干在此形成一座没有尽头的书库。每一层书架都嵌着微亮叶脉，仿佛整株巨树都在记忆。').addNewline().addNewline().addText(hint)).addButtonGroup(libraryButtons());
};
const worldLibraryAreaHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    const area = String(route.param('area'));
    try {
        const stage = await evolutionQuestStage(event.current.UserId);
        const place = {
            大厅: ['大厅', 'hall', '查阅 总目录'],
            阅览室: ['阅览室', 'reading', '检索 生物奥秘'],
            资料室: ['资料室', 'archive', '翻阅 第七列档案'],
            休息室: ['休息室', 'rest', '询问 守馆人']
        };
        if (area === '无尽回廊') {
            const markdown = Format.createMarkdown().addTitle('世界图书馆·无尽回廊').addNewline().addNewline().addBlockquote(roomAtmospheres.无尽回廊[libraryTime()]);
            if (stage === 5 || stage === 6)
                markdown.addNewline().addNewline().addText('你推开通往无尽回廊的门，身后的图书馆仿佛被骤然拉远。这里没有窗，也看不见尽头；两侧的墙壁由深色木纹与古老书脊交错而成，一扇扇门嵌在其中，门牌上的文字会在你注视时悄然变化。\n\n有些门后传来翻页声，有些门缝里漏出星光，还有些门前堆着无人认领的手稿与早已熄灭的魔石灯。你沿着回廊走了很久，脚步声被层层门扉吸走，连时间都像被安静地折进了书页里。\n\n直到你取出那封封存引荐函。信封上的火漆依旧暗淡，回廊尽头却有一扇原本毫不起眼的木门轻轻震了一下。门上没有门牌，只有一道细长的裂纹，像一只正在睁开的眼睛。\n\n你走近时，门后的锁扣自行转动。苦涩的茶香先一步从缝隙里漫出，仿佛里面的人早已知道你会到来。').addNewline().addNewline().addButton('[寻访 噶的研究室]', { data: '/寻访噶的研究室', autoEnter: false });
            await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(libraryButtons()) });
            return;
        }
        const entry = place[area];
        if (!entry)
            throw new Error('不存在该图书馆区域。');
        const expected = { hall: 1, reading: 2, archive: 3, rest: 4 }[entry[1]];
        const markdown = Format.createMarkdown().addTitle(`世界图书馆·${entry[0]}`).addNewline().addNewline().addBlockquote(roomAtmospheres[entry[0]][libraryTime()]);
        if (stage === expected)
            markdown.addNewline().addNewline().addButton(`[${entry[2]}]`, { data: `/图书馆调查 ${entry[1]}`, autoEnter: false });
        await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(libraryButtons()) });
    }
    catch (error) {
        await message.send({ format: messageFormat('图书馆区域不可用', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const evolutionInvestigationHandler = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useMessage();
    try {
        const source = String(route.param('source'));
        await advanceEvolutionQuest(event.current.UserId, source);
        const story = investigationStories[source];
        await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle(story.title).addNewline().addNewline().addText(story.text)).addButtonGroup(Format.createButtonGroup().addRow().addButton(`前往 ${story.next}`, `/建筑区域 world_library ${story.next}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('返回 图书馆', '/建筑进入 world_library', { type: 'command', autoEnter: true })) });
    }
    catch (error) {
        await message.send({ format: messageFormat('线索未推进', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const evolutionGuildHandler = async () => {
    const [event] = useEvent();
    const [message] = useMessage();
    try {
        await advanceEvolutionQuest(event.current.UserId, 'guild');
        const markdown = Format.createMarkdown().addTitle('关于 等级停滞').addNewline().addNewline()
            .addText('莫妮卡翻遍了公会的晋升条例、委托档案和旧百科，仍没能找到二十级后突破的先例。她神色有些为难地合上档案：').addNewline().addNewline()
            .addText('“这种情况……我还从没见过。公会的晋升记录里，也没有谁会在二十级后被这样拦住。你似乎是个特例。”').addNewline().addNewline()
            .addText('莫妮卡沉吟片刻，像是忽然想起什么，转身从旧档的夹层里抽出一页发黄借阅条交给你：').addNewline().addNewline()
            .addText('“公会这里查不出更多东西了。不过我曾见过这张纸——上面写着‘灵阶的自我演化’，馆藏章来自世界图书馆；借阅者的名字被水渍抹去了，只余一个像‘噶’的模糊偏旁。”').addNewline().addNewline()
            .addText('她轻轻摇头：“我无法替你指出那个人在哪。但若真有人研究过你遇到的状况，答案恐怕只会藏在世界树上。”');
        await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('前往 世界图书馆', '/前往 -4 5', { type: 'command', autoEnter: true, style: 'blue' }).addButton('任务', '/任务', { type: 'command', autoEnter: true })) });
    }
    catch (error) {
        await message.send({ format: messageFormat('无法询问', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const gaStudyHandler = async () => {
    const [event] = useEvent();
    const [message] = useMessage();
    try {
        const result = await openGaStudy(event.current.UserId);
        const markdown = Format.createMarkdown().addTitle('大学者·噶').addNewline().addNewline()
            .addText('你说明来意，将封存引荐函放在桌上。门内没有立刻传来回应，只有纸张翻动的轻响。片刻后，一只苍白的手从门缝后伸出，取走了信。\n\n那只手的主人端详了火漆许久，才低声说道：“原来如此。”\n\n木门随之敞开。屋内比你想象得更朴素：古老木桌、堆满笔记的书架、几件正在自行演算的晶质仪器。坐在桌后的女子看上去不过二十余岁，神情却带着一种与年纪并不相称的疲惫与平静。\n\n她示意你坐下，随手为你斟了一杯茶。茶水颜色深得近乎发黑，入口后苦味沿着舌根漫开，久久不散。').addNewline().addNewline()
            .addText('“她很少替人写这种信。”女子将引荐函放到桌边，终于抬头看向你，“所以我本来以为，它不会再被人送到这里。”\n\n她顿了顿，像是在衡量该从何处说起。\n\n“你应该很好奇，我为什么看上去这么年轻。实际上，我已经一百零八岁了。”\n\n你还未从这句话中回过神，她便偏过头咳嗽了几声。那阵咳嗽并不剧烈，却让桌角一盏魔石灯的光随之晃动。\n\n“你的情况，信里已经说得很清楚。你不是单纯地卡在力量不足的地方，而是碰到了一扇从未为常人开启的门。”\n\n她指尖轻敲桌面，桌上的晶片依次亮起，又很快熄灭。\n\n“我这些年研究的，正是这种门后的东西。突破的确存在，但它不会只带来力量。感知、记忆、对世界的理解——它们都会一起被推向更远处。承受得住的人或许能继续前进；承受不住的人，则会在看清世界之前先被它压垮。”').addNewline().addNewline()
            .addText('“代价？”你望向她，“我从异世界来到这里，本就不知道自己该走向哪里。若连自己都无法保护，若不能抵达这世间的极致，我又该如何弄明白来到此处的意义？”\n\n【噶】安静地看着你。许久之后，她眼底的审视渐渐散去，露出一丝几乎看不出来的笑意。\n\n“那就用你的行动回答我。”\n\n她抬起右手，研究室中央的空气泛起深蓝色涟漪。一柄细长法杖自虚空中缓缓浮出，杖身仿佛封着一片静默的深海，压抑而磅礴的力量让四周的书页无风自动。\n\n“我会压制力量。你也可以去找帮手。”\n\n她握住法杖，苦茶的余味仍在空气中萦绕。\n\n“击败我。让我看看你的信念，是否真的足以承受进化之后的世界。”').addNewline().addNewline()
            .addText('——————★接受试炼★——————\n【击败 大学者[噶]】');
        await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('接受试炼', `/目标 ${result.spawnId}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('切磋', '/切磋 ga_library', { type: 'command', autoEnter: true, style: 'blue' }).addButton('返回 图书馆', '/建筑进入 world_library', { type: 'command', autoEnter: true })) });
    }
    catch (error) {
        await message.send({ format: messageFormat('研究室未开启', error instanceof Error ? error.message : '请稍后重试。') });
    }
};
const contemplateEvolutionSeedHandler = async () => {
    const [event] = useEvent();
    const [message] = useMessage();
    try {
        const result = await contemplateEvolutionSeed(event.current.UserId);
        const markdown = Format.createMarkdown().addTitle('感悟 进化之种').addNewline().addNewline()
            .addText('◈你打开木盒，象征着进化的种子正散发诱人的光泽。\n◈你将脸凑近，感受着从中发散出来自灵魂的诱惑。\n◈你的呼吸加快，一缕淡金色的气息自种子中渗透而出，顺着你的鼻息向上。\n◈你的识海瞬间被一股舒爽的感觉侵占。').addNewline().addNewline()
            .addText('◈此刻，你能听闻风的呢喃，能倾听花的倾诉，能辨识元素的踪迹，能感知大地的脉络。\n◈逐渐的，你的感受越叠越多，心绪愈加沉重。\n◈万千信息如同古神的低语，眼前的世界成为了意识的漩涡。\n◈你这才明白，何为学者所说的，来自于进化的诅咒。\n◈你尝试将心神剥离开来，费了九牛二虎之力终于回到了最真实的世界。\n◈然而此时，那颗种子已然消失不见。\n◈你感受到身体深处有一抹生机在蓬勃的跃动。\n这是源自进化的诅咒与祝福。').addNewline().addNewline()
            .addText('————————————').addNewline().addNewline().addText(`【${result.name}】突破灵阶枷锁`).addNewline().addNewline().addText('————————————').addNewline().addNewline().addText(`【${result.name}】等级上限提升！\n【窥尘➡开化】`).addNewline().addNewline().addText('————————————').addNewline().addNewline().addText('发送[进化面板]查看进化信息');
        await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('进化面板', '/进化面板', { type: 'command', autoEnter: true, style: 'blue' })) });
    }
    catch (error) {
        await message.send({ format: messageFormat('无法感悟', error instanceof Error ? error.message : '请稍后重试。') });
    }
};

export { contemplateEvolutionSeedHandler, evolutionGuildHandler, evolutionInvestigationHandler, gaStudyHandler, worldLibraryAreaHandler, worldLibraryFormat };
