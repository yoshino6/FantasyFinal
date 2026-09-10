import { Format, useEvent, useRoute } from 'alemonjs';
import { appendHiddenQuestButton } from './hidden-profession';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { addNpcAffinity, grantNpcAffinity, requireNpcAtCurrentPosition } from '../game/adventure.service';
import { bookshopCatalog, bookshopSellCatalog, buyBookshopItem, readSkillBook, sellBookshopItem } from '../game/bookshop.service';
import { messageFormat } from '../game/message';
import { npcChatDialogue } from '../game/npc-dialogue.service';
import { acceptOmniscientQuest, claimOmniscientQuest, omniscientProgress, omniscientQuest, omniscientTraces } from '../game/omniscient.service';

const code = 'bookshop';
const requireBookshop = (qqUserId: string) => requireNpcAtCurrentPosition(qqUserId, code);
const scene = () => {
  const hour = new Date().getHours();
  if (hour < 11) return '晨光从三层书屋的高窗斜斜洒下，书页与木架都泛着温暖的颜色。白须店主戴着老花镜，正把厚重的百科全书贴得很近，一字一句地读。';
  if (hour < 18) return '午后书屋里坐满翻阅资料的少年与冒险者。书架一直延伸到楼梯尽头，老人缓缓走过其间，不时为客人抽出一本更合适的书。';
  return '夜色落在百味书屋的玻璃窗上，三层楼仍亮着柔黄的灯。老人伏在柜台后翻着旧卷宗，偶尔抬头，耐心替晚来的冒险者指路。';
};
const bookshopFormat = async (user: string, text?: string, chatting = false) => {
  const markdown = Format.createMarkdown().addTitle('百纳镇·百味书屋').addNewline().addNewline().addText('【洛文·赫斯特】｜全知者 Lv.3').addNewline().addNewline().addBlockquote(text ?? scene());
  if (chatting) return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('切磋', '/切磋 bookshop', { type: 'command', autoEnter: true, style: 'blue' }).addButton('继续闲聊', '/书屋闲聊', { type: 'command', autoEnter: true, style: 'blue' }));
  const buttons = Format.createButtonGroup()
    .addRow().addButton('我要买', '/书屋购买', { type: 'command', autoEnter: true, style: 'blue' }).addButton('我要卖', '/书屋出售', { type: 'command', autoEnter: true, style: 'blue' })
    .addRow().addButton('切磋', '/切磋 bookshop', { type: 'command', autoEnter: true, style: 'blue' }).addButton('闲聊', '/书屋闲聊', { type: 'command', autoEnter: true, style: 'blue' }).addButton('关于 全知者', '/关于全知者', { type: 'command', autoEnter: true })
    .addRow().addButton('明鉴','/店铺全知者明鉴',{type:'command',autoEnter:true,style:'blue'}).addButton('识踪','/店铺全知者识踪',{type:'command',autoEnter:true,style:'blue'}).addButton('巧思','/店铺全知者巧思',{type:'command',autoEnter:true,style:'blue'})
    .addRow().addButton('离开 百味书屋', '/建筑离开 bookshop', { type: 'command', autoEnter: true });
  await appendHiddenQuestButton(buttons, user, code);
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
const pageButtons = (page: number, totalPages: number, command: string, search: string, keyword = '') => Format.createButtonGroup().addRow()
  .addButton('上一页', `/${command} ${Math.max(1, page - 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: page > 1 ? 'blue' : undefined })
  .addButton('搜索', `/${search} `, { type: 'command', autoEnter: false, style: 'blue' })
  .addButton('下一页', `/${command} ${Math.min(totalPages, page + 1)}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: page < totalPages ? 'blue' : undefined })
  .addRow().addButton('返回 百味书屋', '/百味书屋', { type: 'command', autoEnter: true });
const buyFormat = async (qqUserId: string, page = 1, keyword = '') => {
  const shop = await bookshopCatalog(qqUserId, page, keyword); const markdown = Format.createMarkdown().addTitle('百味书屋·购买').addNewline().addNewline().addBlockquote('洛文扶正老花镜，慈和地笑了笑：“知识不分年纪，也不该只躺在书架上。挑一本合眼缘的，慢慢读。”').addNewline().addNewline();
  if (!shop.items.length) markdown.addText('没有找到符合条件的书籍。');
  for (const [index, item] of shop.items.entries()) markdown.addText(`${'①②③④⑤'.charAt(index)}【${item.category}】`).addButton(item.name, { data: `/物品图鉴 ${item.codexId}`, autoEnter: false }).addText(' ').addButton('[购买]', { data: `/购买书屋物品 ${item.id} `, autoEnter: false }).addNewline().addBlockquote(`价格：铜币×${item.price}｜剩余：${item.stockQuantity}｜${item.ownedQuantity ? `已拥有${item.ownedQuantity}` : '未拥有'}`).addNewline().addBlockquote(`简介：${item.description}`).addNewline().addNewline();
  markdown.addText(`当前第（${shop.page}/${shop.totalPages}）页｜持有铜币：${shop.copper}`); return Format.create().addMarkdown(markdown).addButtonGroup(pageButtons(shop.page, shop.totalPages, '书屋购买页', '书屋购买搜索', shop.keyword));
};
const sellFormat = async (qqUserId: string, page = 1, keyword = '') => {
  const shop = await bookshopSellCatalog(qqUserId, page, keyword); const markdown = Format.createMarkdown().addTitle('百味书屋·出售').addNewline().addNewline().addBlockquote('洛文轻轻拂去柜台上的纸屑：“书籍、卷宗与手札我都收。它们或许会在下一位读者手里，继续找到新的答案。”').addNewline().addNewline();
  if (!shop.items.length) markdown.addText('背包中没有可出售的书籍、卷宗或技能书。');
  shop.items.forEach((item, index) => markdown.addText(`${'①②③④⑤'.charAt(index)}【${item.category}】${item.name}×${item.quantity} `).addButton('[出售]', { data: `/出售书屋物品 ${item.id} `, autoEnter: false }).addNewline().addBlockquote(`收购价：铜币×${item.price}`).addNewline().addNewline());
  markdown.addText(`当前第（${shop.page}/${shop.totalPages}）页｜持有铜币：${shop.copper}`); return Format.create().addMarkdown(markdown).addButtonGroup(pageButtons(shop.page, shop.totalPages, '书屋出售页', '书屋出售搜索', shop.keyword));
};
export const bookshopHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireBookshop(event.current.UserId); await message.send({ format: await bookshopFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('无法进入书屋', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const bookshopBuyHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBookshop(event.current.UserId); await message.send({ format: await buyFormat(event.current.UserId, Number(route.param('page') ?? 1), String(route.param('keyword') ?? '')) }); } catch (error) { await message.send({ format: messageFormat('购买列表不可用', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const bookshopBuySearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBookshop(event.current.UserId); await message.send({ format: await buyFormat(event.current.UserId, 1, String(route.param('keyword'))) }); } catch (error) { await message.send({ format: messageFormat('搜索失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const bookshopPurchaseHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBookshop(event.current.UserId); const amount = String(route.param('quantity') ?? '').trim(); const result = await buyBookshopItem(event.current.UserId, Number(route.param('id')), amount ? Number(amount) : 1); await addNpcAffinity(event.current.UserId, code, 'buy'); await message.send({ format: messageFormat('购买成功', `获得【${result.name}】×${result.quantity}\n消耗铜币×${result.price}`) }); await message.send({ format: await buyFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('购买失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const bookshopSellHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBookshop(event.current.UserId); await message.send({ format: await sellFormat(event.current.UserId, Number(route.param('page') ?? 1), String(route.param('keyword') ?? '')) }); } catch (error) { await message.send({ format: messageFormat('出售列表不可用', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const bookshopSellSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBookshop(event.current.UserId); await message.send({ format: await sellFormat(event.current.UserId, 1, String(route.param('keyword'))) }); } catch (error) { await message.send({ format: messageFormat('搜索失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const bookshopSellItemHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBookshop(event.current.UserId); const amount = String(route.param('quantity') ?? '').trim(); const result = await sellBookshopItem(event.current.UserId, Number(route.param('id')), amount ? Number(amount) : 1); await addNpcAffinity(event.current.UserId, code, 'sell'); await message.send({ format: messageFormat('出售成功', `出售【${result.name}】×${result.quantity}\n获得铜币×${result.price}`) }); await message.send({ format: await sellFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('出售失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const bookshopChatHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireBookshop(event.current.UserId); const affinity = await addNpcAffinity(event.current.UserId, code, 'chat'); await message.send({ format: await bookshopFormat(event.current.UserId, npcChatDialogue('bookshop', affinity.affinity), true) }); } catch (error) { await message.send({ format: messageFormat('无法闲聊', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const readBookHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await readSkillBook(event.current.UserId, Number(route.param('id'))); await message.send({ format: messageFormat('研读完成', `你读完了【${result.book}】。\n领悟技能【${result.skill}】，可前往“技能列表·未学习”消耗技能点学习。`) }); } catch (error) { await message.send({ format: messageFormat('研读失败', error instanceof Error ? error.message : '请稍后重试。') }); } };

export const omniscientAboutHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireBookshop(event.current.UserId); const quest = await omniscientQuest(event.current.UserId);
    if (quest.status === 'none') {
      const markdown = Format.createMarkdown().addTitle('关于 全知者').addNewline().addNewline().addBlockquote('洛文合上厚重的百科全书，指尖轻轻叩了叩封皮。“所谓全知，并非无所不知，而是能在风声、泥土与魔力的细节里，看见旁人遗漏的答案。老朽年轻时常在野外作战，这一门勘察与判断的本事，愿意教给肯认真观察的人。”');
      await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('选定副职业 全知者', '/选择副职业 全知者', { type: 'command', autoEnter: true, style: 'blue' })) });
      return;
    }
    if (quest.status === 'completed') {
      const markdown = Format.createMarkdown().addTitle('全知者任务').addNewline().addNewline().addText(`森林史莱姆：${quest.slimeObserved ? '已观察' : '未完成'}\n幽影狼王：${quest.wolfKingObserved ? '已观察' : '未完成'}\n你已完成观察，可回到洛文面前复盘所见。`);
      await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('提交任务', '/提交全知者任务', { type: 'command', autoEnter: true, style: 'blue' })) });
      return;
    }
    if (quest.status === 'claimed') {
      await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('关于 全知者').addNewline().addNewline().addBlockquote('洛文笑着将书签夹回书页：“把眼睛留给细节，把判断留给全局。你已经走在自己的学问里了。”')).addButtonGroup(Format.createButtonGroup().addRow().addButton('查看 副职业', '/副职业', { type: 'command', autoEnter: true, style: 'blue' })) });
      return;
    }
    const markdown = Format.createMarkdown().addTitle('全知者任务').addNewline().addNewline().addText(`挑战并成功观察两种强敌的魔力流动与构造。\n森林史莱姆：${quest.slimeObserved ? '已观察' : '未完成'}\n幽影狼王：${quest.wolfKingObserved ? '已观察' : '未完成'}`);
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('任务栏', '/任务', { type: 'command', autoEnter: true, style: 'blue' }).addButton('放弃任务', '/百味书屋', { type: 'command', autoEnter: true })) });
  } catch (error) { await message.send({ format: messageFormat('无法交谈', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const omniscientProfessionSelectHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireBookshop(event.current.UserId); const quest = await omniscientQuest(event.current.UserId); if (quest.status !== 'none') throw new Error('你已经接取或完成了全知者任务。');
    const markdown = Format.createMarkdown().addTitle('我想成为全知者').addNewline().addNewline().addBlockquote('“不要急着向我索取答案。”洛文将老花镜摘下，目光仍然清亮。“去挑战一次森林史莱姆，再挑战一次幽影狼王。别只记住胜负，仔细看它们的魔力如何流动、躯体如何构成；带着你的观察回来。”').addNewline().addNewline().addText('发现新支线，是否接受？\n（只可拥有一个副职业，请谨慎决定）');
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('接受任务', '/接受全知者任务', { type: 'command', autoEnter: true, style: 'blue' }).addButton('放弃任务', '/关于全知者', { type: 'command', autoEnter: true })) });
  } catch (error) { await message.send({ format: messageFormat('无法选择副职业', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const acceptOmniscientQuestHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { await requireBookshop(event.current.UserId); await acceptOmniscientQuest(event.current.UserId); const markdown = Format.createMarkdown().addTitle('接受任务').addNewline().addNewline().addText('已接受【副职业·全知者入门】\n挑战并观察：森林史莱姆、幽影狼王\n可随时通过 ').addButton('/任务', { data: '/任务', autoEnter: false }).addText(' 查看进度。'); await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('任务', '/任务', { type: 'command', autoEnter: true, style: 'blue' })) }); }
  catch (error) {
    if (error instanceof Error && error.message === 'secondary_profession_level_required') { await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('洛文的劝告').addNewline().addNewline().addBlockquote('洛文缓缓摇头，把一册野外笔记推回书架。\n“眼下的你还缺少几次真正的险境。先去磨炼吧，等你到了 Lv.10，能在危机中保持观察，再回来找我。”')) }); return; }
    await message.send({ format: messageFormat('接取失败', error instanceof Error ? error.message : '请稍后重试。') });
  }
};

export const claimOmniscientQuestHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireBookshop(event.current.UserId); const result = await claimOmniscientQuest(event.current.UserId); await grantNpcAffinity(event.current.UserId, code, 200);
    const markdown = Format.createMarkdown().addTitle('副职业转职成功').addNewline().addNewline().addBlockquote('洛文静静听完你的观察，偶尔追问一句细节。直到你说起狼王魔力在扑击前的短暂停滞，他才露出欣慰的笑容。').addNewline().addBlockquote('“很好。知识不是写在纸上的结论，而是你亲眼看见、亲手验证后，仍能保持清醒的判断。”他将一枚旧书签放到你掌心，“从今天起，学着看见全局。”').addNewline().addNewline().addText('————————————').addNewline().addText(`【${result.characterName}】已转职副职业[${result.name}]！\n【${result.characterName}】获得[${result.giftName}]！`);
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('查看 副职业', '/副职业', { type: 'command', autoEnter: true, style: 'blue' })) });
  } catch (error) { await message.send({ format: messageFormat('提交失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const omniscientProfessionFormat = async (qqUserId: string) => {
  const progress = await omniscientProgress(qqUserId); const maxed = progress.required === 0; const filled = maxed ? 10 : Math.floor(Math.max(0, Math.min(1, progress.proficiency / progress.required)) * 10);
  const markdown = Format.createMarkdown().addTitle('副职业·全知者').addNewline().addNewline().addText(`等级：Lv.${maxed ? 'MAX' : progress.level}\n${maxed ? '熟练度：已达上限' : `熟练度：${progress.proficiency}/${progress.required}\n${'■'.repeat(filled)}${'□'.repeat(10 - filled)}`}`).addNewline().addNewline()
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow()
    .addButton('明鉴', '/全知者明鉴', { type: 'command', autoEnter: true, style: 'blue' })
    .addButton('识踪', '/全知者识踪', { type: 'command', autoEnter: true, style: 'blue' })
    .addButton('巧思', '/全知者巧思', { type: 'command', autoEnter: true, style: 'blue' }));
};

export const omniscientInsightHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    const progress = await omniscientProgress(event.current.UserId);
    const markdown = Format.createMarkdown().addTitle('全知者·明鉴').addNewline().addNewline()
      .addText('> ').addBold('【鉴识】').addNewline().addBlockquote(`慧眼 Lv+${progress.rangeBonus}｜识珠 Lv+${progress.informationBonus}`).addNewline().addNewline()
      .addBlockquote(`队伍掉率+${progress.dropBonusPct}%（唯一光环）`);
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回副职业', '/副职业', { type: 'command', autoEnter: true, style: 'blue' })) });
  } catch (error) { await message.send({ format: messageFormat('明鉴失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const omniscientTraceHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await omniscientProgress(event.current.UserId); const trace = await omniscientTraces(event.current.UserId);
    const markdown = Format.createMarkdown().addTitle('全知者·识踪').addNewline().addNewline().addBlockquote(trace ?? '你在地图探索时，能发现更加细致入微的痕迹；当前区域尚未出现可追溯的首领踪迹。');
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回副职业', '/副职业', { type: 'command', autoEnter: true, style: 'blue' })) });
  } catch (error) { await message.send({ format: messageFormat('识踪失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const omniscientIngenuityHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    const progress = await omniscientProgress(event.current.UserId);
    const markdown = Format.createMarkdown().addTitle('全知者·巧思').addNewline().addNewline()
      .addBlockquote(`战斗后，自身技能领悟概率+${progress.dropBonusPct}%。`).addNewline()
      .addBlockquote('你可以将已领悟技能贯注入技能石。');
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回副职业', '/副职业', { type: 'command', autoEnter: true, style: 'blue' })) });
  } catch (error) { await message.send({ format: messageFormat('巧思失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};
