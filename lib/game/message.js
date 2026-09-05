import { Format, ResultCode } from 'alemonjs';
import { gifts } from './constants.js';

const sendWithTextFallback = async (message, format, fallbackText) => {
    const results = await message.send({ format });
    if (results.some(result => result.code !== ResultCode.Ok)) {
        await message.send({ format: Format.create().addText(fallbackText) });
    }
};
const messageFormat = (title, content) => Format.create()
    .addMarkdown(Format.createMarkdown().addTitle(title).addNewline().addNewline().addText(content.trimStart()));
const storyScenes = [
    '最后的记忆像被雨水浸透的旧照片。\n刺耳的声响、骤然逼近的黑暗，以及胸口最后一次无力的起伏。你想伸手抓住什么，指尖却先失去了温度。\n\n世界终于安静下来。',
    '雨夜的路灯在水洼里碎成一片片昏黄。\n你本想快些回到温暖的房间，却只来得及听见一声急促的鸣笛。疼痛短得像错觉，随后连雨声也渐渐远去。',
    '拥挤的人群、站台的提示音，以及掌心里还没来得及喝完的热饮。\n世界忽然倾斜，周围的声音被拉得很长。你想起今天原本只是再普通不过的一天。',
    '深夜的屏幕仍亮着，未完成的消息停在输入框里。\n疲惫像潮水一样涌来，你伏在桌前想稍微休息一会儿，却没有再等到天亮。',
    '夏日的蝉鸣响得格外聒噪。\n你站在树荫下，抬头看见天空明亮得近乎刺眼；下一刻，意识像断开的风筝线，轻轻飘向了遥远的地方。',
    '你记得救护车的灯光在视野里旋转，记得有人焦急地呼唤。\n可那些声音隔着越来越深的水面。最后留下的，只有一句没能说出口的“没关系”。',
    '雪落在肩头，很快融成冰冷的水珠。\n你以为自己只是有些困，便靠着墙缓缓坐下。街道依旧有人来往，而你的呼吸先一步停在了冬夜里。',
    '厨房里飘着熟悉的香味，窗外是寻常的黄昏。\n你甚至还在盘算晚些时候要做什么，心口却突然传来陌生的钝痛，将所有计划都按下了暂停。',
    '海风带着咸味扑面而来，远处的浪一遍遍拍打岸边。\n你在潮水的牵引中失去力气，最后看到的，是被夕阳染成金色的海面。',
    '警报声响起时，你还以为那只是一次普通的演习。\n人群匆忙奔跑，尘埃遮住了视线。等一切重新安静，你已听不见自己的心跳。',
    '你把伞递给了陌生人，自己转身走进细密的雨里。\n那一瞬间的善意仍留在心中，可命运没有给你回头的机会；黑暗温柔又残酷地合上了眼帘。',
    '没有惊天动地的告别，也没有人提前预告。\n只是一个平凡的瞬间，你忽然感觉身体变得很轻，仿佛所有牵挂都被留在了原来的世界。'
];
const randomStoryText = () => `\n\n${storyScenes[Math.floor(Math.random() * storyScenes.length)]}`;
const storyFormat = (text = randomStoryText()) => Format.create()
    .addMarkdown(Format.createMarkdown().addTitle('序章·最后一幕（1/6）').addText(text))
    .addButtonGroup(Format.createButtonGroup().addRow().addButton('继续', '/注册 继续', { type: 'command', autoEnter: true }));
const audienceText = '\n\n再次睁开眼时，你正站在一片没有尽头的幽暗空间。\n远处只有一张座椅，一名蓝发少女端坐其上，头顶流转着柔和的神辉。\n她似乎正在等你开口。';
const audienceFormat = () => Format.create()
    .addMarkdown(Format.createMarkdown().addTitle('序章·神界苏醒（2/6）').addText(audienceText))
    .addButtonGroup(Format.createButtonGroup().addRow().addButton('这里是哪里？', '/询问 这里是哪里', { type: 'command', autoEnter: true, style: 'blue' }));
const questionText = '\n\n女神合上手中的册子，平静地回答：“死后的中转站。你在原先的世界已经死亡。”\n她的声音没有怜悯，也没有恶意，只是在陈述一件早已写好的事实。\n“吾名阿库娅，是负责接引这片地区亡者的女神。”';
const questionFormat = () => Format.create()
    .addMarkdown(Format.createMarkdown().addTitle('序章·女神的回答（3/6）').addText(questionText))
    .addButtonGroup(Format.createButtonGroup().addRow().addButton('接引我？', '/注册 继续', { type: 'command', autoEnter: true }));
const destinationText = '\n\n女神轻轻颔首：“对。你可以选择去天堂，在宁静中度过没有烦恼的老年生活；也可以转生到异世界，获得一次全新的开始。”\n“那是一方残酷的世界，魔物、灾祸与未知会在你踏上土地的那刻迎面而来。”\n\n她看着你，等待你的决定。';
const destinationFormat = () => Format.create()
    .addMarkdown(Format.createMarkdown().addTitle('序章·命运的岔路（4/6）').addText(destinationText))
    .addButtonGroup(Format.createButtonGroup().addRow()
    .addButton('前往天堂', '/选择去向 天堂', { type: 'command', autoEnter: true })
    .addButton('转生异世界', '/选择去向 异世界', { type: 'command', autoEnter: true, style: 'blue' }));
const heavenText = '\n\n女神右手一挥，一扇散发暖光的门在你身后浮现。\n门后没有战斗，也没有遗憾，只有安静而漫长的时光。\n但在踏入之前，你仍可以回头，选择那条未知的异世界之路。';
const heavenFormat = () => Format.create()
    .addMarkdown(Format.createMarkdown().addTitle('天堂的门扉').addText(heavenText))
    .addButtonGroup(Format.createButtonGroup().addRow().addButton('还是转生异世界', '/选择去向 异世界', { type: 'command', autoEnter: true, style: 'blue' }));
const dangerText = '\n\n女神的神情认真起来：“异世界的魔物会猎杀弱者，迷宫与荒野埋葬过无数冒险者。即使拥有天赋，也不能保证你活过第一天。”\n“因此，在出发前，我允许你从神器或神技中带走一份恩赐。它会成为你在陌生世界的第一张底牌。”';
const dangerFormat = () => Format.create()
    .addMarkdown(Format.createMarkdown().addTitle('序章·异界的危险（5/6）').addText(dangerText))
    .addButtonGroup(Format.createButtonGroup().addRow().addButton('接受恩赐', '/注册 继续', { type: 'command', autoEnter: true, style: 'blue' }));
const giftTypeLabels = {
    holy_sword_shirulu: '长剑', demon_sword_aphia: '长剑', saint_staff_istaria: '法杖', death_dagger_azra: '匕首',
    godfist_chronos: '拳刃', oracle_grimoire_sophia: '法书', prayer_orb_lumia: '法球', immortal_shield_auges: '副手',
    star_crown_selene: '头肩', sky_robe_asteia: '上装', wind_girdle_hermes: '腰部', time_greaves_chronos: '下装',
    gale_boots_sif: '脚部', oath_necklace_norn: '项链', fate_bracelet_clotho: '手镯', eternal_ring_aurora: '戒指'
};
const circledNumber = (index) => '①②③④⑤⑥⑦⑧⑨⑩'.charAt(index) || `${index + 1}.`;
const giftEntries = (category, keyword = '') => Object.entries(gifts)
    .filter(([, gift]) => gift.category === category && (!keyword || gift.name.includes(keyword) || gift.summary.includes(keyword)));
const giftText = (category = 'artifact', page = 1, keyword = '') => {
    const entries = giftEntries(category, keyword);
    const totalPages = Math.max(1, Math.ceil(entries.length / 10));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const displayed = entries.slice((currentPage - 1) * 10, currentPage * 10);
    return displayed.map(([code, gift], index) => `${circledNumber(index)}【${gift.name}】${giftTypeLabels[code] ?? '神技'}\n${gift.summary}\n/选择恩赐 ${code}`).join('\n\n')
        + `\n\n当前第（${currentPage}/${totalPages}）页`;
};
const giftFormat = (category = 'artifact', page = 1, keyword = '') => {
    const categoryName = category === 'artifact' ? '神器' : '神技';
    const entries = giftEntries(category, keyword);
    const totalPages = Math.max(1, Math.ceil(entries.length / 10));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const displayed = entries.slice((currentPage - 1) * 10, currentPage * 10);
    const markdown = Format.createMarkdown()
        .addTitle('序章·选择恩赐（6/6）')
        .addText(`\n\n女神说：“你可以带走一件神器，或一种神技。\n来看看吧。”\n当前分类：${categoryName}。点击蓝色名称来选择。\n\n`);
    if (!displayed.length)
        markdown.addBlockquote(keyword ? '没有找到匹配的恩赐。' : '此分类暂未配置恩赐。').addNewline();
    for (const [index, [code, gift]] of displayed.entries()) {
        markdown.addText(`${circledNumber(index)}`).addButton(`【${gift.name}】`, { data: `/选择恩赐 ${code}`, autoEnter: false })
            .addText(`${giftTypeLabels[code] ?? '神技'}\n`).addBlockquote(gift.summary).addNewline().addNewline();
    }
    markdown.addText(`当前第（${currentPage}/${totalPages}）页`);
    const command = (target) => `/恩赐分页 ${categoryName} ${target}${keyword ? ` ${keyword}` : ''}`;
    return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow()
        .addButton('上一页', command(Math.max(1, currentPage - 1)), { type: 'command', autoEnter: true, style: currentPage > 1 ? 'blue' : undefined })
        .addButton('搜索', `/恩赐搜索 ${categoryName} `, { type: 'command', autoEnter: false, style: 'blue' })
        .addButton('下一页', command(Math.min(totalPages, currentPage + 1)), { type: 'command', autoEnter: true, style: currentPage < totalPages ? 'blue' : undefined })
        .addRow()
        .addButton('神器', '/恩赐列表 神器', { type: 'command', autoEnter: true, style: category === 'artifact' ? 'blue' : undefined })
        .addButton('神技', '/恩赐列表 神技', { type: 'command', autoEnter: true, style: category === 'ability' ? 'blue' : undefined }));
};

export { audienceFormat, audienceText, dangerFormat, dangerText, destinationFormat, destinationText, giftFormat, giftText, heavenFormat, heavenText, messageFormat, questionFormat, questionText, randomStoryText, sendWithTextFallback, storyFormat };
