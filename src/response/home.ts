import { Format, useEvent, useMessage, useRoute } from 'alemonjs';
import { craftFurniture, enterHome, expandHome, homePanel, leaveHome, listFurniture, purchaseHome, removeFurniture, upgradeHome } from '../game/home.service';
import { messageFormat } from '../game/message';

const materialText = (materials: Array<{ name: string; quantity: number }>) => materials.length ? materials.map(item => `${item.name}×${item.quantity}`).join('｜') : '暂无家园材料';
const effectText = (effects: Record<string, number>) => {
  const labels: Record<string, string> = { restRecoveryPct: '家中恢复速度', storageCapacity: '额外储物容量', trainingBonusPct: '训练加成', homePerception: '家园感知', alchemyBonusPct: '炼金氛围' };
  const entries = Object.entries(effects).filter(([, value]) => value);
  return entries.length ? entries.map(([key, value]) => `${labels[key] ?? key}+${value}${key.includes('Pct') ? '%' : ''}`).join('｜') : '尚未获得家具效果';
};

export const homeFormat = async (qqUserId: string, notice = '') => {
  const panel = await homePanel(qqUserId); const markdown = Format.createMarkdown().addTitle('百纳镇·我的家园').addNewline().addNewline();
  if (!panel.home) {
    markdown.addBlockquote('百纳居为冒险者准备了可安置在城镇公共地块上的私人小屋。同一地块可以容纳多名住户，彼此的屋内互不干扰。').addNewline().addNewline()
      .addText('简陋木屋：**铜币×500**').addNewline().addText('购买后可在百纳居查看地块，并前往地块回家。');
    return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow()
      .addButton('购买小屋', '/家园购买', { type: 'command', autoEnter: true, style: 'blue' })
      .addButton('前往百纳居', '/前往 7 -99', { type: 'command', autoEnter: true, style: 'blue' }));
  }
  const home = panel.home;
  markdown.addText(`**${panel.character.name}的小屋**｜房屋 Lv.${home.house_level}｜${home.floor_count} 层`).addNewline()
    .addBlockquote(`公共地块：(${home.plot_x}, ${home.plot_y})｜每层槽位：${home.house_level >= 3 ? 10 : home.house_level >= 2 ? 8 : 6}`).addNewline().addNewline()
    .addText(panel.inHome ? '**当前：在家中**' : '**当前：在屋外**').addNewline()
    .addBlockquote(panel.inHome ? '普通冒险者无法发现你；若你处于百纳镇通缉状态，仍会公开行踪并可被合法缉捕。' : '到达小屋地块后，使用“回家”进入私人家园。').addNewline().addNewline();
  if (notice) markdown.addBlockquote(notice).addNewline().addNewline();
  markdown.addText(`家具效果：**${effectText(panel.effects)}**`).addNewline().addText(`建材与凝胶：${materialText(panel.materials)}`).addNewline().addNewline();
  if (panel.furniture.length) markdown.addText(`已摆放家具：${panel.furniture.map(item => `${item.name}（${item.floor_no}层）`).join('、')}`).addNewline().addNewline();
  const buttons = Format.createButtonGroup().addRow()
    .addButton(panel.inHome ? '出门' : '回家', panel.inHome ? '/家园出门' : '/家园回家', { type: 'command', autoEnter: true, style: 'blue' })
    .addButton('家具', '/家园家具', { type: 'command', autoEnter: true, style: 'blue' })
    .addButton('百纳居', '/百纳居', { type: 'command', autoEnter: true, style: 'blue' });
  if (home.house_level < 3) buttons.addRow().addButton('升级房屋', '/家园升级', { type: 'command', autoEnter: true, style: 'blue' });
  if (home.floor_count < 2) buttons.addButton('扩建二层', '/家园扩建 2', { type: 'command', autoEnter: true, style: home.house_level >= 2 ? 'blue' : undefined });
  else if (home.floor_count < 3) buttons.addButton('扩建三层', '/家园扩建 3', { type: 'command', autoEnter: true, style: home.house_level >= 3 ? 'blue' : undefined });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

const furnitureFormat = async (qqUserId: string, floor?: number) => {
  const result = await listFurniture(qqUserId, floor); const markdown = Format.createMarkdown().addTitle('我的家园·家具').addNewline().addNewline()
    .addBlockquote(`房屋 Lv.${result.home.house_level}｜${result.home.floor_count} 层｜每层 ${result.slots} 个槽位。制作命令需要填写楼层与自定义槽位，例如 /家园制作 slime_bed 1 bed_a。`).addNewline().addNewline();
  for (const definition of result.definitions) {
    const recipe = (result.recipes.get(definition.code) ?? []).map(item => `${item.name}×${item.quantity}`).join('、') || '无需材料';
    markdown.addText(`【${definition.name}】`).addButton('[制作]', { data: `/家园制作 ${definition.code} 1 `, autoEnter: false }).addNewline()
      .addBlockquote(`${definition.description}｜每层最多 ${definition.max_per_floor} 个｜需要：${recipe}`).addNewline().addNewline();
  }
  if (result.installed.length) {
    markdown.addText('**已摆放**').addNewline();
    result.installed.forEach(item => markdown.addText(`#${item.id} ${item.name}｜${item.floor_no}层·${item.slot_key} `).addButton('[拆除]', { data: `/家园拆除 ${item.id}`, autoEnter: true }).addNewline());
  }
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow()
    .addButton('查看一层', '/家园家具 1', { type: 'command', autoEnter: true, style: 'blue' })
    .addButton('返回家园', '/家园', { type: 'command', autoEnter: true }));
};

export const homeHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await message.send({ format: await homeFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('家园不可用', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const homePurchaseHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const result = await purchaseHome(event.current.UserId); await message.send({ format: await homeFormat(event.current.UserId, `已购买简陋木屋，公共地块位于 (${result.plot.x}, ${result.plot.y})。`) }); } catch (error) { await message.send({ format: messageFormat('购买失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const homeEnterHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const result = await enterHome(event.current.UserId); await message.send({ format: await homeFormat(event.current.UserId, result.pursuit?.text ?? '你推开小屋的门，街上的喧闹被轻轻隔在身后。') }); } catch (error) { await message.send({ format: messageFormat('无法回家', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const homeLeaveHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await leaveHome(event.current.UserId); await message.send({ format: await homeFormat(event.current.UserId, '你走出小屋，重新回到百纳镇的街道。') }); } catch (error) { await message.send({ format: messageFormat('无法出门', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const homeUpgradeHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const result = await upgradeHome(event.current.UserId); await message.send({ format: await homeFormat(event.current.UserId, `房屋已升级至 Lv.${result.level}。`) }); } catch (error) { await message.send({ format: messageFormat('升级失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const homeExpandHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await expandHome(event.current.UserId, Number(route.param('floor')) as 2 | 3); await message.send({ format: await homeFormat(event.current.UserId, `第 ${result.floor} 层扩建完成。`) }); } catch (error) { await message.send({ format: messageFormat('扩建失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const homeFurnitureHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const raw = String(route.param('floor') ?? '').trim(); await message.send({ format: await furnitureFormat(event.current.UserId, raw ? Number(raw) : undefined) }); } catch (error) { await message.send({ format: messageFormat('家具列表不可用', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const homeCraftHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await craftFurniture(event.current.UserId, String(route.param('code')), Number(route.param('floor')), String(route.param('slot'))); await message.send({ format: messageFormat('制作完成', `已在家园摆放【${result.name}】。`) }); await message.send({ format: await furnitureFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('制作失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const homeRemoveHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const result = await removeFurniture(event.current.UserId, Number(route.param('id'))); await message.send({ format: await homeFormat(event.current.UserId, `已拆除【${result.name}】；材料不会返还。`) }); } catch (error) { await message.send({ format: messageFormat('拆除失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
