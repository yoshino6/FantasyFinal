import { Format, useEvent, useMessage } from 'alemonjs';
import { acceptAlchemistQuest, alchemistQuest, claimAlchemistQuest } from '../game/alchemist.service';
import { currentMainQuest } from '../game/main-quest.service';
import { requireNpcAtCurrentPosition } from '../game/adventure.service';
import { messageFormat } from '../game/message';

const shopCode = 'alchemy_sweetshop';
const requireAlchemist = (qqUserId: string) => requireNpcAtCurrentPosition(qqUserId, shopCode);
const barrierActive = async (qqUserId: string) => ['【主线·寻访晴儿】', '【主线·追寻天空粉尘】', '【主线·归还天空粉尘】', '【主线·窥探世间】'].includes((await currentMainQuest(qqUserId)).title);

export const alchemistShopFormat = async (qqUserId: string) => {
  const questReady = await barrierActive(qqUserId);
  const buttons = Format.createButtonGroup()
    .addRow().addButton('我要买', '/炼金商店购买', { type: 'command', autoEnter: true, style: 'blue' }).addButton('我要卖', '/炼金商店出售', { type: 'command', autoEnter: true, style: 'blue' })
    .addRow().addButton('关于 炼金师', '/关于炼金师', { type: 'command', autoEnter: true, style: 'blue' });
  if (questReady) buttons.addRow().addButton('关于 无形的禁锢', '/晴儿 关于无形的禁锢', { type: 'command', autoEnter: true, style: 'blue' });
  buttons.addRow().addButton('离开 晴空糖水屋', `/建筑离开 ${shopCode}`, { type: 'command', autoEnter: true });
  return Format.create().addMarkdown(Format.createMarkdown().addTitle('百纳镇·晴空糖水屋').addNewline().addNewline().addBlockquote('晴空色的玻璃瓶在木架上折出柔光，空气里是果糖、薄荷与草药混在一起的清甜。柜台后的晴儿正专心搅拌一杯泛着微光的糖水，抬头时朝你露出温和的笑容。')).addButtonGroup(buttons);
};

export const alchemistShopHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { await requireAlchemist(event.current.UserId); await message.send({ format: await alchemistShopFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('无法进入晴空糖水屋', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const barrierAdviceFormat = (fromGuild = false) => Format.create().addMarkdown(Format.createMarkdown().addTitle('关于 无形的禁锢').addNewline().addNewline().addBlockquote(fromGuild
  ? '莫妮卡听完你的描述，神情认真起来。\n“这种身体与能量的异常，公会不宜贸然判断。你可以去找炼金师晴儿——她对人体的各种状态颇有研究，就在晴空糖水屋。”'
  : '晴儿轻轻放下量杯，认真听完你的描述。\n“你不是我们这个世界的人吧。异世界来者会被这方世界压制。想打破躯体的枷锁，不能只靠堆积能量，还得去感悟这方世界，并真正融入其中。”\n“周边密林里的幽影狼王偶尔会携带一种名为天空粉尘的古老尘埃，试着去带一份回来吧。然后我会指导你如何来窥探其中的奥秘。”')).addButtonGroup(Format.createButtonGroup().addRow().addButton('前往 晴空糖水屋', '/前往 -12 -127', { type: 'command', autoEnter: true, style: 'blue' }));

export const alchemistAboutHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireAlchemist(event.current.UserId); const quest = await alchemistQuest(event.current.UserId);
    if (quest.status === 'none') {
      await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('关于 炼金师').addNewline().addNewline().addBlockquote('“嗨，想了解一下炼金师吗？”“我可以将寻常材料提纯、精炼、合成，变成不寻常的宝物哟~”“是不是很神奇呢？来和我共同见证炼金造物无限真理吧！”')).addButtonGroup(Format.createButtonGroup().addRow().addButton('选定副职业 炼金师', '/选择副职业 炼金师', { type: 'command', autoEnter: true, style: 'blue' })) });
      return;
    }
    if (quest.status === 'completed') {
      await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('炼金师任务').addNewline().addNewline().addText(`微光草药：${quest.herbs}/3\n任务已完成，可以找晴儿开始提纯。`)).addButtonGroup(Format.createButtonGroup().addRow().addButton('提交任务', '/提交炼金师任务', { type: 'command', autoEnter: true, style: 'blue' })) });
      return;
    }
    if (quest.status === 'claimed') {
      await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('关于 炼金师').addNewline().addNewline().addBlockquote('“很不错嘛，比我预想的要快得多。”\n晴儿接过材料，向空中轻轻一抛，便一一悬浮于空中。“要开始了，集中注意力。学着我将精神力细致入微，化为丝线将它们一一提纯。”\n伴随着讲解，一丝丝精神念力在空中缭绕。那些材料在丝线的纷乱里悄然溶解，凝成了一颗颗颜色各异的小球。\n“下面是最重要的一步，异质融合。看仔细了哟！”各色球体在丝线的牵引下开始靠近，一开始还稍有排斥，渐渐地开始融合。凝聚而成的液体里蕴含着不一般的能量。\n晴儿倏地一挥手，泛着金红色泽的液珠已然被收入瓶中。\n“如何，领悟到了吧？”“接下来，就要由你自己去探索炼金术的奥妙了哟！”')).addButtonGroup(Format.createButtonGroup().addRow().addButton('查看 副职业', '/副职业', { type: 'command', autoEnter: true, style: 'blue' })) });
      return;
    }
    await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('炼金师任务').addNewline().addNewline().addText(`收集微光草药 ×3。\n微光草药：${quest.herbs}/3`)).addButtonGroup(Format.createButtonGroup().addRow().addButton('任务栏', '/任务', { type: 'command', autoEnter: true, style: 'blue' }).addButton('放弃任务', '/关于炼金师', { type: 'command', autoEnter: true })) });
  } catch (error) { await message.send({ format: messageFormat('无法交谈', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const alchemistBarrierHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireAlchemist(event.current.UserId);
    const { advanceRealmBarrier } = await import('../game/main-quest.service'); const progress = await advanceRealmBarrier(event.current.UserId, 'alchemist');
    if (progress.stage === 2 && progress.previous === 1) { await message.send({ format: barrierAdviceFormat() }); return; }
    if (progress.stage === 4 && progress.previous === 2) { await message.send({ format: skyDustAdviceFormat() }); return; }
    if (progress.stage === 2) { await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('关于 无形的禁锢').addNewline().addNewline().addBlockquote('晴儿抬眼看向你：“天空粉尘还没有着落。去幽暗密林寻找幽影狼王吧；只有亲手取得那份尘埃，你才能开始感悟。”')) }); return; }
    if (progress.stage === 4) { await message.send({ format: skyDustAdviceFormat() }); return; }
    throw new Error('你暂时还没有遇到这道境界的阻碍。');
  } catch (error) { await message.send({ format: messageFormat('无法询问', error instanceof Error ? error.message : '请稍后重试。') }); }
};

const skyDustAdviceFormat = () => Format.create().addMarkdown(Format.createMarkdown().addTitle('关于 无形的禁锢').addNewline().addNewline().addBlockquote('晴儿接过天空粉尘，任由细微的光芒从指缝间流过。\n“果然如此……它回应的是你对这方世界的感知，而不是药性。去吧，别把它当成材料；试着用心去窥探它所映照的天空。”')).addButtonGroup(Format.createButtonGroup().addRow().addButton('打开背包', '/背包 材料', { type: 'command', autoEnter: true, style: 'blue' }));

export const alchemistProfessionSelectHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireAlchemist(event.current.UserId);
    const quest = await alchemistQuest(event.current.UserId); if (quest.status !== 'none') throw new Error('你已经接取或完成了炼金师任务。');
    const markdown = Format.createMarkdown().addTitle('我想成为炼金师').addNewline().addNewline().addBlockquote('“我叫晴儿。炼金不是把草药丢进瓶子里那么简单——先替我收集三株微光草药，让我看看你是否愿意认真对待材料。”').addNewline().addNewline().addText('发现新支线，是否接受？\n（只可拥有一个副职业，请谨慎决定）');
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('接受任务', '/接受炼金师任务', { type: 'command', autoEnter: true, style: 'blue' }).addButton('放弃任务', '/关于炼金师', { type: 'command', autoEnter: true })) });
  } catch (error) { await message.send({ format: messageFormat('无法选择副职业', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const acceptAlchemistQuestHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { await requireAlchemist(event.current.UserId); await acceptAlchemistQuest(event.current.UserId); await message.send({ format: messageFormat('接受任务', '已接受【副职业·炼金师入门】\n收集：微光草药×3\n可随时通过“任务”查看进度。') }); } catch (error) { await message.send({ format: messageFormat('接受失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const claimAlchemistQuestHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireAlchemist(event.current.UserId); await claimAlchemistQuest(event.current.UserId);
    await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('副职业转职成功').addNewline().addNewline().addBlockquote('晴儿将三株微光草药依次投入蒸馏瓶。雾气在指尖凝成澄澈的液滴，最后汇作一支柔和发亮的微光药水。\n“它的疗效约是原本草药的五倍。记住，炼金的第一课从来不是追求力量，而是理解生命。”')).addNewline().addNewline().addText('获得【微光药水】×1').addButtonGroup(Format.createButtonGroup().addRow().addButton('查看 副职业', '/副职业', { type: 'command', autoEnter: true, style: 'blue' })) });
  } catch (error) { await message.send({ format: messageFormat('提交失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const alchemistProfessionFormat = () => Format.create().addMarkdown(Format.createMarkdown().addTitle('副职业·炼金师').addNewline().addNewline().addBlockquote('你已掌握炼金师的入门技艺。未来可在这里提纯、精炼与合成材料，并制作高效的战斗药剂。'));
export const alchemistTradeHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireAlchemist(event.current.UserId); await message.send({ format: messageFormat('晴空糖水屋', '晴儿正在清点药架与收购清单，药剂交易将随商品目录一同开放。') }); } catch (error) { await message.send({ format: messageFormat('无法交易', error instanceof Error ? error.message : '请稍后重试。') }); } };
