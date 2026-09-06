import { Format, useEvent, useMessage, useRoute } from 'alemonjs';
import { addNpcAffinity, grantNpcAffinity, nearbyPoints, requireNpcAtCurrentPosition } from '../game/adventure.service';
import { acceptDeconstructorQuest, claimDeconstructorQuest, claimVivianCourseBlueprints, constructItem, constructionRecipesFor, deconstructItems, deconstructionItems, deconstructorProgress, deconstructorQuest, type ConstructionCategory } from '../game/deconstructor.service';
import { oddWorkshopSellCatalog, sellOddWorkshopItem } from '../game/oddworkshop-shop.service';
import { messageFormat } from '../game/message';
import { npcChatDialogue } from '../game/npc-dialogue.service';
import { dungeonSecretProgress } from '../game/dungeon-quest.service';
import { currentMainQuest } from '../game/main-quest.service';

const workshopCode = 'oddworkshop';
const requireWorkshop = (qqUserId: string) => requireNpcAtCurrentPosition(qqUserId, workshopCode);

export const oddWorkshopFormat = async (qqUserId: string, dialogue?: string) => {
  const [nearby, dungeonSecret, mainQuest] = await Promise.all([nearbyPoints(qqUserId), dungeonSecretProgress(qqUserId), currentMainQuest(qqUserId)]);
  const hour = new Date().getHours();
  const scene = dialogue ?? (hour < 11
    ? '清晨的异工坊已经响起叮叮当当的声音。唯薇安正踩着小凳子，把一盏会自己转向的魔石灯装到架上。'
    : hour < 18
      ? '阳光透过异工坊散乱的玻璃窗，照亮满桌齿轮、弹簧与来历不明的零件。唯薇安从零件堆后探出脑袋，笑得灿烂。'
      : '夜色落下，异工坊仍亮着温暖的灯。唯薇安捧着一只冒泡的金属盒，兴奋地邀请你看看她刚完成的“绝对安全”试作。');
  const markdown = Format.createMarkdown().addTitle('百纳镇·异工坊').addNewline().addNewline().addText('【唯薇安】');
  if (nearby.npcDetailsUnlocked) markdown.addText(' ').addButton('[详情]', { data: '/域民详情 oddworkshop', autoEnter: false });
  markdown.addNewline().addNewline().addBlockquote(scene);
  const buttons = Format.createButtonGroup()
    .addRow().addButton('我要买', '/异工坊购买', { type: 'command', autoEnter: true, style: 'blue' }).addButton('我要卖', '/异工坊出售', { type: 'command', autoEnter: true, style: 'blue' })
    .addRow().addButton('切磋', '/切磋 oddworkshop', { type: 'command', autoEnter: true, style: 'blue' }).addButton('闲聊', '/唯薇安闲聊', { type: 'command', autoEnter: true, style: 'blue' }).addButton('关于 解构师', '/关于解构师', { type: 'command', autoEnter: true, style: 'blue' })
    .addRow().addButton('离开', `/建筑离开 ${workshopCode}`, { type: 'command', autoEnter: true });
  if (dungeonSecret.stage === 2) buttons.addRow().addButton('关于 地下的秘密', '/异工坊 地下的秘密', { type: 'command', autoEnter: true, style: 'blue' });
  if (mainQuest.title === '【主线·失踪的少女】' && mainQuest.description.startsWith('公会的人手')) buttons.addRow().addButton('询问 天位制裁仪', '/唯薇安 天位制裁仪', { type: 'command', autoEnter: true, style: 'blue' });
  if (mainQuest.title === '【主线·失踪的少女】' && mainQuest.description.startsWith('唯薇安确认')) buttons.addRow().addButton('购买 天位制裁仪（200铜币）', '/购买天位制裁仪', { type: 'command', autoEnter: true, style: 'blue' });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

export const oddWorkshopHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { await requireWorkshop(event.current.UserId); await message.send({ format: await oddWorkshopFormat(event.current.UserId) }); }
  catch (error) { await message.send({ format: messageFormat('无法进入异工坊', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const oddWorkshopChatHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireWorkshop(event.current.UserId);
    const { affinity, rank } = await addNpcAffinity(event.current.UserId, workshopCode, 'chat');
    const course = await claimVivianCourseBlueprints(event.current.UserId);
    const detailsUnlocked = (await nearbyPoints(event.current.UserId)).npcDetailsUnlocked;
    const markdown = Format.createMarkdown().addTitle('百纳镇·异工坊').addNewline().addNewline().addText('【唯薇安】').addNewline().addNewline()
      .addBlockquote(npcChatDialogue(workshopCode, affinity));
    if (course.highestLevel) {
      const highest = course.awarded[course.awarded.length - 1]!;
      markdown.addNewline().addNewline().addBlockquote(`唯薇安把螺帽弹到掌心，笑得像自己也过了考核。“瞧，你已不只会照图拆东西，连回路为什么这样绕都能说清。${highest.level}级的课，我还想多卖会儿关子呢！”她把【${highest.name}图纸】塞给你，认真眨眼：“会拆、会想、也会拼好——这才是解构师。继续长大吧，我等着看你难倒老古董。”`);
      markdown.addNewline().addNewline().addText(`获得课程图纸：${course.awarded.map(item => `【${item.name}】`).join('、')}`);
    }
    if (course.affinityAwarded.length) markdown.addNewline().addNewline().addText(`唯薇安另交给你：${course.affinityAwarded.map(name => `【${name}图纸】`).join('、')}`);
    if (detailsUnlocked) markdown.addNewline().addNewline().addText(`好感：${affinity}｜${rank.title}`);
    const buttons = Format.createButtonGroup().addRow().addButton('继续闲聊', '/唯薇安闲聊', { type: 'command', autoEnter: true, style: 'blue' });
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
  } catch (error) { await message.send({ format: messageFormat('无法闲聊', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const oddWorkshopTradeHandler = (action: 'buy' | 'sell') => async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireWorkshop(event.current.UserId);
    if (action === 'sell') { await message.send({ format: await oddWorkshopSellFormat(event.current.UserId) }); return; }
    if (action === 'buy') { const { oddWorkshopBuyFormat } = await import('./dungeon-quest'); await message.send({ format: await oddWorkshopBuyFormat(event.current.UserId) }); return; }
  } catch (error) { await message.send({ format: messageFormat(action === 'buy' ? '无法购买' : '无法出售', error instanceof Error ? error.message : '请稍后重试。') }); }
};

const oddWorkshopSellButtons = (page: number, totalPages: number, keyword = '') => Format.createButtonGroup()
  .addRow().addButton('上一页', `/异工坊出售页 ${Math.max(1, page - 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: page > 1 ? 'blue' : undefined }).addButton('搜索', '/异工坊出售搜索 ', { type: 'command', autoEnter: false, style: 'blue' }).addButton('下一页', `/异工坊出售页 ${Math.min(totalPages, page + 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: page < totalPages ? 'blue' : undefined })
  .addRow().addButton('返回 异工坊', '/异工坊', { type: 'command', autoEnter: true });
const oddWorkshopSellFormat = async (qqUserId: string, page = 1, keyword = '') => {
  const shop = await oddWorkshopSellCatalog(qqUserId, page, keyword);
  const markdown = Format.createMarkdown().addTitle('异工坊·出售').addNewline().addNewline()
    .addBlockquote(keyword ? `唯薇安翻出与「${keyword}」有关的收购记录。` : '唯薇安戴上放大镜，兴奋地拍了拍工作台。“粒子、构件或异械都可以交给我！完整的魔力结构最有研究价值。”').addNewline().addNewline();
  if (!shop.items.length) markdown.addText('背包中没有唯薇安会收购的物品。');
  shop.items.forEach((item, index) => markdown.addText(`${'①②③④⑤'[index]}【${item.category}】${item.name}×${item.quantity} `).addButton('[出售]', { data: `/出售异工坊物品 ${item.id} `, autoEnter: false }).addNewline().addBlockquote(`收购价：铜币×${item.price}`).addNewline().addNewline());
  markdown.addText(`当前第(${shop.page}/${shop.totalPages})页｜持有铜币：${shop.copper}`);
  return Format.create().addMarkdown(markdown).addButtonGroup(oddWorkshopSellButtons(shop.page, shop.totalPages, shop.keyword));
};
export const oddWorkshopSellPageHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireWorkshop(event.current.UserId); await message.send({ format: await oddWorkshopSellFormat(event.current.UserId, Number(route.param('page') ?? 1), String(route.param('keyword') ?? '')) }); } catch (error) { await message.send({ format: messageFormat('出售列表不可用', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const oddWorkshopSellSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireWorkshop(event.current.UserId); await message.send({ format: await oddWorkshopSellFormat(event.current.UserId, 1, String(route.param('keyword'))) }); } catch (error) { await message.send({ format: messageFormat('搜索失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const oddWorkshopSellItemHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireWorkshop(event.current.UserId); const requested = String(route.param('quantity') ?? '').trim(); const result = await sellOddWorkshopItem(event.current.UserId, Number(route.param('id')), requested ? Number(requested) : 1); await addNpcAffinity(event.current.UserId, workshopCode, 'sell'); await message.send({ format: messageFormat('出售成功', `出售【${result.name}】×${result.quantity}\n获得铜币×${result.price}`) }); await message.send({ format: await oddWorkshopSellFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('出售失败', error instanceof Error ? error.message : '请稍后重试。') }); } };

export const deconstructorAboutHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireWorkshop(event.current.UserId);
    const quest = await deconstructorQuest(event.current.UserId);
    if (quest.status === 'none') {
      const markdown = Format.createMarkdown().addTitle('关于 解构师').addNewline().addNewline().addBlockquote('唯薇安把一枚齿轮拆成两半，又在你眨眼之间装了回去。“解构师可不是单纯的破坏者！我们会拆开材料、机关与魔力结构，找出它们真正的规律，再让它们变成更有趣的新东西。”');
      await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('选定副职业 解构师', '/选择副职业 解构师', { type: 'command', autoEnter: true, style: 'blue' })) });
      return;
    }
    if (quest.status === 'completed') {
      await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('解构师任务').addNewline().addNewline().addText(`兽核：${quest.cores}/1\n任务已完成，可以交给唯薇安开始第一课。`)).addButtonGroup(Format.createButtonGroup().addRow().addButton('提交任务', '/提交解构师任务', { type: 'command', autoEnter: true, style: 'blue' })) });
      return;
    }
    if (quest.status === 'claimed') {
      await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('关于 解构师').addNewline().addNewline().addBlockquote('唯薇安晃着手里的螺丝刀，眼睛亮晶晶的。“欢迎加入解构师的队伍！接下来就一起把这个世界的秘密……咳，结构，好好研究一遍吧！”')).addButtonGroup(Format.createButtonGroup().addRow().addButton('查看 副职业', '/副职业', { type: 'command', autoEnter: true, style: 'blue' })) });
      return;
    }
    await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('解构师任务').addNewline().addNewline().addText(`收集兽核 ×1。\n兽核：${quest.cores}/1`)).addButtonGroup(Format.createButtonGroup().addRow().addButton('任务栏', '/任务', { type: 'command', autoEnter: true, style: 'blue' }).addButton('放弃任务', '/异工坊', { type: 'command', autoEnter: true })) });
  } catch (error) { await message.send({ format: messageFormat('无法交谈', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const deconstructorProfessionSelectHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireWorkshop(event.current.UserId);
    const quest = await deconstructorQuest(event.current.UserId); if (quest.status !== 'none') throw new Error('你已经接取或完成了解构师任务。');
    const markdown = Format.createMarkdown().addTitle('我想成为解构师').addNewline().addNewline().addBlockquote('“想学解构？很好！先找一枚兽核给我吧。别挑已经裂开的喔——要是连最基础的魔力结构都看不清，后面的课程可会很无聊。”').addNewline().addNewline().addText('发现新支线，是否接受？\n（只可拥有一个副职业，请谨慎决定）');
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('接受任务', '/接受解构师任务', { type: 'command', autoEnter: true, style: 'blue' }).addButton('放弃任务', '/关于解构师', { type: 'command', autoEnter: true })) });
  } catch (error) { await message.send({ format: messageFormat('无法选择副职业', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const acceptDeconstructorQuestHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { await requireWorkshop(event.current.UserId); await acceptDeconstructorQuest(event.current.UserId); const markdown = Format.createMarkdown().addTitle('接受任务').addNewline().addNewline().addText('已接受【副职业·解构师入门】\n收集：兽核×1\n可随时通过 ').addButton('/任务', { data: '/任务', autoEnter: false }).addText(' 查看进度。'); await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('任务', '/任务', { type: 'command', autoEnter: true, style: 'blue' })) }); }
  catch (error) {
    if (error instanceof Error && error.message === 'secondary_profession_level_required') {
      await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('唯薇安的提议').addNewline().addNewline().addBlockquote('唯薇安把刚拿出的拆解工具又收了回去，歪着头看你。\n“现在就学的话，万一被兽核里的魔力反过来拆掉可不好玩。先去冒险再磨炼一阵吧，等你到了 Lv.10，我们就开课！”')) });
      return;
    }
    await message.send({ format: messageFormat('接取失败', error instanceof Error ? error.message : '请稍后重试。') });
  }
};

export const claimDeconstructorQuestHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireWorkshop(event.current.UserId);
    const result = await claimDeconstructorQuest(event.current.UserId);
    await grantNpcAffinity(event.current.UserId, workshopCode, 200);
    const markdown = Format.createMarkdown().addTitle('副职业转职成功').addNewline().addNewline()
      .addBlockquote('唯薇安接过兽核，先是满意地点点头，随后蹬上小凳子，把桌面上零零散散的齿轮、弹簧和半成品一股脑拨到两旁。她从抽屉深处取出一只刻满银色纹路的金属圆环，将兽核端端正正放在正中央。')
      .addNewline().addBlockquote('“不错！里面的魔力还很活跃，刚好够我们做第一课。”她握住一支细长的拆解笔，神情忽然严肃起来，“不过待会儿不管听见什么声音，都别乱碰喔。”')
      .addNewline().addBlockquote('笔尖落下的瞬间，兽核表面泛起幽蓝的光。那光芒沿着圆环的刻痕飞快游走，细小的裂纹一层层亮起，核内传出越来越急促的嗡鸣。唯薇安猛地抬头，朝你伸出手。')
      .addNewline().addBlockquote('“糟了——兽核要爆炸了！”')
      .addNewline().addBlockquote('你下意识后退半步，心跳几乎撞到喉咙。唯薇安却扑到桌前，十指飞快拨动圆环边缘的卡扣。魔力光团骤然膨胀，又在最亮的一刻向内塌缩，只留下几粒像萤火般的光点，安静悬在她指尖。')
      .addNewline().addBlockquote('她盯着你僵住的样子，足足停了两秒，忽然噗嗤一声笑了出来。“骗到你啦！真的爆炸前它会先发出很难听的尖叫，还会有一股烤蘑菇味。刚才只是最基础的共鸣测试。”')
      .addNewline().addBlockquote('唯薇安将一粒光点送到你掌心。它没有灼热感，反而像一缕细线顺着指尖钻入意识。你恍惚看见兽核内部交叠的纹路：有些负责束缚，有些负责流转，有些则像松散的结，等待被人拆开、理解，再重新编织。')
      .addNewline().addBlockquote('“解构不是把东西砸碎。”她把拆解笔塞进你手里，眼睛亮晶晶的，“是先看明白它为什么能存在，再决定它可以变成什么。记住这种感觉——从今天起，你也能听见材料在说话了。”')
      .addNewline().addNewline().addText('————————————').addNewline()
      .addText(`【${result.characterName}】已转职副职业[${result.name}]！\n【${result.characterName}】获得[${result.giftName}]！`);
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('查看 副职业', '/副职业', { type: 'command', autoEnter: true, style: 'blue' })) });
  } catch (error) { await message.send({ format: messageFormat('提交失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const deconstructorProfessionFormat = async (qqUserId: string) => {
  const progress = await deconstructorProgress(qqUserId);
  const maxed = progress.required === 0;
  const filled = maxed ? 10 : Math.round(Math.max(0, Math.min(1, progress.proficiency / progress.required)) * 10);
  const markdown = Format.createMarkdown().addTitle('副职业·解构师').addNewline().addButton('[图纸研习]',{data:'/解构图纸研习',autoEnter:false}).addText(' ').addButton('[入门与导师]',{data:'/副职业导师',autoEnter:false}).addNewline().addNewline()
    .addText(`等级：Lv.${maxed ? 'MAX' : progress.level}\n${maxed ? '熟练度：已达上限' : `熟练度：${progress.proficiency}/${progress.required}\n${'■'.repeat(filled)}${'□'.repeat(10 - filled)}`}`).addNewline().addNewline()
    .addBlockquote(`分解产出+${progress.bonus}%`).addNewline()
    .addBlockquote('构造成功率由构造物推荐等级与当前解构师等级差决定；失败会返还部分全部投入材料。');
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('分解','/分解',{type:'command',autoEnter:true}).addButton('构造','/构造',{type:'command',autoEnter:true})
    .addRow().addButton('前往 异工坊', '/前往 6 -189', { type: 'command', autoEnter: true, style: 'blue' }));
};

type DeconstructionCategory = '装备' | '道具' | '材料';
const numberMark = '①②③④⑤⑥⑦⑧⑨⑩';

const deconstructionFormat = async (qqUserId: string, category: DeconstructionCategory = '材料', page = 1, keyword = '') => {
  const items = await deconstructionItems(qqUserId, category);
  const filtered = items.filter(item => !keyword || item.name.includes(keyword) || item.category.includes(keyword));
  const totalPages = Math.max(1, Math.ceil(filtered.length / 10)); const currentPage = Math.min(Math.max(1, page), totalPages);
  const entries = filtered.slice((currentPage - 1) * 10, currentPage * 10);
  const markdown = Format.createMarkdown().addTitle('解构师·分解').addNewline().addNewline().addText('分类：').addText(' ')
    .addButton('[装备]', { data: '/分解页 装备 1', autoEnter: false }).addText(' ')
    .addButton('[道具]', { data: '/分解页 道具 1', autoEnter: false }).addText(' ')
    .addButton('[材料]', { data: '/分解页 材料 1', autoEnter: false }).addNewline().addNewline()
    .addBlockquote('专属怪材可直接分解：普通/大型/精英/Boss 分别析出 1/2/3/4 份基础粒子；怪物每跨 10 级，产值按 1.2 倍累乘。').addNewline().addNewline()
    .addText('玩家物品：').addNewline();
  if (!entries.length) markdown.addBlockquote('当前分类没有可分解的物品。').addNewline();
  for (const [index, item] of entries.entries()) markdown.addBlockquote(`${numberMark.charAt(index)}【${item.category}】${item.name}×${item.quantity} `).addButton('[分解]', { data: `/分解物品 ${item.id} `, autoEnter: false }).addText('+数量').addNewline();
  markdown.addNewline().addBlockquote('格式：点击[分解]+数量').addNewline().addNewline().addText(`当前第（${currentPage}/${totalPages}）页`);
  const previous = Math.max(1, currentPage - 1); const next = Math.min(totalPages, currentPage + 1);
  const pageCommand = (target: number) => `/分解页 ${category} ${target}${keyword ? ` ${keyword}` : ''}`;
  const buttons = Format.createButtonGroup()
    .addRow().addButton('上一页', pageCommand(previous), { type: 'command', autoEnter: true, style: currentPage > 1 ? 'blue' : undefined }).addButton('搜索', `/分解搜索 ${category} `, { type: 'command', autoEnter: false, style: 'blue' }).addButton('下一页', pageCommand(next), { type: 'command', autoEnter: true, style: currentPage < totalPages ? 'blue' : undefined });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

const constructionFormat = async (qqUserId: string, category: ConstructionCategory = '基材', page = 1, keyword = '') => {
  const recipes = await constructionRecipesFor(qqUserId);
  const filtered = recipes.filter(recipe => recipe.constructionCategory === category && recipe.unlocked && (!keyword || recipe.name.includes(keyword)));
  const totalPages = Math.max(1, Math.ceil(filtered.length / 10)); const currentPage = Math.min(Math.max(1, page), totalPages);
  const entries = filtered.slice((currentPage - 1) * 10, currentPage * 10);
  const markdown = Format.createMarkdown().addTitle('解构师·构造').addNewline().addNewline().addText('分类：').addText(' ')
    .addButton('[基材]', { data: '/构造页 基材 1', autoEnter: false }).addText(' ')
    .addButton('[构件]', { data: '/构造页 构件 1', autoEnter: false }).addText(' ')
    .addButton('[异械]', { data: '/构造页 异械 1', autoEnter: false }).addNewline().addNewline()
    .addText(`${category}：`).addNewline();
  if (!entries.length) markdown.addBlockquote('当前分类没有已掌握图纸的构造配方。').addNewline();
  for (const [index, recipe] of entries.entries()) {
    markdown.addText(`${numberMark.charAt(index)}【${recipe.name}】 `);
    if (recipe.unlocked && recipe.codexId) markdown.addButton('[详情]', { data: `/物品图鉴 ${recipe.codexId}`, autoEnter: false });
    markdown.addText(' ').addButton('[构造]', { data: `/构造制作 ${recipe.code}`, autoEnter: false }).addNewline();
    markdown.addBlockquote(`简介：${recipe.description}`).addNewline();
    markdown.addBlockquote('所需材料：').addNewline();
    for (const ingredient of recipe.ingredients) {
      if (ingredient.codexId) markdown.addButton(`【${ingredient.name}】`, { data: `/物品图鉴 ${ingredient.codexId}`, autoEnter: false }); else markdown.addText(`【${ingredient.name}】`);
      markdown.addText(` ${ingredient.owned}/${ingredient.quantity} `);
    }
    markdown.addNewline();
    if (recipe.blueprintName) markdown.addText(`图纸：【${recipe.blueprintName}】（已持有）`).addNewline();
    else markdown.addText('构造链：已随异械图纸解锁（基材与构件无需图纸）').addNewline();
    const equipmentText = recipe.outputType === 'equipment' ? `装备部位：${recipe.itemCategory}｜` : '';
    markdown.addBlockquote(`${equipmentText}推荐解构师等级：Lv.${recipe.recommendedSecondaryLevel}｜等级差：${recipe.gap}｜构造成功率：${recipe.successRate.toFixed(1)}%｜失败返还：${recipe.gap > 0 ? `${Math.round(recipe.refundRate * 100)}%（每份材料独立判定）` : '—（当前等级必定成功）'}`).addNewline().addNewline();
  }
  markdown.addText(`当前第（${currentPage}/${totalPages}）页`);
  const previous = Math.max(1, currentPage - 1); const next = Math.min(totalPages, currentPage + 1);
  const pageCommand = (target: number) => `/构造页 ${category} ${target}${keyword ? ` ${keyword}` : ''}`;
  const buttons = Format.createButtonGroup()
    .addRow().addButton('上一页', pageCommand(previous), { type: 'command', autoEnter: true, style: currentPage > 1 ? 'blue' : undefined }).addButton('搜索', `/构造搜索 ${category} `, { type: 'command', autoEnter: false, style: 'blue' }).addButton('下一页', pageCommand(next), { type: 'command', autoEnter: true, style: currentPage < totalPages ? 'blue' : undefined });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

export const deconstructorFeatureHandler = (feature: '分解' | '构造') => async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    const quest = await deconstructorQuest(event.current.UserId);
    if (quest.status !== 'claimed') throw new Error('成为解构师后才能使用这项能力。');
    if (feature === '分解') { await message.send({ format: await deconstructionFormat(event.current.UserId) }); return; }
    await message.send({ format: await constructionFormat(event.current.UserId) });
  } catch (error) { await message.send({ format: messageFormat(`无法${feature}`, error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const deconstructionPageHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await message.send({ format: await deconstructionFormat(event.current.UserId, String(route.param('category')) as DeconstructionCategory, Number(route.param('page')), String(route.param('keyword') ?? '')) }); }
  catch (error) { await message.send({ format: messageFormat('无法查看分解列表', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const deconstructionSearchHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await message.send({ format: await deconstructionFormat(event.current.UserId, String(route.param('category')) as DeconstructionCategory, 1, String(route.param('keyword'))) }); }
  catch (error) { await message.send({ format: messageFormat('无法搜索分解物品', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const constructionPageHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await message.send({ format: await constructionFormat(event.current.UserId, String(route.param('category')) as ConstructionCategory, Number(route.param('page')), String(route.param('keyword') ?? '')) }); }
  catch (error) { await message.send({ format: messageFormat('无法查看构造配方', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const constructionSearchHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await message.send({ format: await constructionFormat(event.current.UserId, String(route.param('category')) as ConstructionCategory, 1, String(route.param('keyword'))) }); }
  catch (error) { await message.send({ format: messageFormat('无法搜索构造配方', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const deconstructItemHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const result = await deconstructItems(event.current.UserId, Number(route.param('id')), Number(route.param('quantity') ?? 1));
    const gained = result.results.length ? result.results.map(item => `获得【${item.name}】×${item.quantity}`).join('\n') : '本次分解未留下可用粒子。';
    await message.send({ format: messageFormat(result.results.length ? '分解完成' : '分解失败', `消耗【${result.inputName}】×${result.inputQuantity}\n${gained}\n熟练度：+${result.proficiencyGain}`) });
    await message.send({ format: await deconstructionFormat(event.current.UserId) });
  } catch (error) { await message.send({ format: messageFormat('无法分解', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const constructItemHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const result = await constructItem(event.current.UserId, String(route.param('code')));
    const body = result.success
      ? `消耗构造材料后，成功制作【${result.outputName}】。\n熟练度：+${result.proficiencyGain}\n构造成功率：${result.successRate.toFixed(1)}%`
      : `构造过程失去稳定，已按 ${Math.round(result.refundRate * 100)}% 概率逐份返还全部投入材料。${result.refunded.length ? `\n返还：${result.refunded.map(item => `【${item.name}】×${item.quantity}`).join('、')}` : '\n本次未能回收材料。'}\n熟练度：+${result.proficiencyGain}\n构造成功率：${result.successRate.toFixed(1)}%`;
    await message.send({ format: messageFormat(result.success ? '构造完成' : '构造失败', body) });
    await message.send({ format: await constructionFormat(event.current.UserId, result.recipe.constructionCategory) });
  } catch (error) { await message.send({ format: messageFormat('无法构造', error instanceof Error ? error.message : '请稍后重试。') }); }
};
