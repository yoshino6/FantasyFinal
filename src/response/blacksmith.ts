import { currentSecondaryShop, shopProfessions } from '../game/secondary-shop-context';
import { Format, useEvent, useRoute } from 'alemonjs';
import { appendHiddenQuestButton } from './hidden-profession';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { addNpcAffinity, grantNpcAffinity, nearbyPoints, requireNpcAtCurrentPosition } from '../game/adventure.service';
import { acceptBlacksmithQuest, armorClassEffectText, blacksmithFusionEquipment, blacksmithMaxLevel, blacksmithProgress, blacksmithQuest, blacksmithWeapons, claimBlacksmithQuest, craftEpicForgeEquipment, craftForgeEquipment, epicForgeBlueprints, epicForgePreview, forgeFee, forgeRarityWeights, forgeState, fuseWeapon, fusionMaterials, refineWeapon, refinementMaterials, reforgeEquipment, reforgeEquipmentList, reforgePreview, resetForgeSession, selectForgeCategory, selectForgeLevel, selectForgeSubtype } from '../game/blacksmith.service';
import { messageFormat } from '../game/message';

const requireBlacksmith = async (qqUserId: string) => {
  if(currentSecondaryShop()?.shop==='blacksmith')return;
  const { secondaryProfessionCode } = await import('../game/alchemist.service');
  if ((await secondaryProfessionCode(qqUserId)) === 'blacksmith') return;
  throw new Error('请从个人锻造师面板或铁匠铺的服务按键进入。');
};
const proficiencyBar = (current: number, required: number) => {
  const ratio = required > 0 ? Math.max(0, Math.min(1, current / required)) : 1;
  const filled = Math.round(ratio * 10);
  return `${'■'.repeat(filled)}${'□'.repeat(10 - filled)}`;
};
export const blacksmithButtons = () => Format.createButtonGroup()
  .addRow().addButton('我要买','/铁匠铺购买',{type:'command',autoEnter:true,style:'blue'}).addButton('我要卖','/铁匠铺出售',{type:'command',autoEnter:true,style:'blue'})
  .addRow().addButton('切磋','/切磋 blacksmith',{type:'command',autoEnter:true}).addButton('闲聊','/铁匠铺闲聊',{type:'command',autoEnter:true}).addButton('关于锻造师','/关于锻造师',{type:'command',autoEnter:true})

    .addRow().addButton('打造','/店铺副职业打造装备',{type:'command',autoEnter:true,style:'blue'}).addButton('图纸打造','/店铺图纸打造',{type:'command',autoEnter:true,style:'blue'}).addButton('精炼','/店铺精炼',{type:'command',autoEnter:true,style:'blue'})
    .addRow().addButton('熔铸','/店铺熔铸',{type:'command',autoEnter:true,style:'blue'}).addButton('重铸','/店铺重铸',{type:'command',autoEnter:true,style:'blue'}).addButton('制作维修包','/店铺维修包 制作',{type:'command',autoEnter:true,style:'blue'})
  .addRow().addButton('离开','/建筑离开 blacksmith',{type:'command',autoEnter:true});
const professionButtons = () => Format.createButtonGroup().addRow().addButton('入门与导师','/副职业导师',{type:'command',autoEnter:true}).addButton('制作维修包','/维修包 制作',{type:'command',autoEnter:true}).addRow().addButton('打造', '/副职业打造装备', { type: 'command', autoEnter: true, style: 'blue' }).addButton('图纸打造', '/图纸打造', { type: 'command', autoEnter: true, style: 'blue' }).addButton('精炼', '/精炼', { type: 'command', autoEnter: true, style: 'blue' }).addButton('熔铸', '/熔铸', { type: 'command', autoEnter: true, style: 'blue' }).addRow().addButton('重铸','/重铸',{type:'command',autoEnter:true,style:'blue'});
const effectLabels: Record<string, string> = { hpMax: '生命', mpMax: '魔力', physicalAttack: '物攻', magicAttack: '魔攻', physicalDefense: '物防', magicDefense: '魔防', accuracy: '命中', evasion: '闪避', speed: '速度', critRateBp: '暴击', critDamageBp: '暴伤', critResistBp: '暴免', critDamageReductionBp: '暴抗', tenacity: '韧性', tenacityPierce: '破韧', hpPct: '生命上限', mpPct: '魔力上限', physicalAttackPct: '物攻', magicAttackPct: '魔攻', physicalDefensePct: '物防', magicDefensePct: '魔防', accuracyPct: '命中', evasionPct: '闪避', speedPct: '速度', critRatePct: '暴击', critDamagePct: '暴伤', critResistPct: '暴免', critDamageReductionPct: '暴抗', tenacityPct: '韧性', tenacityPiercePct: '破韧', constitutionPct: '体质', spiritPct: '精神', strengthPct: '力量', intelligencePct: '智力', agilityPct: '敏捷', perceptionPct: '感知', magicDamagePct: '魔法伤害', damageBonusPct: '伤害增加', damageReductionPct: '受伤降低' };
const effectLabel = (key: string) => effectLabels[key] ?? (key.startsWith('elementMastery_') ? `${key.slice('elementMastery_'.length)}元素精通` : key.startsWith('elementResistance_') ? `${key.slice('elementResistance_'.length)}元素抗性` : '');
const effectTendencyText = (keys: string[]) => keys.map(effectLabel).filter(Boolean).join('、');
const effectText = (effect: Record<string, unknown>, primaryKeys: readonly string[] = []) => {
  const label = effectLabel;
  const primary = new Set(primaryKeys);
  const normalOrder = ['hpMax', 'mpMax', 'physicalAttack', 'magicAttack', 'physicalDefense', 'magicDefense', 'accuracy', 'evasion', 'speed', 'critRateBp', 'critDamageBp', 'critResistBp', 'critDamageReductionBp', 'tenacity', 'tenacityPierce', 'hpPct', 'mpPct', 'physicalAttackPct', 'magicAttackPct', 'physicalDefensePct', 'magicDefensePct', 'accuracyPct', 'evasionPct', 'speedPct', 'critRatePct', 'critDamagePct', 'critResistPct', 'critDamageReductionPct', 'tenacityPct', 'tenacityPiercePct', 'constitutionPct', 'spiritPct', 'strengthPct', 'intelligencePct', 'agilityPct', 'perceptionPct'];
  const elementalOrder = ['金', '木', '水', '火', '土', '风', '雷', '冰', '光', '暗'];
  return Object.entries(effect).filter(([key, value]) => label(key) && Number(value)).map(([key, value]) => {
    const group = primary.has(key) ? 0 : key.startsWith('elementMastery_') || key.startsWith('elementResistance_') ? 2 : 1;
    const order = group === 2 ? elementalOrder.indexOf(key.split('_')[1] ?? '') * 2 + (key.startsWith('elementResistance_') ? 1 : 0) : normalOrder.indexOf(key);
    const amount = key.endsWith('Pct') ? `${Number(value).toFixed(1)}%` : String(Math.round(Number(value)));
    const rare = key === 'damageBonusPct' || key === 'damageReductionPct';
    return { group, order: order < 0 ? Number.MAX_SAFE_INTEGER : order, text: `${rare ? '⭐️' : ''}${label(key)}${Number(value) >= 0 ? '+' : ''}${amount}` };
  }).sort((left, right) => left.group - right.group || left.order - right.order || left.text.localeCompare(right.text, 'zh-CN')).map(attribute => attribute.text).join('｜') || '随机基础强化';
};
const numberMark = '①②③④⑤⑥⑦⑧⑨⑩';
export const blacksmithFormat = async (qqUserId: string, text?: string) => {
  const hour = new Date().getHours();
  const scene = text ?? (hour < 11
    ? '清晨的炉火刚刚旺起来。漠北踩着垫脚木块整理铁砧，狐耳在热浪中微微晃动。\n他抬头看了你一眼：“早啊。我叫漠北，镇里都叫我小北。今天想买卖装备，还是聊聊锻造师的事？”'
    : hour < 18
      ? '炉火映亮了铁砧。握锤的是个约莫十二三岁的少年，狐耳在热浪中微微晃动，矮人的结实骨架却让他挥锤时格外稳当。\n他抬头看了你一眼：“我叫漠北，镇里都叫我小北。要买卖装备，还是聊聊锻造师的事？”'
      : '夜里的铁匠铺仍回荡着清脆锤声。漠北将刚淬好的铁器搁到一旁，火光映得他眼神明亮。\n“晚上好。炉火还热着，有需要就说吧。”');
  const detailsUnlocked = (await nearbyPoints(qqUserId)).npcDetailsUnlocked;
  const markdown = Format.createMarkdown().addTitle('百纳镇·铁匠铺').addNewline().addNewline().addText('【漠北·Lv.3 锻造师】');
  if (detailsUnlocked) markdown.addText(' ').addButton('[详情]', { data: '/域民详情 blacksmith', autoEnter: false });
  markdown.addNewline().addNewline().addBlockquote(scene);
  const buttons = blacksmithButtons();
  await appendHiddenQuestButton(buttons, qqUserId, 'blacksmith');
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
export default async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireNpcAtCurrentPosition(event.current.UserId,'blacksmith');
    await message.send({ format: await blacksmithFormat(event.current.UserId) });
  } catch (error) {
    await message.send({ format: messageFormat('无法进入铁匠铺', error instanceof Error ? error.message : '请稍后重试。') });
  }
};
const awardBlacksmithCraftAffinity = async (qqUserId: string) => {
  try { return await addNpcAffinity(qqUserId, 'blacksmith', 'craft'); }
  catch (error) { if (error instanceof Error && error.message.includes('已经离开')) return undefined; throw error; }
};
const weaponList = async (qqUserId: string, mode: 'refine' | 'fuse', page = 1, keyword = '') => {
  const allWeapons = mode === 'refine' ? await blacksmithWeapons(qqUserId) : await blacksmithFusionEquipment(qqUserId);
  const weapons = allWeapons.filter(weapon => !keyword || weapon.name.includes(keyword) || weapon.category.includes(keyword));
  const totalPages = Math.max(1, Math.ceil(weapons.length / 10));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const entries = weapons.slice((currentPage - 1) * 10, currentPage * 10);
  const title = mode === 'refine' ? '精炼' : '熔铸';
  const markdown = Format.createMarkdown().addTitle(title).addNewline().addNewline().addBlockquote(mode === 'refine' ? '选择一把武器放上铁砧。品质越高，精炼越困难；每次精炼有 3% 概率大成功。' : '选择一件装备放上熔炉。每 10 级获得 1 次熔铸机会，优秀及以上品质会额外增加机会；元素微尘会随装备部位转为精通或抗性。').addNewline().addNewline().addText('背包装备：').addNewline();
  if (!entries.length) markdown.addBlockquote(`背包中没有可${mode === 'refine' ? '精炼的武器' : '熔铸的装备'}。`).addNewline();
  for (const [index, weapon] of entries.entries()) {
    markdown.addBlockquote(`${numberMark.charAt(index)}【${weapon.category}】${weapon.name} #${weapon.id}｜品质：${weapon.quality.toFixed(1)}%｜稀有度：${weapon.rarity}｜熔铸：${weapon.fusionCount}/${weapon.fusionLimit}`).addText(' ').addButton('[放入]', { data: mode === 'refine' ? `/精炼放入 ${weapon.id}` : `/熔铸放入 ${weapon.id}`, autoEnter: false }).addNewline();
  }
  markdown.addText(`当前第（${currentPage}/${totalPages}）页`).addNewline();
  const prefix = mode === 'refine' ? '精炼' : '熔铸';
  const previous = Math.max(1, currentPage - 1); const next = Math.min(totalPages, currentPage + 1);
  const pageCommand = (target: number) => `/${prefix}页 ${target}${keyword ? ` ${keyword}` : ''}`;
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup()
    .addRow().addButton('上一页', pageCommand(previous), { type: 'command', autoEnter: true, style: currentPage > 1 ? 'blue' : undefined }).addButton('搜索', `/${prefix}搜索 `, { type: 'command', autoEnter: false, style: 'blue' }).addButton('下一页', pageCommand(next), { type: 'command', autoEnter: true, style: currentPage < totalPages ? 'blue' : undefined }));
};
const materialList = async (qqUserId: string, mode: 'refine' | 'fuse', instanceId: number, page = 1, keyword = '') => {
  const weapons = mode === 'refine' ? await blacksmithWeapons(qqUserId) : await blacksmithFusionEquipment(qqUserId); const weapon = weapons.find(item => item.id === instanceId); if (!weapon) throw new Error(`未找到该${mode === 'refine' ? '武器' : '装备'}。`);
  const allMaterials: any[] = mode === 'refine' ? await refinementMaterials(qqUserId, weapon.requiredLevel) : await fusionMaterials(qqUserId, weapon.category);
  const materials = allMaterials.filter(material => !keyword || material.name.includes(keyword) || material.category.includes(keyword));
  const totalPages = Math.max(1, Math.ceil(materials.length / 10)); const currentPage = Math.min(Math.max(1, page), totalPages);
  const entries = materials.slice((currentPage - 1) * 10, currentPage * 10);
  const progress = mode === 'fuse' ? await blacksmithProgress(qqUserId) : null;
  const markdown = Format.createMarkdown().addTitle(mode === 'refine' ? '精炼·选择材料' : '熔铸·选择材料').addNewline().addNewline().addText(`已放入：【${weapon.category}】${weapon.name}\n`).addBlockquote(`品质：${weapon.quality.toFixed(1)}%｜熔铸：${weapon.fusionCount}/${weapon.fusionLimit}${progress ? `｜成功率：${Math.min(100, 70 + progress.bonus)}%` : ''}`).addNewline().addNewline();
  if (!entries.length) markdown.addBlockquote(mode === 'refine' ? '没有符合条件的精炼材料。' : '没有符合条件的熔铸材料。').addNewline();
  for (const [index, material] of entries.entries()) {
    const detail = mode === 'refine' ? `本次提升 ${material.minGain}%～${material.maxGain}%` : material.fixedTendency ? material.description : `倾向${effectTendencyText(material.tendencyKeys)}`;
    markdown.addBlockquote(`${numberMark.charAt(index)}【${material.category}】${material.name}×${material.quantity}｜${detail}`).addText(' ').addButton('[使用]', { data: mode === 'refine' ? `/精炼执行 ${instanceId} ${material.id}` : `/熔铸执行 ${instanceId} ${material.id}`, autoEnter: false }).addNewline();
  }
  markdown.addText(`当前第（${currentPage}/${totalPages}）页`).addNewline();
  const previous = Math.max(1, currentPage - 1); const next = Math.min(totalPages, currentPage + 1);
  const prefix = mode === 'refine' ? '精炼材料' : '熔铸材料';
  const pageCommand = (target: number) => `/${prefix}页 ${instanceId} ${target}${keyword ? ` ${keyword}` : ''}`;
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup()
    .addRow().addButton('上一页', pageCommand(previous), { type: 'command', autoEnter: true, style: currentPage > 1 ? 'blue' : undefined }).addButton('搜索', `/${prefix}搜索 ${instanceId} `, { type: 'command', autoEnter: false, style: 'blue' }).addButton('下一页', pageCommand(next), { type: 'command', autoEnter: true, style: currentPage < totalPages ? 'blue' : undefined }));
};
export const refineListHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: await weaponList(event.current.UserId, 'refine') }); } catch (error) { await message.send({ format: messageFormat('无法精炼', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const refinePageHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: await weaponList(event.current.UserId, 'refine', Number(route.param('page')), String(route.param('keyword') ?? '')) }); } catch (error) { await message.send({ format: messageFormat('无法查看精炼装备', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const refineSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: await weaponList(event.current.UserId, 'refine', 1, String(route.param('keyword'))) }); } catch (error) { await message.send({ format: messageFormat('无法搜索精炼装备', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const refinePutHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: await materialList(event.current.UserId, 'refine', Number(route.param('id'))) }); } catch (error) { await message.send({ format: messageFormat('无法放入武器', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const refineMaterialPageHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: await materialList(event.current.UserId, 'refine', Number(route.param('id')), Number(route.param('page')), String(route.param('keyword') ?? '')) }); } catch (error) { await message.send({ format: messageFormat('无法查看材料', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const refineMaterialSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: await materialList(event.current.UserId, 'refine', Number(route.param('id')), 1, String(route.param('keyword'))) }); } catch (error) { await message.send({ format: messageFormat('无法搜索材料', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const refineExecuteHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); const result = await refineWeapon(event.current.UserId, Number(route.param('instanceId')), Number(route.param('materialId'))); await awardBlacksmithCraftAffinity(event.current.UserId); const text = result.failed ? `【${result.name}】的精炼未能突破瓶颈。\n消耗【${result.material}】×1\n品质维持 ${result.oldQuality.toFixed(1)}%` : `【${result.name}】精炼${result.great ? '大成功！' : '成功！'}\n消耗【${result.material}】×1\n品质：${result.oldQuality.toFixed(1)}% → ${result.newQuality.toFixed(1)}%（+${result.gain.toFixed(1)}%）`; await message.send({ format: messageFormat('精炼结果', text) }); await message.send({ format: await materialList(event.current.UserId, 'refine', Number(route.param('instanceId'))) }); } catch (error) { await message.send({ format: messageFormat('精炼失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const fuseListHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: await weaponList(event.current.UserId, 'fuse') }); } catch (error) { await message.send({ format: messageFormat('无法熔铸', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const fusePageHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: await weaponList(event.current.UserId, 'fuse', Number(route.param('page')), String(route.param('keyword') ?? '')) }); } catch (error) { await message.send({ format: messageFormat('无法查看熔铸装备', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const fuseSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: await weaponList(event.current.UserId, 'fuse', 1, String(route.param('keyword'))) }); } catch (error) { await message.send({ format: messageFormat('无法搜索熔铸装备', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const fusePutHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: await materialList(event.current.UserId, 'fuse', Number(route.param('id'))) }); } catch (error) { await message.send({ format: messageFormat('无法放入武器', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const fuseMaterialPageHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: await materialList(event.current.UserId, 'fuse', Number(route.param('id')), Number(route.param('page')), String(route.param('keyword') ?? '')) }); } catch (error) { await message.send({ format: messageFormat('无法查看材料', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const fuseMaterialSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: await materialList(event.current.UserId, 'fuse', Number(route.param('id')), 1, String(route.param('keyword'))) }); } catch (error) { await message.send({ format: messageFormat('无法搜索材料', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const fuseExecuteHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); const result = await fuseWeapon(event.current.UserId, Number(route.param('instanceId')), Number(route.param('materialId'))); await awardBlacksmithCraftAffinity(event.current.UserId); await message.send({ format: messageFormat(result.failed ? '熔铸失败' : '熔铸完成', result.failed ? `【${result.name}】未能承受熔铸的力量。\n消耗【${result.material}】×1\n本次成功率：${result.success}%` : `【${result.name}】融入了【${result.material}】\n获得：${effectText(result.effect)}\n熔铸次数：${result.count}/${result.limit}`) }); await message.send({ format: await materialList(event.current.UserId, 'fuse', Number(route.param('instanceId'))) }); } catch (error) { await message.send({ format: messageFormat('熔铸失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const reforgeListHandler = async () => { const [event]=useEvent(); const [message]=useMessage(); try { await requireBlacksmith(event.current.UserId); const items=await reforgeEquipmentList(event.current.UserId); const markdown=Format.createMarkdown().addTitle('重铸').addNewline().addNewline().addBlockquote('放入未装备的常规成品装备，重铸为高 5 级的同类型同部位装备。旧装备按原配方价值的 60%～80% 抵扣。').addNewline().addNewline(); if(!items.length)markdown.addBlockquote('没有可重铸的 Lv.5–25 成品装备。'); for(const item of items)markdown.addBlockquote(`【Lv.${item.level}·${item.category}】${item.name} #${item.id}`).addText(' ').addButton('[放入]',{data:`/重铸放入 ${item.id}`,autoEnter:false}).addNewline(); await message.send({format:Format.create().addMarkdown(markdown)}); } catch(error){await message.send({format:messageFormat('无法重铸',error instanceof Error?error.message:'请稍后重试。')});} };
export const reforgePreviewHandler = async () => { const [event]=useEvent(); const [route]=useRoute(); const [message]=useMessage(); try { await requireBlacksmith(event.current.UserId); const preview=await reforgePreview(event.current.UserId,Number(route.param('id'))); const markdown=Format.createMarkdown().addTitle('重铸预览').addNewline().addNewline().addText(`【${preview.source.name}】→ Lv.${preview.targetLevel}${preview.source.weapon_type}\n旧装备折抵：${Math.round(preview.discount*100)}%\n补料：`).addNewline(); for(const material of preview.materials)markdown.addBlockquote(`${material.name} ${material.owned}/${material.quantity}${material.owned>=material.quantity?' 已满足':' 不足'}`).addNewline(); markdown.addText(`手续费：铜币×${preview.fee}`); await message.send({format:Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('确认重铸',`/确认重铸 ${preview.source.id}`,{type:'command',autoEnter:true,style:'blue'}).addButton('返回','/重铸',{type:'command',autoEnter:true}))}); }catch(error){await message.send({format:messageFormat('无法预览重铸',error instanceof Error?error.message:'请稍后重试。')});} };
export const reforgeExecuteHandler = async () => { const [event]=useEvent(); const [route]=useRoute(); const [message]=useMessage(); try { await requireBlacksmith(event.current.UserId); const result=await reforgeEquipment(event.current.UserId,Number(route.param('id'))); await awardBlacksmithCraftAffinity(event.current.UserId); await message.send({format:messageFormat('重铸完成',`获得【${result.name}】\nLv.${result.level}｜${result.rarity}\n旧装备折抵 ${Math.round(result.discount*100)}%｜手续费 铜币×${result.fee}`)}); }catch(error){await message.send({format:messageFormat('重铸失败',error instanceof Error?error.message:'请稍后重试。')});} };

const forgeCommand = (source: 'blacksmith' | 'profession') => source === 'profession' ? '/副职业打造装备' : '/打造装备';
const forgeReturn = (source: 'blacksmith' | 'profession') => source === 'profession' ? '/副职业' : '/铁匠铺';
const forgeFormat = async (source: 'blacksmith' | 'profession') => Format.create().addMarkdown(Format.createMarkdown().addTitle('打造装备').addNewline().addNewline().addBlockquote('选择想打造的装备部位。首饰暂不开放打造。').addNewline().addNewline()).addButtonGroup(Format.createButtonGroup().addRow().addButton('武器', '/打造部位 武器', { type: 'command', autoEnter: true, style: 'blue' }).addButton('头肩', '/打造部位 头肩', { type: 'command', autoEnter: true, style: 'blue' }).addButton('上装', '/打造部位 上装', { type: 'command', autoEnter: true, style: 'blue' }).addRow().addButton('腰部', '/打造部位 腰部', { type: 'command', autoEnter: true, style: 'blue' }).addButton('下装', '/打造部位 下装', { type: 'command', autoEnter: true, style: 'blue' }).addButton('脚部', '/打造部位 脚部', { type: 'command', autoEnter: true, style: 'blue' }).addRow().addButton('返回', forgeReturn(source), { type: 'command', autoEnter: true }));
const forgeSubtypeFormat = async (qqUserId: string) => { const state = await forgeState(qqUserId); if (!state.category) throw new Error('请先选择打造部位。'); const types = state.category === '武器' ? ['长剑', '法杖', '法书', '法球', '匕首', '拳刃', '盾牌'] : ['布甲', '皮甲', '轻甲', '重甲', '板甲']; const buttons = Format.createButtonGroup(); for (let index = 0; index < types.length; index += 3) { const row = buttons.addRow(); for (const type of types.slice(index, index + 3)) row.addButton(type, `/打造类型 ${type}`, { type: 'command', autoEnter: true, style: 'blue' }); } buttons.addRow().addButton('返回打造', forgeCommand(state.source), { type: 'command', autoEnter: true }); const guide = state.category === '武器' ? '请选择武器类型。不同武器会拥有不同的基础属性倾向。盾牌也属于武器，可装备在主手或副手。' : types.map(type => `${type}：${armorClassEffectText(type)}`).join('\n'); return Format.create().addMarkdown(Format.createMarkdown().addTitle(`打造·${state.category}`).addNewline().addNewline().addBlockquote(guide)).addButtonGroup(buttons); };
const forgeLevelFormat = async (qqUserId: string) => { const state = await forgeState(qqUserId); if (!state.subtype) throw new Error('请先选择装备类型。'); const buttons = Format.createButtonGroup(); for (let index = 0; index < 6; index += 3) { const row = buttons.addRow(); for (const level of [5, 10, 15, 20, 25, 30].slice(index, index + 3)) row.addButton(`Lv.${level}`, `/打造等级 ${level}`, { type: 'command', autoEnter: true, style: 'blue' }); } buttons.addRow().addButton('返回类型', forgeCommand(state.source), { type: 'command', autoEnter: true }); return Format.create().addMarkdown(Format.createMarkdown().addTitle(`打造·${state.category}·${state.subtype}`).addNewline().addNewline().addBlockquote('常规打造开放 Lv.5–30、每 5 级一档。每 20 级更换一套提纯材料；同一循环位置需求数量相同，循环内每提升 5 级增加 20%。')).addButtonGroup(buttons); };
const forgeMaterialsFormat = async (qqUserId: string, _page = 1, _keyword = '') => {
  const state = await forgeState(qqUserId);
  if (!state.category || !state.subtype || !state.level) throw new Error('请完成部位、类型和等级选择。');
  const markdown = Format.createMarkdown().addTitle('打造').addNewline().addNewline()
    .addText(`目标：${state.category}·${state.subtype}·Lv.${state.level}`).addNewline()
    .addText(`费用：铜币×${forgeFee(state.requirements)}`).addNewline()
    .addText('所需材料：').addNewline();
  for (const requirement of state.requirements) {
    const material = state.materials.find(item => item.code === requirement.code);
    const owned = material?.quantity ?? 0;
    markdown.addBlockquote(`${material?.name ?? requirement.name}（${owned}/${requirement.quantity}）${owned >= requirement.quantity ? ' 已满足' : ' 不足'}`).addNewline();
  }
  const armorText = armorClassEffectText(state.subtype);
  if (armorText) markdown.addNewline().addBlockquote(armorText).addNewline();
  markdown.addNewline().addBlockquote(`稀有度概率：${forgeRarityWeights(state.progress.level).filter(([, chance]) => chance > 0).map(([rarity, chance]) => `${rarity} ${chance}%`).join('｜')}`);
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup()
    .addRow().addButton('开始打造', '/开始打造', { type: 'command', autoEnter: true, style: 'blue' }).addButton('重新选择', forgeCommand(state.source), { type: 'command', autoEnter: true }));
};
const openForge = (source: 'blacksmith' | 'profession') => async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await resetForgeSession(event.current.UserId, source); await message.send({ format: await forgeFormat(source) }); } catch (error) { await message.send({ format: messageFormat('无法打造', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const forgeHandler = openForge('blacksmith');
export const secondaryProfessionForgeHandler = openForge('profession');
export const forgeCategoryHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await selectForgeCategory(event.current.UserId, String(route.param('category'))); await message.send({ format: await forgeSubtypeFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('选择失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const forgeSubtypeHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await selectForgeSubtype(event.current.UserId, String(route.param('subtype'))); await message.send({ format: await forgeLevelFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('选择失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const forgeLevelHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await selectForgeLevel(event.current.UserId, Number(route.param('level'))); await message.send({ format: await forgeMaterialsFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('选择失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
const blueprintForgeListFormat = async (qqUserId: string) => {
  const blueprints = await epicForgeBlueprints(qqUserId);
  const markdown = Format.createMarkdown().addTitle('图纸打造').addNewline().addNewline()
    .addText('背包内图纸：').addNewline().addNewline();
  if (!blueprints.length) markdown.addBlockquote('无');
  for (const [index, entry] of blueprints.entries()) {
    const recipe = entry.recipe;
    markdown.addBlockquote(`${numberMark.charAt(index)}【Lv.30·史诗·${recipe.category}·${recipe.subtype}】${recipe.name}｜图纸×${entry.blueprintQuantity}`).addText(' ')
      .addButton('[打造]', { data: `/查看图纸打造 ${recipe.blueprintCode}`, autoEnter: false }).addNewline()
      .addText(`来源：${recipe.bossName}`).addNewline().addNewline();
  }
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回 铁匠铺', '/铁匠铺', { type: 'command', autoEnter: true }));
};
const blueprintForgePreviewFormat = async (qqUserId: string, blueprintCode: string) => {
  const preview = await epicForgePreview(qqUserId, blueprintCode); const { recipe } = preview;
  const kind = recipe.category === '武器' ? `${recipe.subtype}武器` : `${recipe.subtype}${recipe.category}`;
  const markdown = Format.createMarkdown().addTitle(`图纸打造·${recipe.name}`).addNewline().addNewline()
    .addBlockquote(`装备简介：由【${recipe.bossName}】图纸打造的 Lv.30 史诗${kind}。${recipe.setCode ? '属于固定甲类套装部件；实际套装效果在装备后按件数触发。' : '为独立史诗武器，不计入任何防具套装件数。'} 本页不展示装备具体属性数值。`)
    .addNewline().addNewline().addText('打造后消耗：').addNewline();
  for (const material of preview.materials) markdown.addBlockquote(`${material.name} ${material.owned}/${material.required}${material.owned >= material.required ? ' 已满足' : ' 不足'}`).addNewline();
  markdown.addNewline().addText(`手续费：铜币×${preview.fee}`).addNewline();
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup()
    .addRow().addButton('确认打造', `/确认图纸打造 ${recipe.blueprintCode}`, { type: 'command', autoEnter: true, style: preview.ready ? 'blue' : undefined })
    .addButton('返回 图纸', '/图纸打造', { type: 'command', autoEnter: true }));
};
export const epicForgeListHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: await blueprintForgeListFormat(event.current.UserId) }); } catch (error) { await message.send({ format: messageFormat('无法查看图纸打造', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const epicForgePreviewHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: await blueprintForgePreviewFormat(event.current.UserId, String(route.param('blueprintCode'))) }); } catch (error) { await message.send({ format: messageFormat('无法查看图纸', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const epicForgeCraftHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); const result = await craftEpicForgeEquipment(event.current.UserId, String(route.param('blueprintCode'))); await awardBlacksmithCraftAffinity(event.current.UserId); await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('史诗打造完成').addNewline().addNewline().addText(`获得【${result.name}】\n稀有度：史诗\n品质：${result.quality.toFixed(1)}%\n消耗图纸与全部配方材料。\n手续费：铜币×${result.fee}`).addNewline().addNewline().addBlockquote(`本次词条：\n${effectText(result.effect, result.primaryKeys)}`).addNewline().addNewline().addBlockquote(result.setCode ? '该防具已可计入对应史诗套装件数。' : '该武器拥有独立战斗效果，不计入防具套装件数。')).addButtonGroup(Format.createButtonGroup().addRow().addButton('查看装备', `/装备详情 ${result.instanceId}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('图纸打造', '/图纸打造', { type: 'command', autoEnter: true })) }); } catch (error) { await message.send({ format: messageFormat('史诗打造失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
const fixedRecipeNotice = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireBlacksmith(event.current.UserId); await message.send({ format: messageFormat('固定配方打造', '打造不再接受辅材；请选择装备等级后查看并备齐固定材料。') }); } catch (error) { await message.send({ format: messageFormat('无法打造', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const forgeMaterialHandler = fixedRecipeNotice;
export const forgeMaterialRemoveHandler = fixedRecipeNotice;
export const forgeMaterialSetHandler = fixedRecipeNotice;
export const forgeMaterialClearHandler = fixedRecipeNotice;
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
    await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('打造成功').addNewline().addNewline().addText(`获得【${result.name}】\n稀有度：${result.rarity}\n品质：${result.quality.toFixed(1)}%\n熟练度：+${result.proficiencyGain}\n`).addNewline().addBlockquote(effectText(result.effect, result.primaryKeys))).addButtonGroup(Format.createButtonGroup().addRow().addButton('查看装备', `/装备详情 ${result.instanceId}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton(state.source === 'profession' ? '返回副职业' : '返回铁匠铺', forgeReturn(state.source), { type: 'command', autoEnter: true })) });
  } catch (error) { await message.send({ format: messageFormat('打造失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};
export const blacksmithAboutHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireNpcAtCurrentPosition(event.current.UserId,'blacksmith');
    const quest = await blacksmithQuest(event.current.UserId);
    if (quest.status === 'none') {
      const markdown = Format.createMarkdown().addTitle('关于 锻造师').addNewline().addNewline()
        .addBlockquote('漠北——镇民通常称他小北——是一名 Lv.3 锻造师。他相信金属并非冰冷的死物；每一块矿石、每一次落锤和每一道火候，都会决定武器最终能否回应持有者。成为锻造师后，你可以亲手打造装备、精炼品质，并以材料为装备熔铸新的力量。');
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
    await requireNpcAtCurrentPosition(event.current.UserId,'blacksmith');
    const quest = await blacksmithQuest(event.current.UserId); if (quest.status !== 'none') throw new Error('你已经接取或完成了锻造师任务。');
    const markdown = Format.createMarkdown().addTitle('我想成为锻造师').addNewline().addNewline()
      .addBlockquote('“我叫漠北，不过镇里都叫我小北。想学打铁，不必先会挥锤——先去替我找一块活木和一枚兽核，让我看看你有没有把材料带回来的本事。”')
      .addNewline().addNewline().addText('发现新支线，是否接受？\n（只可拥有一个副职业，请谨慎决定）');
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('接受任务', '/接受锻造师任务', { type: 'command', autoEnter: true, style: 'blue' }).addButton('放弃任务', '/关于锻造师', { type: 'command', autoEnter: true })) });
  } catch (error) { await message.send({ format: messageFormat('无法选择副职业', error instanceof Error ? error.message : '请稍后重试。') }); }
};
export const acceptBlacksmithQuestHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await requireNpcAtCurrentPosition(event.current.UserId,'blacksmith'); await acceptBlacksmithQuest(event.current.UserId); const markdown = Format.createMarkdown().addTitle('接受任务').addNewline().addNewline().addText('已接受【副职业·锻造师入门】\n收集：活木×1、兽核×1\n可随时通过 ').addButton('/任务', { data: '/任务', autoEnter: false }).addText(' 查看进度。'); await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('任务', '/任务', { type: 'command', autoEnter: true, style: 'blue' })) }); } catch (error) { if (error instanceof Error && error.message === 'secondary_profession_level_required') { await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('小北的婉拒').addNewline().addNewline().addBlockquote('小北把锤子搁回铁砧，认真地打量了你一会儿。\n“现在还太早。锻造要经得住炉火，也得经得住冒险里的风浪。等你到了 Lv.10，带着更扎实的本事再来找我吧。”')) }); return; } await message.send({ format: messageFormat('接取失败', error instanceof Error ? error.message : '请稍后重试。') }); } };
export const claimBlacksmithQuestHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireNpcAtCurrentPosition(event.current.UserId,'blacksmith');
    const result = await claimBlacksmithQuest(event.current.UserId);
    await grantNpcAffinity(event.current.UserId, 'blacksmith', 200);
    const markdown = Format.createMarkdown().addTitle('副职业转职成功').addNewline().addNewline()
      .addBlockquote('小北将活木投入炉火，又把兽核嵌进铁砧凹槽。火星在你手边炸开，他把锤柄递来：“从今天起，听铁的声音，也听你自己的声音。”')
      .addNewline().addNewline().addText('————————————').addNewline()
      .addText(`【${result.characterName}】已转职副职业[${result.name}]！\n【${result.characterName}】获得[${result.giftName}]！`);
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('查看 副职业', '/副职业', { type: 'command', autoEnter: true, style: 'blue' })) });
  } catch (error) { await message.send({ format: messageFormat('提交失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};
export const secondaryProfessionHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const { secondaryProfessionCode } = await import('../game/alchemist.service'); const profession = currentSecondaryShop()?shopProfessions[currentSecondaryShop()!.shop]:await secondaryProfessionCode(event.current.UserId); if (profession === 'alchemist') { const { alchemistProfessionFormat } = await import('./alchemist'); await message.send({ format: await alchemistProfessionFormat(event.current.UserId) }); return; } if (profession === 'deconstructor') { const { deconstructorProfessionFormat } = await import('./deconstructor'); await message.send({ format: await deconstructorProfessionFormat(event.current.UserId) }); return; } if (profession === 'omniscient') { const { omniscientProfessionFormat } = await import('./bookshop'); await message.send({ format: await omniscientProfessionFormat(event.current.UserId) }); return; } const isBlacksmith = profession === 'blacksmith'; const progress = isBlacksmith ? await blacksmithProgress(event.current.UserId) : null; const markdown = Format.createMarkdown().addTitle(isBlacksmith ? '副职业·锻造师' : '副职业').addNewline().addNewline(); if (isBlacksmith && progress) { const maxed = progress.level >= blacksmithMaxLevel; markdown.addText(`等级：Lv.${maxed ? 'MAX' : progress.level}\n${maxed ? '熟练度：已达上限' : `熟练度：${progress.proficiency}/${progress.required}\n${proficiencyBar(progress.proficiency, progress.required)}`}`).addNewline().addNewline().addBlockquote(`打造成功率+${progress.bonus}%`).addNewline().addBlockquote(`精炼大成功率+${progress.bonus}%`).addNewline().addBlockquote(`熔铸成功率+${progress.bonus}%`); } else markdown.addText('尚未获得副职业。你可以前往导师处了解并选择一门副职业。').addNewline().addButton('[入门与导师]',{data:'/副职业导师',autoEnter:false}); const buttons = isBlacksmith ? professionButtons() : Format.createButtonGroup()
  .addRow().addButton('前往 铁匠铺', '/前往 -17 -191', { type: 'command', autoEnter: true, style: 'blue' })
  .addRow().addButton('前往 糖水屋', '/前往 -12 -196', { type: 'command', autoEnter: true, style: 'blue' })
  .addRow().addButton('前往 异工坊', '/前往 6 -189', { type: 'command', autoEnter: true, style: 'blue' })
  .addRow().addButton('前往 百味书屋', '/前往 14 -176', { type: 'command', autoEnter: true, style: 'blue' }); await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) }); } catch (error) { await message.send({ format: messageFormat('无法查看副职业', error instanceof Error ? error.message : '请稍后重试。') }); } };
