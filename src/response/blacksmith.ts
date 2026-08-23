import { Format, useEvent, useMessage, useRoute } from 'alemonjs';
import { addNpcAffinity, grantNpcAffinity, nearbyPoints, requireNpcAtCurrentPosition } from '../game/adventure.service';
import { acceptBlacksmithQuest, addForgeMaterial, blacksmithFusionEquipment, blacksmithProgress, blacksmithQuest, blacksmithWeapons, claimBlacksmithQuest, clearForgeMaterial, craftForgeEquipment, forgeState, fuseWeapon, fusionMaterials, refineWeapon, refinementMaterials, removeForgeMaterial, resetForgeSession, selectForgeCategory, selectForgeLevel, selectForgeSubtype, setForgeMaterial } from '../game/blacksmith.service';
import { messageFormat } from '../game/message';

const requireBlacksmith = async (qqUserId: string) => {
  const { secondaryProfessionCode } = await import('../game/alchemist.service');
  if ((await secondaryProfessionCode(qqUserId)) === 'blacksmith') return;
  await requireNpcAtCurrentPosition(qqUserId, 'blacksmith');
};
const proficiencyBar = (current: number, required: number) => {
  const ratio = required > 0 ? Math.max(0, Math.min(1, current / required)) : 1;
  const filled = Math.round(ratio * 10);
  return `${'■'.repeat(filled)}${'□'.repeat(10 - filled)}`;
};
export const blacksmithButtons = () => Format.createButtonGroup()
  .addRow().addButton('打造', '/打造装备', { type: 'command', autoEnter: true, style: 'blue' }).addButton('精炼', '/精炼', { type: 'command', autoEnter: true, style: 'blue' }).addButton('熔铸', '/熔铸', { type: 'command', autoEnter: true, style: 'blue' })
  .addRow().addButton('我要买', '/铁匠铺购买', { type: 'command', autoEnter: true, style: 'blue' }).addButton('我要卖', '/铁匠铺出售', { type: 'command', autoEnter: true, style: 'blue' })
  .addRow().addButton('闲聊', '/铁匠铺闲聊', { type: 'command', autoEnter: true, style: 'blue' }).addButton('关于 锻造师', '/关于锻造师', { type: 'command', autoEnter: true, style: 'blue' })
  .addRow().addButton('离开 铁匠铺', '/建筑离开 blacksmith', { type: 'command', autoEnter: true });
const professionButtons = () => Format.createButtonGroup().addRow().addButton('打造', '/副职业打造装备', { type: 'command', autoEnter: true, style: 'blue' }).addButton('精炼', '/精炼', { type: 'command', autoEnter: true, style: 'blue' }).addButton('熔铸', '/熔铸', { type: 'command', autoEnter: true, style: 'blue' });
const effectText = (effect: Record<string, unknown>) => {
  const labels: Record<string, string> = { hpMax: '生命', mpMax: '魔力', physicalAttack: '物攻', magicAttack: '魔攻', physicalDefense: '物防', magicDefense: '魔防', accuracy: '命中', evasion: '闪避', speed: '速度', critRateBp: '暴击', hpPct: '生命上限', mpPct: '魔力上限', physicalAttackPct: '物攻', magicAttackPct: '魔攻', physicalDefensePct: '物防', magicDefensePct: '魔防', accuracyPct: '命中', evasionPct: '闪避', speedPct: '速度', critRatePct: '暴击', magicDamagePct: '魔法伤害', damageBonusPct: '伤害增加' };
  const label = (key: string) => labels[key] ?? (key.startsWith('elementMastery_') ? `${key.slice('elementMastery_'.length)}元素精通` : key.startsWith('elementResistance_') ? `${key.slice('elementResistance_'.length)}元素抗性` : '');
  return Object.entries(effect).filter(([key, value]) => label(key) && Number(value)).map(([key, value]) => { const amount = key.endsWith('Pct') ? `${Number(value).toFixed(1)}%` : String(Math.round(Number(value))); return `${label(key)}${Number(value) >= 0 ? '+' : ''}${amount}`; }).join('｜') || '随机基础强化';
};
const materialNames: Record<string, string> = { living_wood: '活木', meteor_iron: '陨铁', star_copper: '星铜', moon_silver: '月银', sun_gold: '曜金' };
const materialTendencies: Record<string, string> = { beast_meat: '倾向于生命', beast_bone: '倾向于物攻', beast_hide: '倾向于物防、魔防', beast_tendon: '倾向于速度', beast_core: '倾向于魔攻', magic_wool: '倾向于闪避', magic_tusk: '倾向于物攻', magic_scale: '倾向于魔防', magic_claw: '倾向于暴击', magic_heartcore: '倾向于命中', living_wood: '倾向于生命', meteor_iron: '倾向于物防', star_copper: '倾向于命中', moon_silver: '倾向于魔力', sun_gold: '倾向于双攻', riot_aura: '倾向于伤害增加' };
export const blacksmithFormat = async (qqUserId: string, text?: string) => {
  const hour = new Date().getHours();
  const scene = text ?? (hour < 11
    ? '清晨的炉火刚刚旺起来。漠北踩着垫脚木块整理铁砧，狐耳在热浪中微微晃动。\n他抬头看了你一眼：“早啊。我叫漠北，镇里都叫我小北。今天想打造、精炼，还是看看制式装备？”'
    : hour < 18
      ? '炉火映亮了铁砧。握锤的是个约莫十二三岁的少年，狐耳在热浪中微微晃动，矮人的结实骨架却让他挥锤时格外稳当。\n他抬头看了你一眼：“我叫漠北，镇里都叫我小北。要打造、精炼，还是看看制式装备？”'
      : '夜里的铁匠铺仍回荡着清脆锤声。漠北将刚淬好的铁器搁到一旁，火光映得他眼神明亮。\n“晚上好。炉火还热着，有需要就说吧。”');
  const detailsUnlocked = (await nearbyPoints(qqUserId)).npcDetailsUnlocked;
  const markdown = Format.createMarkdown().addTitle('百纳镇·铁匠铺').addNewline().addNewline().addText('【漠北】');
  if (detailsUnlocked) markdown.addText(' ').addButton('[详情]', { data: '/NPC详情 blacksmith', autoEnter: false });
  markdown.addNewline().addNewline().addBlockquote(scene);
  return Format.create().addMarkdown(markdown).addButtonGroup(blacksmithButtons());
};
export default async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireBlacksmith(event.current.UserId);
    await message.send({ format: await blacksmithFormat(event.current.UserId) });
  } catch (error) {
    await message.send({ format: messageFormat('无法进入铁匠铺', error instanceof Error ? error.message : '请稍后重试。') });
  }
};
const awardBlacksmithCraftAffinity = async (qqUserId: string) => {
  try { return await addNpcAffinity(qqUserId, 'blacksmith', 'craft'); }
  catch (error) { if (error instanceof Error && error.message.includes('已经离开')) return undefined; throw error; }
};
const weaponList = async (qqUserId: string, mode: 'refine' | 'fuse') => {
  const weapons = mode === 'refine' ? await blacksmithWeapons(qqUserId) : await blacksmithFusionEquipment(qqUserId); const title = mode === 'refine' ? '精炼' : '熔铸'; const markdown = Format.createMarkdown().addTitle(title).addNewline().addNewline().addBlockquote(mode === 'refine' ? '选择一把武器放上铁砧。品质越高，精炼越困难；每次精炼有 3% 概率大成功。' : '选择一件装备放上熔炉。每 10 级获得 1 次熔铸机会，优秀及以上品质会额外增加机会；元素粉尘会随装备部位转为精通或抗性。').addNewline().addNewline();
  if (!weapons.length) markdown.addText(`背包中没有可${mode === 'refine' ? '精炼的武器' : '熔铸的装备'}。`);
  for (const weapon of weapons) markdown.addText(`【${weapon.category}】${weapon.name} #${weapon.id}\n`).addBlockquote(`品质：${weapon.quality.toFixed(1)}%｜稀有度：${weapon.rarity}｜熔铸：${weapon.fusionCount}/${weapon.fusionLimit}`).addNewline().addButton('[放入]', { data: mode === 'refine' ? `/精炼放入 ${weapon.id}` : `/熔铸放入 ${weapon.id}`, autoEnter: false }).addNewline().addNewline();
  return Format.create().addMarkdown(markdown).addButtonGroup(blacksmithButtons());
};
const materialList = async (qqUserId: string, mode: 'refine' | 'fuse', instanceId: number, page = 1, keyword = '') => {
  const weapons = mode === 'refine' ? await blacksmithWeapons(qqUserId) : await blacksmithFusionEquipment(qqUserId); const weapon = weapons.find(item => item.id === instanceId); if (!weapon) throw new Error(`未找到该${mode === 'refine' ? '武器' : '装备'}。`);
  const allMaterials: any[] = mode === 'refine' ? await refinementMaterials(qqUserId) : await fusionMaterials(qqUserId, weapon.category);
  const materials = allMaterials.filter(material => !keyword || material.name.includes(keyword) || material.category.includes(keyword));
  const totalPages = Math.max(1, Math.ceil(materials.length / 10)); const currentPage = Math.min(Math.max(1, page), totalPages);
  const entries = materials.slice((currentPage - 1) * 10, currentPage * 10);
  const progress = mode === 'fuse' ? await blacksmithProgress(qqUserId) : null;
  const markdown = Format.createMarkdown().addTitle(mode === 'refine' ? '精炼·选择材料' : '熔铸·选择材料').addNewline().addNewline().addText(`已放入：【${weapon.category}】${weapon.name}\n`).addBlockquote(`品质：${weapon.quality.toFixed(1)}%｜熔铸：${weapon.fusionCount}/${weapon.fusionLimit}${progress ? `｜成功率：${Math.min(100, 70 + progress.bonus)}%` : ''}`).addNewline().addNewline();
  if (!entries.length) markdown.addBlockquote(mode === 'refine' ? '没有符合条件的精炼材料。' : '没有符合条件的熔铸材料。').addNewline();
  for (const material of entries) {
    const detail = mode === 'refine' ? `本次提升 ${material.minGain}%～${material.maxGain}%` : effectText(material.effect);
    markdown.addBlockquote(`【${material.category}】${material.name}×${material.quantity}｜${detail}`).addText(' ').addButton('[使用]', { data: mode === 'refine' ? `/精炼执行 ${instanceId} ${material.id}` : `/熔铸执行 ${instanceId} ${material.id}`, autoEnter: false }).addNewline();
  }
  const previous = Math.max(1, currentPage - 1); const next = Math.min(totalPages, currentPage + 1);
  const prefix = mode === 'refine' ? '精炼材料' : '熔铸材料';
  const pageCommand = (target: number) => `/${prefix}页 ${instanceId} ${target}${keyword ? ` ${keyword}` : ''}`;
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup()
    .addRow().addButton('上一页', pageCommand(previous), { type: 'command', autoEnter: true, style: currentPage > 1 ? 'blue' : undefined }).addButton('搜索', `/${prefix}搜索 ${instanceId} `, { type: 'command', autoEnter: false, style: 'blue' }).addButton('下一页', pageCommand(next), { type: 'command', autoEnter: true, style: currentPage < totalPages ? 'blue' : undefined })
    .addRow().addButton(mode === 'refine' ? '返回武器列表' : '返回装备列表', mode === 'refine' ? '/精炼' : '/熔铸', { type: 'command', autoEnter: true }));
};
export const refineListHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: await weaponList(event.current.UserId, 'refine') }); } catch (error) { await message.send({ format: messageFormat('无法精炼', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const refinePutHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: await materialList(event.current.UserId, 'refine', Number(route.param('id'))) }); } catch (error) { await message.send({ format: messageFormat('无法放入武器', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const refineMaterialPageHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: await materialList(event.current.UserId, 'refine', Number(route.param('id')), Number(route.param('page')), String(route.param('keyword') ?? '')) }); } catch (error) { await message.send({ format: messageFormat('无法查看材料', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const refineMaterialSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: await materialList(event.current.UserId, 'refine', Number(route.param('id')), 1, String(route.param('keyword'))) }); } catch (error) { await message.send({ format: messageFormat('无法搜索材料', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const refineExecuteHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); const result = await refineWeapon(event.current.UserId, Number(route.param('instanceId')), Number(route.param('materialId'))); await awardBlacksmithCraftAffinity(event.current.UserId); const text = result.failed ? `【${result.name}】的精炼未能突破瓶颈。\n消耗【${result.material}】×1\n品质维持 ${result.oldQuality.toFixed(1)}%` : `【${result.name}】精炼${result.great ? '大成功！' : '成功！'}\n消耗【${result.material}】×1\n品质：${result.oldQuality.toFixed(1)}% → ${result.newQuality.toFixed(1)}%（+${result.gain.toFixed(1)}%）`; await message.send({ format: messageFormat('精炼结果', text) }); await message.send({ format: await materialList(event.current.UserId, 'refine', Number(route.param('instanceId'))) }); } catch (error) { await message.send({ format: messageFormat('精炼失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const fuseListHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: await weaponList(event.current.UserId, 'fuse') }); } catch (error) { await message.send({ format: messageFormat('无法熔铸', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const fusePutHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: await materialList(event.current.UserId, 'fuse', Number(route.param('id'))) }); } catch (error) { await message.send({ format: messageFormat('无法放入武器', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const fuseMaterialPageHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: await materialList(event.current.UserId, 'fuse', Number(route.param('id')), Number(route.param('page')), String(route.param('keyword') ?? '')) }); } catch (error) { await message.send({ format: messageFormat('无法查看材料', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const fuseMaterialSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: await materialList(event.current.UserId, 'fuse', Number(route.param('id')), 1, String(route.param('keyword'))) }); } catch (error) { await message.send({ format: messageFormat('无法搜索材料', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const fuseExecuteHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); const result = await fuseWeapon(event.current.UserId, Number(route.param('instanceId')), Number(route.param('materialId'))); await awardBlacksmithCraftAffinity(event.current.UserId); await message.send({ format: messageFormat(result.failed ? '熔铸失败' : '熔铸完成', result.failed ? `【${result.name}】未能承受熔铸的力量。\n消耗【${result.material}】×1\n本次成功率：${result.success}%` : `【${result.name}】融入了【${result.material}】\n获得：${effectText(result.effect)}\n熔铸次数：${result.count}/${result.limit}`) }); await message.send({ format: await materialList(event.current.UserId, 'fuse', Number(route.param('instanceId'))) }); } catch (error) { await message.send({ format: messageFormat('熔铸失败', error instanceof Error ? error.message : '请稍后重试。') }); } };

const forgeCommand = (source: 'blacksmith' | 'profession') => source === 'profession' ? '/副职业打造装备' : '/打造装备';
const forgeReturn = (source: 'blacksmith' | 'profession') => source === 'profession' ? '/副职业' : '/铁匠铺';
const forgeFormat = async (source: 'blacksmith' | 'profession') => Format.create().addMarkdown(Format.createMarkdown().addTitle('打造装备').addNewline().addNewline().addBlockquote('选择想打造的装备部位。首饰暂不开放打造。').addNewline().addNewline()).addButtonGroup(Format.createButtonGroup().addRow().addButton('武器', '/打造部位 武器', { type: 'command', autoEnter: true, style: 'blue' }).addButton('头肩', '/打造部位 头肩', { type: 'command', autoEnter: true, style: 'blue' }).addButton('上装', '/打造部位 上装', { type: 'command', autoEnter: true, style: 'blue' }).addRow().addButton('腰部', '/打造部位 腰部', { type: 'command', autoEnter: true, style: 'blue' }).addButton('下装', '/打造部位 下装', { type: 'command', autoEnter: true, style: 'blue' }).addButton('脚部', '/打造部位 脚部', { type: 'command', autoEnter: true, style: 'blue' }).addRow().addButton('返回', forgeReturn(source), { type: 'command', autoEnter: true }));
const forgeSubtypeFormat = async (qqUserId: string) => { const state = await forgeState(qqUserId); if (!state.category) throw new Error('请先选择打造部位。'); const types = state.category === '武器' ? ['长剑', '法杖', '法书', '法球', '匕首', '拳刃', '盾牌'] : ['布甲', '皮甲', '轻甲', '重甲', '板甲']; const buttons = Format.createButtonGroup(); for (let index = 0; index < types.length; index += 3) { const row = buttons.addRow(); for (const type of types.slice(index, index + 3)) row.addButton(type, `/打造类型 ${type}`, { type: 'command', autoEnter: true, style: 'blue' }); } buttons.addRow().addButton('返回打造', forgeCommand(state.source), { type: 'command', autoEnter: true }); return Format.create().addMarkdown(Format.createMarkdown().addTitle(`打造·${state.category}`).addNewline().addNewline().addBlockquote(state.category === '武器' ? '请选择武器类型。不同武器会拥有不同的基础属性倾向。盾牌也属于武器，可装备在主手或副手。' : '布甲：防御极低；给予大量命中、闪避、速度。\n皮甲：防御略低；给予中量命中、速度。\n轻甲：双防中等；中规中矩，无额外惩罚。\n重甲：双防很高；剥夺中量闪避、速度。\n板甲：双防极高；剥夺大量命中、闪避、速度。')).addButtonGroup(buttons); };
const forgeLevelFormat = async (qqUserId: string) => { const state = await forgeState(qqUserId); if (!state.subtype) throw new Error('请先选择装备类型。'); const buttons = Format.createButtonGroup(); for (let base = 5; base <= 50; base += 25) { const row = buttons.addRow(); for (let level = base; level < base + 25 && level <= 50; level += 5) row.addButton(`Lv.${level}`, `/打造等级 ${level}`, { type: 'command', autoEnter: true, style: 'blue' }); } buttons.addRow().addButton('返回类型', forgeCommand(state.source), { type: 'command', autoEnter: true }); return Format.create().addMarkdown(Format.createMarkdown().addTitle(`打造·${state.category}·${state.subtype}`).addNewline().addNewline().addBlockquote('请选择欲打造装备的适应等级。等级越高，基础属性越高。')).addButtonGroup(buttons); };
const forgeMaterialsFormat = async (qqUserId: string, page = 1, keyword = '') => {
  const state = await forgeState(qqUserId);
  if (!state.category || !state.subtype || !state.level) throw new Error('请完成部位、类型和等级选择。');
  const requiredCodes = new Set(state.requirements.map(item => item.code));
  const requirementsMet = state.requirements.every(requirement => (state.materials.find(item => item.code === requirement.code)?.quantity ?? 0) >= requirement.quantity);
  const auxiliary = state.materials.filter(item => item.selected > 0 && !requiredCodes.has(item.code));
  const filtered = state.materials.filter(item => !requiredCodes.has(item.code) && (!keyword || item.name.includes(keyword) || item.category.includes(keyword)));
  const totalPages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const materials = filtered.slice((currentPage - 1) * 10, currentPage * 10);
  const markdown = Format.createMarkdown().addTitle('打造·放入材料').addNewline().addNewline()
    .addText(`目标：${state.category}·${state.subtype}·Lv.${state.level}`).addNewline()
    .addText('费用：铜币×60').addNewline()
    .addText('必备材料：').addNewline();
  for (const requirement of state.requirements) {
    const material = state.materials.find(item => item.code === requirement.code);
    const owned = material?.quantity ?? 0;
    markdown.addBlockquote(`${material?.name ?? materialNames[requirement.code] ?? requirement.code}（${owned}/${requirement.quantity}）${owned >= requirement.quantity ? ' 已满足' : ' 不足'}`).addNewline();
  }
  markdown.addNewline().addText('当前放入辅材：').addNewline();
  markdown.addBlockquote('辅材只决定副属性的可达上限；\n最终数值按正态分布抽取，并受已有属性衰减影响。\n装备有额外属性上限，请酌情调整用量。').addNewline();
  if (!auxiliary.length) markdown.addBlockquote('无').addNewline();
  for (const material of auxiliary) {
    markdown.addBlockquote(`【${material.category}】${material.name}×${material.selected}(可放入${material.quantity - material.selected})`).addText(' ').addButton('[修改]', { data: `/修改打造材料 ${material.id}`, autoEnter: false }).addText(' ').addButton('[删除]', { data: `/删除打造材料 ${material.id}`, autoEnter: false }).addNewline();
  }
  markdown.addNewline().addText('背包材料：').addNewline();
  if (!materials.length) markdown.addBlockquote('没有符合条件的材料。').addNewline();
  for (const [index, material] of materials.entries()) {
    const tendency = material.code.endsWith('_element_dust') ? `倾向于${state.category === '武器' ? '对应元素精通' : '对应元素抗性'}` : materialTendencies[material.code] ?? '倾向于随机基础属性';
    markdown.addBlockquote(`${'①②③④⑤⑥⑦⑧⑨⑩'.charAt(index)}【${material.category}】${material.name}×${material.quantity}（已放入${material.selected}）｜${tendency}`).addText(' ').addButton('[放入]', { data: `/放入打造材料 ${material.id}`, autoEnter: false }).addText(' ').addButton('[取出]', { data: `/取出打造材料 ${material.id}`, autoEnter: false }).addNewline();
  }
  markdown.addText(`当前第（${currentPage}/${totalPages}）页`).addNewline();
  const previous = Math.max(1, currentPage - 1); const next = Math.min(totalPages, currentPage + 1); const pageCommand = (target: number) => `/打造材料页 ${target}${keyword ? ` ${keyword}` : ''}`;
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('上一页', pageCommand(previous), { type: 'command', autoEnter: true, style: currentPage > 1 ? 'blue' : undefined }).addButton('搜索', '/打造材料搜索', { type: 'command', autoEnter: false }).addButton('下一页', pageCommand(next), { type: 'command', autoEnter: true, style: currentPage < totalPages ? 'blue' : undefined }).addRow().addButton('开始打造', '/开始打造', { type: 'command', autoEnter: true, style: requirementsMet ? 'blue' : undefined }).addButton('重新选择', forgeCommand(state.source), { type: 'command', autoEnter: true }));
};
const openForge = (source: 'blacksmith' | 'profession') => async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await resetForgeSession(event.current.UserId, source); await message.send({ format: await forgeFormat(source) }); } catch (error) { await message.send({ format: messageFormat('无法打造', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const forgeHandler = openForge('blacksmith');
export const secondaryProfessionForgeHandler = openForge('profession');
export const forgeCategoryHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await selectForgeCategory(event.current.UserId, String(route.param('category'))); await message.send({ format: await forgeSubtypeFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('选择失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const forgeSubtypeHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await selectForgeSubtype(event.current.UserId, String(route.param('subtype'))); await message.send({ format: await forgeLevelFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('选择失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const forgeLevelHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await selectForgeLevel(event.current.UserId, Number(route.param('level'))); await message.send({ format: await forgeMaterialsFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('选择失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const forgeMaterialHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await addForgeMaterial(event.current.UserId, Number(route.param('id')), Number(route.param('quantity') ?? 1)); await message.send({ format: await forgeMaterialsFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('无法放入材料', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const forgeMaterialRemoveHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await removeForgeMaterial(event.current.UserId, Number(route.param('id'))); await message.send({ format: await forgeMaterialsFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('无法取出材料', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const forgeMaterialSetHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await setForgeMaterial(event.current.UserId, Number(route.param('id')), Number(route.param('quantity'))); await message.send({ format: await forgeMaterialsFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('无法修改材料', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const forgeMaterialClearHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await clearForgeMaterial(event.current.UserId, Number(route.param('id'))); await message.send({ format: await forgeMaterialsFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('无法删除材料', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const forgeMaterialPageHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: await forgeMaterialsFormat(event.current.UserId, Number(route.param('page')), String(route.param('keyword') ?? '')) }); } catch (error) { await message.send({ format: messageFormat('无法查看材料', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const forgeMaterialSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: await forgeMaterialsFormat(event.current.UserId, 1, String(route.param('keyword'))) }); } catch (error) { await message.send({ format: messageFormat('无法搜索材料', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const forgeMaterialListHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: await forgeMaterialsFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('无法查看材料', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const forgeStartHandler = (_confirmed = false) => async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireBlacksmith(event.current.UserId);
    const state = await forgeState(event.current.UserId);
    const result = await craftForgeEquipment(event.current.UserId, _confirmed);
    if (state.source === 'blacksmith') await awardBlacksmithCraftAffinity(event.current.UserId);
    await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('打造成功').addNewline().addNewline().addText(`获得【${result.name}】\n稀有度：${result.rarity}\n品质：${result.quality.toFixed(1)}%\n`).addNewline().addBlockquote(effectText(result.effect))).addButtonGroup(Format.createButtonGroup().addRow().addButton('查看装备', `/装备详情 ${result.instanceId}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton(state.source === 'profession' ? '返回副职业' : '返回铁匠铺', forgeReturn(state.source), { type: 'command', autoEnter: true })) });
  } catch (error) { await message.send({ format: messageFormat('打造失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};
export const blacksmithAboutHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireBlacksmith(event.current.UserId);
    const quest = await blacksmithQuest(event.current.UserId);
    if (quest.status === 'none') {
      const markdown = Format.createMarkdown().addTitle('关于 锻造师').addNewline().addNewline()
        .addBlockquote('漠北——镇民通常称他小北——相信金属并非冰冷的死物。每一块矿石、每一次落锤和每一道火候，都会决定武器最终能否回应持有者。成为锻造师后，你可以亲手打造装备、精炼品质，并以材料为装备熔铸新的力量。');
      await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('选定副职业 锻造师', '/选择副职业 锻造师', { type: 'command', autoEnter: true, style: 'blue' })) });
      return;
    }
    if (quest.status === 'completed') {
      const markdown = Format.createMarkdown().addTitle('锻造师任务').addNewline().addNewline().addText(`活木：${quest.wood}/1\n兽核：${quest.core}/1\n任务已完成，回到小北面前提交吧。`);
      await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('提交任务', '/提交锻造师任务', { type: 'command', autoEnter: true, style: 'blue' })) });
      return;
    }
    if (quest.status === 'claimed') {
      const markdown = Format.createMarkdown().addTitle('关于 锻造师').addNewline().addNewline().addBlockquote('小北点了点头：“火候记在心里，手上的锤子才不会骗人。你已经是锻造师了。”');
      await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('查看 副职业', '/副职业', { type: 'command', autoEnter: true, style: 'blue' })) });
      return;
    }
    const markdown = Format.createMarkdown().addTitle('锻造师任务').addNewline().addNewline().addText(`收集活木与兽核各 1 份。\n活木：${quest.wood}/1\n兽核：${quest.core}/1`);
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('任务栏', '/任务', { type: 'command', autoEnter: true, style: 'blue' }).addButton('放弃任务', '/铁匠铺', { type: 'command', autoEnter: true })) });
  } catch (error) { await message.send({ format: messageFormat('无法交谈', error instanceof Error ? error.message : '请稍后重试。') }); }
};
export const blacksmithProfessionSelectHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireBlacksmith(event.current.UserId);
    const quest = await blacksmithQuest(event.current.UserId); if (quest.status !== 'none') throw new Error('你已经接取或完成了锻造师任务。');
    const markdown = Format.createMarkdown().addTitle('我想成为锻造师').addNewline().addNewline()
      .addBlockquote('“我叫漠北，不过镇里都叫我小北。想学打铁，不必先会挥锤——先去替我找一块活木和一枚兽核，让我看看你有没有把材料带回来的本事。”')
      .addNewline().addNewline().addText('发现新支线，是否接受？\n（只可拥有一个副职业，请谨慎决定）');
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('接受任务', '/接受锻造师任务', { type: 'command', autoEnter: true, style: 'blue' }).addButton('放弃任务', '/关于锻造师', { type: 'command', autoEnter: true })) });
  } catch (error) { await message.send({ format: messageFormat('无法选择副职业', error instanceof Error ? error.message : '请稍后重试。') }); }
};
export const acceptBlacksmithQuestHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await acceptBlacksmithQuest(event.current.UserId); const markdown = Format.createMarkdown().addTitle('接受任务').addNewline().addNewline().addText('已接受【副职业·锻造师入门】\n收集：活木×1、兽核×1\n可随时通过 ').addButton('/任务', { data: '/任务', autoEnter: false }).addText(' 查看进度。'); await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('任务', '/任务', { type: 'command', autoEnter: true, style: 'blue' })) }); } catch (error) { if (error instanceof Error && error.message === 'secondary_profession_level_required') { await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('小北的婉拒').addNewline().addNewline().addBlockquote('小北把锤子搁回铁砧，认真地打量了你一会儿。\n“现在还太早。锻造要经得住炉火，也得经得住冒险里的风浪。等你到了 Lv.10，带着更扎实的本事再来找我吧。”')) }); return; } await message.send({ format: messageFormat('接取失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const claimBlacksmithQuestHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireBlacksmith(event.current.UserId);
    const result = await claimBlacksmithQuest(event.current.UserId);
    await grantNpcAffinity(event.current.UserId, 'blacksmith', 200);
    const markdown = Format.createMarkdown().addTitle('副职业转职成功').addNewline().addNewline()
      .addBlockquote('小北将活木投入炉火，又把兽核嵌进铁砧凹槽。火星在你手边炸开，他把锤柄递来：“从今天起，听铁的声音，也听你自己的声音。”')
      .addNewline().addNewline().addText('————————————').addNewline()
      .addText(`【${result.characterName}】已转职副职业[${result.name}]！\n【${result.characterName}】获得[${result.giftName}]！`);
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('查看 副职业', '/副职业', { type: 'command', autoEnter: true, style: 'blue' })) });
  } catch (error) { await message.send({ format: messageFormat('提交失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};
export const secondaryProfessionHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const { secondaryProfessionCode } = await import('../game/alchemist.service'); const profession = await secondaryProfessionCode(event.current.UserId); if (profession === 'alchemist') { const { alchemistProfessionFormat } = await import('./alchemist'); await message.send({ format: await alchemistProfessionFormat(event.current.UserId) }); return; } if (profession === 'deconstructor') { const { deconstructorProfessionFormat } = await import('./deconstructor'); await message.send({ format: await deconstructorProfessionFormat(event.current.UserId) }); return; } if (profession === 'omniscient') { const { omniscientProfessionFormat } = await import('./bookshop'); await message.send({ format: await omniscientProfessionFormat(event.current.UserId) }); return; } const isBlacksmith = profession === 'blacksmith'; const progress = isBlacksmith ? await blacksmithProgress(event.current.UserId) : null; const markdown = Format.createMarkdown().addTitle(isBlacksmith ? '副职业·锻造师' : '副职业').addNewline().addNewline(); if (isBlacksmith && progress) markdown.addText(`等级：Lv.${progress.level}\n熟练度：${progress.proficiency}/${progress.required}\n${proficiencyBar(progress.proficiency, progress.required)}`).addNewline().addNewline().addBlockquote(`打造成功率+${progress.bonus}%`).addNewline().addBlockquote(`精炼大成功率+${progress.bonus}%`).addNewline().addBlockquote(`熔铸成功率+${progress.bonus}%`); else markdown.addText('尚未获得副职业。你可以前往导师处了解并选择一门副职业。'); const buttons = isBlacksmith ? professionButtons() : Format.createButtonGroup().addRow().addButton('前往 铁匠铺', '/前往 -17 -123', { type: 'command', autoEnter: true, style: 'blue' }).addButton('前往 糖水屋', '/前往 -12 -127', { type: 'command', autoEnter: true, style: 'blue' }).addButton('前往 异工坊', '/前往 4 -121', { type: 'command', autoEnter: true, style: 'blue' }).addButton('前往 百味书屋', '/前往 12 -116', { type: 'command', autoEnter: true, style: 'blue' }); await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) }); } catch (error) { await message.send({ format: messageFormat('无法查看副职业', error instanceof Error ? error.message : '请稍后重试。') }); } };
