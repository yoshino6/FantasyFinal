import { Format, useEvent, useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { messageFormat } from '../game/message';
import { dynamicNpcVoiceAnchor } from '../game/dynamic-npc-dialogue.service';
import { contributeDynamicScene, currentDynamicEncounter, joinDynamicScene, nearbyDynamicScenes, resolveDynamicEncounter, weatherForPlayer, patrolEncounterPreview, startPatrolEncounter } from '../game/world-dynamics.service';

const fail = async (message: any, error: unknown, title: string) => await message.send({ format: messageFormat(title, error instanceof Error ? error.message : '操作失败。') });
const encounterFormat = (encounter: Awaited<ReturnType<typeof currentDynamicEncounter>>) => {
  if (!encounter) return messageFormat('当前奇遇', '附近暂时没有正在等待你抉择的奇遇。继续探索新的网格，或稍后再来。');
  if (encounter.patrol && encounter.objective) {
    const target = encounter.objective.location;
    const markdown = Format.createMarkdown().addTitle(`奇遇·${encounter.title}`).addNewline().addNewline().addBlockquote(encounter.opening).addNewline().addNewline()
      .addText(`目标：${encounter.objective.text}`).addNewline().addButton(`[前往 ${target.name}]`, { data: `/前往 ${target.x} ${target.y}`, autoEnter: false }).addNewline()
      .addText(encounter.patrol.rewarded ? '完成后按本次约定结算报酬。' : '本轮报酬名额已用完，你仍可参与并留下自己的记录。').addNewline()
      .addText(`请在 ${encounter.expiresAt.toLocaleTimeString('zh-CN', { hour12: false })} 前完成。`);
    const buttons = Format.createButtonGroup().addRow();
    for (const choice of encounter.choices) buttons.addButton(choice.label, `/奇遇选择 ${encounter.id} ${choice.code}`, { type: 'command', autoEnter: true, style: 'blue' });
    buttons.addRow().addButton('任务栏', '/任务', { type: 'command', autoEnter: true });
    return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
  }
  const markdown = Format.createMarkdown().addTitle(`奇遇·${encounter.title}`).addNewline().addNewline().addText(`${encounter.regionName}｜${encounter.weatherName}`).addNewline().addNewline().addText(encounter.opening).addNewline().addNewline().addBlockquote(`此实例将在 ${encounter.expiresAt.toLocaleString('zh-CN', { hour12: false })} 失效；选择只会结算一次。`);
  const buttons = Format.createButtonGroup().addRow();
  for (const choice of encounter.choices) buttons.addButton(choice.label, `/奇遇选择 ${encounter.id} ${choice.code}`, { type: 'command', autoEnter: true, style: 'blue' });
  buttons.addButton('附近公共奇遇', '/附近奇遇', { type: 'command', autoEnter: true });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

export const weatherHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try {
  const weather = await weatherForPlayer(event.current.UserId); const next = weather.transitionDueAt.toLocaleString('zh-CN', { hour12: false });
  const markdown = Format.createMarkdown().addTitle(`区域天气·${weather.regionName}`).addNewline().addNewline().addText(`${weather.name}｜强度 ${weather.intensity}/3｜${weather.phase}`).addNewline().addNewline().addText(weather.description).addNewline().addNewline().addBlockquote(weather.modifiers.hint).addNewline().addBlockquote(`区域独立天气；预计下一次自然演变：${next}`).addNewline().addNewline().addText('元素预报').addNewline().addText(Object.entries(weather.modifiers.elementBonuses).length ? Object.entries(weather.modifiers.elementBonuses).map(([element, value]) => `${element}${value >= 0 ? '+' : ''}${value}%`).join('｜') : '当前无元素伤害修正。');
  await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('查看奇遇', '/奇遇', { type: 'command', autoEnter: true, style: 'blue' }).addButton('继续探索', '/探索', { type: 'command', autoEnter: true })) });
} catch (error) { await fail(message, error, '天气查询失败'); } };
export const dynamicEncounterHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await message.send({ format: encounterFormat(await currentDynamicEncounter(event.current.UserId)) }); } catch (error) { await fail(message, error, '奇遇查询失败'); } };
export const dynamicEncounterChoiceHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
  const result = await resolveDynamicEncounter(event.current.UserId, String(route.param('choice')), String(route.param('id')));
  if (result.patrol) {
    if (!result.completed) { await message.send({ format: encounterFormat({ ...result, opening: `${result.choice.text}\n\n${result.opening}` }) }); return; }
    await message.send({ format: messageFormat(`奇遇结局·${result.title}`, `${result.choice.text}\n\n${result.choice.copper ? `获得铜币 ×${result.choice.copper}` : '此次没有铜币报酬。'}${result.choice.stage ? '\n你的处理结果已记入当地巡查记录。' : ''}`).addButtonGroup(Format.createButtonGroup().addRow().addButton('操作面板', '/面板', { type: 'command', autoEnter: true }).addButton('任务栏', '/任务', { type: 'command', autoEnter: true })) });
    return;
  }
  if (!result.completed) {
    const markdown = Format.createMarkdown().addTitle(`奇遇进展·${result.title}`).addNewline().addNewline().addText(result.choice.text).addNewline().addNewline().addBlockquote('这次选择改变了现场，但奇遇仍未结束。');
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('继续抉择', '/奇遇', { type: 'command', autoEnter: true, style: 'blue' }).addButton('附近公共奇遇', '/附近奇遇', { type: 'command', autoEnter: true })) });
    return;
  }
  const markdown = Format.createMarkdown().addTitle(`奇遇结局·${result.title}`).addNewline().addNewline().addText(result.choice.text).addNewline().addNewline().addBlockquote(`命运印记：${result.choice.flag}`).addNewline().addBlockquote(`世界线「${result.worldline}」阶段 ${Number(result.choice.stage) >= 0 ? '+' : ''}${result.choice.stage}`).addNewline().addBlockquote(Number(result.choice.copper) ? `获得铜币 ×${result.choice.copper}` : '你没有获得即时铜币，但这次决定仍被世界记录。');
  if (result.reward) markdown.addNewline().addBlockquote(result.reward.duplicate ? `隐藏奖励「${result.reward.name}」已在你的命运收藏中，本次转化为世界记录。` : `发现隐藏奖励：${result.reward.name}。`);
  if (result.sharedWitnesses) markdown.addNewline().addBlockquote(`${result.sharedWitnesses} 位非同队见证者获得了协助报酬。`);
  if (result.worldlineResult?.bossReady) markdown.addNewline().addBlockquote('世界线已开启首领门槛；后台结算会按自然复生规则尝试生成首领。');
  await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('继续探索', '/探索', { type: 'command', autoEnter: true, style: 'blue' }).addButton('附近公共奇遇', '/附近奇遇', { type: 'command', autoEnter: true }).addButton('天气', '/天气', { type: 'command', autoEnter: true })) });
} catch (error) { await fail(message, error, '奇遇选择失败'); } };

export const nearbyDynamicSceneHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try {
  const scenes = await nearbyDynamicScenes(event.current.UserId); const markdown = Format.createMarkdown().addTitle('附近公共奇遇').addNewline().addNewline();
  if (!scenes.length) markdown.addText('一格范围内暂无可参与的公共奇遇。公共奇遇只在部分事件中出现，且需要亲自抵达附近。');
  else for (const scene of scenes) markdown.addText(`${scene.title}\n`).addBlockquote(`发现者：${scene.discovererName}｜参与者 ${scene.participantCount}/6｜距离 ${scene.distance} 格｜至 ${scene.expiresAt.toLocaleTimeString('zh-CN', { hour12: false })} 结束`).addNewline().addButton('前往见证', { data: `/参与奇遇 ${scene.id}`, autoEnter: true }).addButton('护送协作', { data: `/奇遇协作 ${scene.id} escort`, autoEnter: true }).addButton('破译协作', { data: `/奇遇协作 ${scene.id} decode`, autoEnter: true }).addButton('物资支援', { data: `/奇遇协作 ${scene.id} supply`, autoEnter: true }).addNewline().addNewline();
  await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('我的奇遇', '/奇遇', { type: 'command', autoEnter: true, style: 'blue' }).addButton('继续探索', '/探索', { type: 'command', autoEnter: true })) });
} catch (error) { await fail(message, error, '公共奇遇查询失败'); } };

export const joinDynamicSceneHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
  const result = await joinDynamicScene(event.current.UserId, String(route.param('id'))); const text = result.alreadyJoined ? `你已经以「${result.role}」身份在场。` : result.role === 'observer' ? '你作为旁观者抵达现场。为避免同队反复刷取，同一队伍只有一名成员可以领取协助报酬。' : '你已作为见证者加入。发现者完成终局后，你会获得一次受上限约束的协助报酬。';
  await message.send({ format: messageFormat('公共奇遇', text).addButtonGroup(Format.createButtonGroup().addRow().addButton('查看现场', '/附近奇遇', { type: 'command', autoEnter: true, style: 'blue' }).addButton('继续探索', '/探索', { type: 'command', autoEnter: true })) });
} catch (error) { await fail(message, error, '参与奇遇失败'); } };
export const contributeDynamicSceneHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
  const result = await contributeDynamicScene(event.current.UserId, String(route.param('id')), String(route.param('kind')) as 'escort' | 'decode' | 'supply');
  await message.send({ format: messageFormat('公共奇遇协作', result.text).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回现场', '/附近奇遇', { type: 'command', autoEnter: true, style: 'blue' })) });
} catch (error) { await fail(message, error, '公共奇遇协作失败'); } };
export { encounterFormat };

export const patrolMeetingFormat = async (qqUserId: string, npcCode: string, name: string, continuingChat = false, affinity = 0) => {
  const preview = await patrolEncounterPreview(qqUserId, npcCode); if (!preview) return null;
  const markdown = Format.createMarkdown().addTitle(`域民·${name}`).addNewline().addNewline().addBlockquote(preview.text);
  // 外出时不复用含“日光照进店内”等室内场景的闲聊开头。
  const voice = continuingChat ? dynamicNpcVoiceAnchor(npcCode, affinity) : null;
  if (voice) markdown.addNewline().addNewline().addBlockquote(`“${voice.catchphrase}。${affinity >= 200 ? voice.trust : affinity >= 50 ? voice.warmth : voice.caution}。”`);
  const buttons = Format.createButtonGroup().addRow().addButton(preview.responding ? '查看公共现场' : '询问行程并参与', preview.responding ? '/附近奇遇' : `/巡游奇遇 ${npcCode} ${preview.revision}`, { type: 'command', autoEnter: true, style: 'blue' })
    .addButton('闲聊', `/域民交谈 ${npcCode}`, { type: 'command', autoEnter: true }).addButton('忽略', `/NPC忽略 ${npcCode}`, { type: 'command', autoEnter: true });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};
export const patrolEncounterHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await message.send({ format: encounterFormat(await startPatrolEncounter(event.current.UserId, String(route.param('code')), Number(route.param('revision')))) }); }
  catch (error) { await fail(message, error, '巡游奇遇'); }
};
