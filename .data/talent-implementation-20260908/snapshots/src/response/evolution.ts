import { Format, useEvent, useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { requireNpcAtCurrentPosition } from '../game/adventure.service';
import { acceptEvolutionObservation, archiveMutation, claimEvolutionObservation, evolutionInjectionMaterials, evolutionItemName, evolutionObservationDashboard, evolutionPanel, injectEvolution, bodyPartNames, mutationDetail, setMutationPaused, shapingDraft, stabilizeMutation, symbiosisTraitCodes, symbiosisTraits, toggleShapingTrait, type BodyPart, type InjectionCode, type SymbiosisTraitCode } from '../game/evolution.service';
import { recalculateCharacterStats } from '../game/character.service';
import { messageFormat } from '../game/message';
import { withTransaction } from '../database/pool';
import { experienceRequiredForLevel } from '../game/constants';

const injectionCodes: InjectionCode[] = ['conservative', 'aggressive', 'harmonic', 'perception', 'symbiosis', 'metamorphosis', 'shaping'];
const injectionLabels: Record<InjectionCode, string> = { conservative: '保守', aggressive: '激进', harmonic: '调和', perception: '感知', symbiosis: '共生', metamorphosis: '蜕变', shaping: '定型' };
const bodyPartCodes = Object.keys(bodyPartNames) as BodyPart[];
const fail = async (message: any, error: unknown, title = '演化研究失败') => message.send({ format: messageFormat(title, error instanceof Error ? error.message : '请稍后重试。') });
const effectLabels: Record<string, string> = { hpPct: '生命', mpPct: '魔力', physicalAttackPct: '物攻', magicAttackPct: '魔攻', physicalDefensePct: '物防', magicDefensePct: '魔防', accuracyPct: '命中', evasionPct: '闪避', critRatePct: '暴击', critDamagePct: '暴伤', critResistPct: '暴抗', critDamageReductionPct: '暴免', tenacityPct: '韧性', tenacityPiercePct: '破韧', speedPct: '速度', damageReductionPct: '减伤', hpRegenPct: '回生', mpRegenPct: '回魔' };
const effectText = (raw: unknown) => {
  let effect: Record<string, unknown> = {};
  try { effect = typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown> ?? {}; } catch { effect = {}; }
  const entries = Object.entries(effect).filter(([, value]) => Number(value));
  return entries.length ? entries.map(([key, value]) => `${effectLabels[key] ?? key} ${Number(value) > 0 ? '+' : ''}${Number(value)}%`).join('｜') : '当前未提供额外战斗属性。';
};

const injectionPreview = (code: InjectionCode, professionCode: string | null, pressure: number) => {
  const pressureText = (change: number) => change === 0 ? '适应压力不变' : `适应压力 ${change > 0 ? '+' : ''}${change}（当前 ${pressure} → ${Math.max(0, Math.min(8, pressure + change))}）`;
  if (code === 'conservative') return { fixed: '生命、魔力、物防、魔防各 +2%；稳定度 +20。', mutation: '发生率 15%｜有益 100%｜偏差 0%', risk: pressureText(-1), parts: '表皮、胸腔、骨骼' };
  if (code === 'aggressive') return { fixed: `${['warrior', 'rogue'].includes(String(professionCode)) ? '物攻' : '魔攻'} +2.5%，暴击 +1%，速度 +1%。`, mutation: '发生率 45%｜有益 70%｜偏差 30%', risk: pressureText(2), parts: '骨骼、神经、表皮' };
  if (code === 'harmonic') return { fixed: '生命 +4%，治疗与受疗各 +5%；稳定度 +10，并封存一条轻度偏差。', mutation: '发生率 25%｜有益 80%｜偏差 20%', risk: pressureText(-1), parts: '胸腔、脏器' };
  if (code === 'perception') return { fixed: '命中、闪避各 +3%，暴击 +1%。', mutation: '发生率 35%｜有益 75%｜偏差 25%', risk: pressureText(1), parts: '眼部、神经' };
  if (code === 'symbiosis') return { fixed: '首次注射时选择 1 项队伍共鸣微被动。', mutation: '发生率 35%｜有益 75%｜偏差 25%', risk: pressureText(0), parts: '脏器、表皮' };
  if (code === 'metamorphosis') return { fixed: '无固定战斗属性；获得谱系印记。', mutation: '发生率 60%｜有益 85%｜偏差 15%', risk: pressureText(1), parts: '可指定：眼部、神经、表皮、胸腔、骨骼或脏器' };
  return { fixed: '不产生新的随机变异；选择已有稳定或稀有观测作为定型特征。', mutation: '不产生随机变异', risk: pressureText(0), parts: '从已观测的稳定或稀有特征中选择' };
};

const mutationText = (mutation: any) => `${bodyPartNames[mutation.body_part as BodyPart]}·${mutation.mutation_name}（${mutation.mutation_state === 'stable' ? '稳定' : mutation.mutation_state === 'deviation' ? '偏差' : mutation.mutation_state === 'rare' ? '稀有观测' : mutation.mutation_state === 'archived' ? '已封存' : '暂停'}${Number(mutation.tier) > 1 ? ` II 阶` : ''}）`;
const evolutionRecordText = (record: any) => {
  let payload: Record<string, unknown> = {};
  try { payload = typeof record.payload === 'string' ? JSON.parse(record.payload) : record.payload ?? {}; } catch { payload = {}; }
  if (record.event_type === 'evolution.seed_awakened') return '进化之种已感悟，演化档案建立。';
  if (record.event_type === 'evolution.injected') return `注射${injectionLabels[payload.code as InjectionCode] ?? String(payload.code ?? '未知')}针剂，解除 Lv.${payload.level ?? '?'} 的生长结。`;
  if (record.event_type === 'evolution.mutation_paused') return '一项偏差已暂停。';
  if (record.event_type === 'evolution.mutation_resumed') return '一项偏差已恢复观察。';
  if (record.event_type === 'evolution.mutation_stabilized') return '一项偏差已稳定处理。';
  if (record.event_type === 'evolution.mutation_archived') return '一项变异已封存。';
  return '留下了一条演化记录。';
};

export const evolutionPanelFormat = async (qqUserId: string, inLab = false) => {
  const panel = await evolutionPanel(qqUserId);
  if (!panel) return Format.create().addMarkdown(Format.createMarkdown().addTitle('演化研究室').addNewline().addNewline().addText('深蓝色小门没有回应。或许你尚未拥有能够与此处共鸣的进化之种。'));
  const profile = panel.profile; const current = Number(panel.character.level); const cap = Number(profile.unlocked_level); const atKnot = current === cap && Number(panel.character.experience) >= experienceRequiredForLevel(cap);
  const marks = Object.entries(typeof profile.lineage_marks_json === 'string' ? JSON.parse(profile.lineage_marks_json) : profile.lineage_marks_json ?? {}).map(([key, value]) => `${({ root: '根脉', night: '夜巡', rock: '岩壳', tide: '潮汐' } as Record<string, string>)[key] ?? key} ${value}`).join('｜') || '尚未形成';
  const symbiosis = profile.symbiosis_trait_code as SymbiosisTraitCode | null; const symbiosisText = symbiosis && symbiosisTraits[symbiosis] ? `${symbiosisTraits[symbiosis].name}（同行：${symbiosisTraits[symbiosis].partyText}｜独行：${symbiosisTraits[symbiosis].soloText}）` : '尚未选择';
  const markdown = Format.createMarkdown().addTitle(inLab ? '演化研究室' : '进化面板·开化').addNewline().addNewline()
    .addText(`等级：Lv.${current}｜当前等级结：Lv.${cap}${atKnot ? '（经验已满）' : ''}`).addNewline().addNewline()
    .addText(`演化刻度：${profile.evolution_scale}/10｜适应压力：${profile.adaptation_pressure}/8｜稳定度：${profile.stability}/100`).addNewline().addNewline()
    .addText(`谱系印记：${marks}`).addNewline().addNewline()
    .addText(`共生微被动：${symbiosisText}`).addNewline().addNewline()
    .addBlockquote(`材料：活性样本 ${panel.materials.find(item => item.code === 'evolution_active_sample')?.quantity ?? 0}｜稳定介质 ${panel.materials.find(item => item.code === 'evolution_stable_medium')?.quantity ?? 0}｜催化剂 ${panel.materials.find(item => item.code === 'evolution_catalyst')?.quantity ?? 0}`).addNewline().addNewline()
    .addText('当前观测：').addNewline();
  if (!panel.mutations.length) markdown.addBlockquote('尚未记录变异。');
  else panel.mutations.forEach(mutation => markdown.addBlockquote(mutationText(mutation)).addNewline());
  markdown.addNewline().addNewline().addText('最近记录：').addNewline().addNewline();
  if (!panel.history.length) markdown.addBlockquote('档案建立后，所有感悟、注射与变异处理都会记录于此。');
  else panel.history.slice(0, 3).forEach(record => markdown.addBlockquote(evolutionRecordText(record)).addNewline());
  const buttons = Format.createButtonGroup();
  if (inLab) {
    buttons.addRow().addButton('与噶切磋', '/切磋 evolution_lab', { type: 'command', autoEnter: true, style: 'blue' });
    buttons.addRow().addButton('查看 今日委托', '/进化委托', { type: 'command', autoEnter: true, style: 'blue' })
      .addButton('选择 进化针剂', '/进化针剂', { type: 'command', autoEnter: true, style: 'blue' });
    buttons.addRow().addButton('管理 变异', '/进化变异', { type: 'command', autoEnter: true, style: 'blue' });
    buttons.addRow().addButton('查看 进化面板', '/进化面板', { type: 'command', autoEnter: true })
      .addButton('离开', '/建筑离开 evolution_lab', { type: 'command', autoEnter: true });
  } else buttons.addRow().addButton('前往 研究室', '/前往 -6 7', { type: 'command', autoEnter: true, style: 'blue' });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

export const evolutionLabHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { await requireNpcAtCurrentPosition(event.current.UserId, 'evolution_lab'); await message.send({ format: await evolutionPanelFormat(event.current.UserId, true) }); }
  catch (error) { await fail(message, error, '研究室未开启'); }
};
export const evolutionPanelHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { await message.send({ format: await evolutionPanelFormat(event.current.UserId) }); }
  catch (error) { await fail(message, error); }
};

export const evolutionNeedleHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireNpcAtCurrentPosition(event.current.UserId, 'evolution_lab'); const panel = await evolutionPanel(event.current.UserId);
    if (!panel) throw new Error('研究室尚未向你开放。');
    const level = Number(panel.profile.unlocked_level); const markdown = Format.createMarkdown().addTitle('进化针剂').addNewline().addNewline()
      .addText(`当前生长结：Lv.${level} → Lv.${level + 1}`).addNewline().addNewline()
      .addBlockquote(Number(panel.profile.injection_count) === 0 ? '第一次注射为免费的引导针剂；请选择想要观察的方向。' : '选择分支后会先展示完整预览；确认注射时，才会消耗活性样本、稳定介质与演化催化剂。');
    const buttons = Format.createButtonGroup(); const available = new Set(panel.available);
    for (let index = 0; index < injectionCodes.length; index += 3) {
      const row = buttons.addRow();
      for (const code of injectionCodes.slice(index, index + 3)) if (available.has(code)) row.addButton(injectionLabels[code], `/进化针剂预览 ${code}`, { type: 'command', autoEnter: true, style: 'blue' });
    }
    buttons.addRow().addButton('返回 研究室', '/进化研究室', { type: 'command', autoEnter: true });
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
  } catch (error) { await fail(message, error); }
};

export const evolutionInjectionPreviewHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    await requireNpcAtCurrentPosition(event.current.UserId, 'evolution_lab'); const code = String(route.param('code')) as InjectionCode;
    if (!injectionCodes.includes(code)) throw new Error('未知针剂。'); const panel = await evolutionPanel(event.current.UserId); if (!panel || !panel.available.includes(code)) throw new Error('这支针剂尚未开放。');
    const initial = Number(panel.profile.injection_count) === 0;
    const hasNeedle = Number(panel.injections.find(item => item.code === code)?.quantity ?? 0) > 0;
    const materials = evolutionInjectionMaterials(Number(panel.profile.unlocked_level), code);
    const materialCount = (itemCode: string) => Number(panel.materials.find(item => item.code === itemCode)?.quantity ?? 0);
    const materialHint = `制作所需：活性样本 ${materials.active}（现有 ${materialCount('evolution_active_sample')}）｜稳定介质 ${materials.medium}（现有 ${materialCount('evolution_stable_medium')}）｜演化催化剂 ${materials.catalyst}（现有 ${materialCount('evolution_catalyst')}）`;
    const preview = injectionPreview(code, panel.character.profession_code, Number(panel.profile.adaptation_pressure));
    const level = Number(panel.profile.unlocked_level);
    const markdown = Format.createMarkdown().addTitle(`注射预览·${injectionLabels[code]}针剂`).addNewline().addNewline()
      .addText(`解除：Lv.${level} → Lv.${level + 1} 的生长结`).addNewline().addNewline()
      .addText(`固定收益：${preview.fixed}`).addNewline().addNewline()
      .addText(`本次变异：${preview.mutation}`).addNewline().addNewline()
      .addText(`风险：${preview.risk}`).addNewline().addNewline()
      .addText(`倾向部位：${preview.parts}`).addNewline().addNewline()
      .addBlockquote(initial ? '本次为引导针剂，不消耗材料。' : hasNeedle ? '背包中已有旧版对应针剂；确认注射时将优先消耗它。' : '确认注射时会消耗下列材料；确认前不会扣除任何物品。');
    const symbiosis = panel.profile.symbiosis_trait_code as SymbiosisTraitCode | null;
    if (code === 'symbiosis') {
      markdown.addNewline().addBlockquote(symbiosis && symbiosisTraits[symbiosis]
        ? `已选择【${symbiosisTraits[symbiosis].name}】：同行时${symbiosisTraits[symbiosis].partyText}；独行时${symbiosisTraits[symbiosis].soloText}。`
        : '首次注射共生针剂时，请从三项共生微被动中选择一项。同行时为队伍提供共鸣；独行时会转为更强的自身增益。');
      if (!(symbiosis && symbiosisTraits[symbiosis])) for (const trait of symbiosisTraitCodes) markdown.addNewline().addBlockquote(`【${symbiosisTraits[trait].name}】同行：${symbiosisTraits[trait].partyText}｜独行：${symbiosisTraits[trait].soloText}`);
    }
    if (!initial && !hasNeedle) markdown.addNewline().addBlockquote(materialHint);
    const buttons = Format.createButtonGroup();
    if (code === 'shaping') buttons.addRow().addButton('进行 自我定义', '/进化定型', { type: 'command', autoEnter: true, style: 'blue' });
    else if (code === 'metamorphosis') {
      for (let index = 0; index < bodyPartCodes.length; index += 3) { const row = buttons.addRow(); for (const part of bodyPartCodes.slice(index, index + 3)) row.addButton(bodyPartNames[part], `/进化注射 ${code} ${part}`, { type: 'command', autoEnter: true, style: 'blue' }); }
    } else if (code === 'symbiosis' && !(symbiosis && symbiosisTraits[symbiosis])) {
      const row = buttons.addRow(); for (const trait of symbiosisTraitCodes) row.addButton(symbiosisTraits[trait].name, `/进化共生选择 ${trait}`, { type: 'command', autoEnter: true, style: 'blue' });
    } else buttons.addRow().addButton('确认 注射', `/进化注射 ${code}`, { type: 'command', autoEnter: true, style: 'blue' });
    buttons.addRow().addButton('返回 配方', '/进化针剂', { type: 'command', autoEnter: true });
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
  } catch (error) { await fail(message, error); }
};

export const evolutionInjectHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    await requireNpcAtCurrentPosition(event.current.UserId, 'evolution_lab'); const code = String(route.param('code')) as InjectionCode; const part = String(route.param('part') ?? '') as BodyPart;
    const result = await injectEvolution(event.current.UserId, code, bodyPartCodes.includes(part) ? part : undefined);
    await withTransaction(connection => recalculateCharacterStats(connection, result.characterId));
    const mutation = result.mutation ? `\n\n${bodyPartNames[result.mutation.part]}出现【${result.mutation.name}】——${result.mutation.outcome}。` : '\n\n这次观察没有形成可记录的变异。';
    const finalTraits = result.finalTraits.length ? `\n定型特征：${result.finalTraits.join('、')}。` : '';
    const symbiosis = result.symbiosisTrait ? `\n共生微被动：${result.symbiosisTrait.name}（同行：${result.symbiosisTrait.partyText}｜独行：${result.symbiosisTrait.soloText}）。` : '';
    await message.send({ format: messageFormat('进化针剂·注射完成', `【${result.name}】解除 Lv.${result.fromLevel} → Lv.${result.toLevel} 的生长结。\n你已升至 Lv.${result.toLevel}，获得 ${result.gainedSkillPoints} 技能点。\n适应压力：${result.pressure}/8｜稳定度：${result.stability}/100${mutation}${finalTraits}${symbiosis}`) });
  } catch (error) { await fail(message, error); }
};

export const evolutionSymbiosisHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    await requireNpcAtCurrentPosition(event.current.UserId, 'evolution_lab'); const trait = String(route.param('trait')) as SymbiosisTraitCode;
    if (!symbiosisTraitCodes.includes(trait)) throw new Error('未知的共生微被动。');
    const result = await injectEvolution(event.current.UserId, 'symbiosis', undefined, trait); await withTransaction(connection => recalculateCharacterStats(connection, result.characterId));
    const mutation = result.mutation ? `\n\n${bodyPartNames[result.mutation.part]}出现【${result.mutation.name}】——${result.mutation.outcome}。` : '\n\n这次观察没有形成可记录的变异。';
    const passive = result.symbiosisTrait!;
    await message.send({ format: messageFormat('进化针剂·注射完成', `【${result.name}】解除 Lv.${result.fromLevel} → Lv.${result.toLevel} 的生长结。\n你已升至 Lv.${result.toLevel}，获得 ${result.gainedSkillPoints} 技能点。\n共生微被动：${passive.name}（同行：${passive.partyText}｜独行：${passive.soloText}）。\n适应压力：${result.pressure}/8｜稳定度：${result.stability}/100${mutation}`) });
  } catch (error) { await fail(message, error); }
};

const shapingFormat = async (qqUserId: string) => {
  const draft = await shapingDraft(qqUserId); const selected = new Set(draft.selectedIds);
  const markdown = Format.createMarkdown().addTitle('自我定义').addNewline().addNewline().addText(`从已有稳定观测中选择 ${draft.required} 项定型特征（当前 ${selected.size}/${draft.required}）。`).addNewline().addNewline().addBlockquote('定型不会改写角色的种族或性别；它只记录你愿意带往开化阶段的特征。').addNewline().addNewline();
  if (!draft.traits.length) markdown.addText('尚未形成稳定观测，本次可直接完成定型。');
  const buttons = Format.createButtonGroup();
  for (let index = 0; index < draft.traits.length; index += 3) {
    const row = buttons.addRow();
    for (const trait of draft.traits.slice(index, index + 3)) row.addButton(`${selected.has(Number(trait.id)) ? '✓ ' : ''}${bodyPartNames[trait.body_part as BodyPart]}·${trait.mutation_name}`, `/进化定型选择 ${trait.id}`, { type: 'command', autoEnter: true, style: selected.has(Number(trait.id)) ? 'blue' : undefined });
  }
  if (selected.size === draft.required) buttons.addRow().addButton('确认 自我定义', '/进化注射 shaping', { type: 'command', autoEnter: true, style: 'blue' });
  buttons.addRow().addButton('返回 针剂', '/进化针剂', { type: 'command', autoEnter: true });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

export const evolutionShapingHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { await requireNpcAtCurrentPosition(event.current.UserId, 'evolution_lab'); await message.send({ format: await shapingFormat(event.current.UserId) }); }
  catch (error) { await fail(message, error); }
};

export const evolutionShapingToggleHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await requireNpcAtCurrentPosition(event.current.UserId, 'evolution_lab'); await toggleShapingTrait(event.current.UserId, Number(route.param('id'))); await message.send({ format: await shapingFormat(event.current.UserId) }); }
  catch (error) { await fail(message, error); }
};

export const evolutionObservationHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    await requireNpcAtCurrentPosition(event.current.UserId, 'evolution_lab'); const kind = String(route.param('kind') ?? '');
    if (['behavior', 'sample', 'adaptation', 'resonance', 'containment'].includes(kind)) {
      const accepted = await acceptEvolutionObservation(event.current.UserId, kind as any);
      await message.send({ format: messageFormat(`接取·${accepted.name}`, `观察目标：${accepted.objective}\n完成后返回研究室提交记录。\n报酬：${accepted.rewards}`) }); return;
    }
    const dashboard = await evolutionObservationDashboard(event.current.UserId);
    const markdown = Format.createMarkdown().addTitle('今日观察').addNewline().addNewline()
      .addText(`今日已提交：${dashboard.claimed}/2｜还可整理：${dashboard.remaining} 份`).addNewline().addNewline();
    if (dashboard.active) {
      const active = dashboard.active; markdown.addText(`正在进行：${active.definition.name}`).addNewline().addNewline()
        .addBlockquote(`${active.objective_text}（${active.progress}/${active.target_count}）`).addNewline().addNewline();
      if (active.status === 'completed') markdown.addBlockquote('观察记录已经完整，可以交给噶归档。').addNewline().addNewline().addButton('[提交 委托]', { data: '/提交进化委托', autoEnter: false }).addNewline().addNewline();
      else markdown.addBlockquote('目标完成后，再回到研究室提交记录。').addNewline().addNewline();
    } else if (!dashboard.available.length) markdown.addText('今日的观察已经全部整理完毕。').addNewline().addNewline();
    else {
      markdown.addBlockquote('选择一项观察。接取后需在世界中完成目标，材料会在提交记录时发放。').addNewline().addNewline();
      for (const observation of dashboard.available) markdown.addText(`${observation.name}：`).addButton('[接取]', { data: `/领取进化委托 ${observation.type}`, autoEnter: false }).addNewline().addNewline()
        .addBlockquote(observation.objective).addNewline().addNewline().addBlockquote(`报酬：${observation.rewards}`).addNewline().addNewline();
    }
    const observationsFinished = !dashboard.active && !dashboard.available.length;
    if (!observationsFinished) markdown.addButton('[返回 研究室]', { data: '/进化研究室', autoEnter: false });
    const format = Format.create().addMarkdown(markdown);
    if (observationsFinished) format.addButtonGroup(Format.createButtonGroup().addRow().addButton('返回 研究室', '/进化研究室', { type: 'command', autoEnter: true }));
    await message.send({ format });
  } catch (error) { await fail(message, error); }
};

export const evolutionObservationClaimHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireNpcAtCurrentPosition(event.current.UserId, 'evolution_lab'); const result = await claimEvolutionObservation(event.current.UserId); const rewards = Object.entries(result.items).map(([code, quantity]) => `${evolutionItemName(code)}×${quantity}`).join('、');
    await message.send({ format: messageFormat(`提交·${result.name}`, `获得：${rewards}\n今日还可整理 ${result.remaining} 份观察。`) });
  } catch (error) { await fail(message, error); }
};

export const evolutionMutationHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    await requireNpcAtCurrentPosition(event.current.UserId, 'evolution_lab'); const mutationId = Number(route.param('id') ?? 0);
    if (!mutationId) {
      const panel = await evolutionPanel(event.current.UserId); if (!panel) throw new Error('研究室尚未向你开放。');
      const markdown = Format.createMarkdown().addTitle('变异观测档案').addNewline().addNewline().addBlockquote('偏差可以随时暂停；稳定处理会消耗稳定介质×2，并仅保留正向表型；封存不会删除记录。').addNewline().addNewline();
      if (!panel.mutations.length) markdown.addText('尚未形成可管理的变异记录。');
      else panel.mutations.forEach(mutation => markdown.addText(`${bodyPartNames[mutation.body_part as BodyPart]}：`).addButton(mutation.mutation_name, { data: `/进化变异 ${mutation.id}`, autoEnter: false }).addText(`（${mutation.mutation_state === 'stable' ? '稳定' : mutation.mutation_state === 'deviation' ? '偏差' : mutation.mutation_state === 'rare' ? '稀有观测' : mutation.mutation_state === 'paused' ? '已暂停' : '已封存'}）`).addNewline().addNewline());
      await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回 研究室', '/进化研究室', { type: 'command', autoEnter: true })) });
      return;
    }
    const mutation = await mutationDetail(event.current.UserId, mutationId); const state = mutation.mutation_state === 'stable' ? '稳定' : mutation.mutation_state === 'deviation' ? '偏差' : mutation.mutation_state === 'rare' ? '稀有观测' : mutation.mutation_state === 'paused' ? '已暂停' : '已封存';
    const markdown = Format.createMarkdown().addTitle(`变异档案·${mutation.mutation_name}`).addNewline().addNewline().addText(`部位：${bodyPartNames[mutation.body_part]}｜状态：${state}${Number(mutation.tier) > 1 ? '｜II 阶' : ''}`).addNewline().addNewline().addText(`来源：${injectionLabels[mutation.source_injection as InjectionCode] ?? mutation.source_injection}`).addNewline().addNewline().addBlockquote(`当前效果：${effectText(mutation.effect_json)}`).addNewline().addNewline().addText(mutation.description);
    const buttons = Format.createButtonGroup();
    if (mutation.mutation_state === 'deviation') buttons.addRow().addButton('暂停', `/进化变异操作 ${mutation.id} pause`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('稳定', `/进化变异操作 ${mutation.id} stabilize`, { type: 'command', autoEnter: true, style: 'blue' });
    if (mutation.mutation_state === 'paused') buttons.addRow().addButton('恢复', `/进化变异操作 ${mutation.id} resume`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('稳定', `/进化变异操作 ${mutation.id} stabilize`, { type: 'command', autoEnter: true, style: 'blue' });
    if (mutation.mutation_state !== 'archived') buttons.addRow().addButton('封存', `/进化变异操作 ${mutation.id} archive`, { type: 'command', autoEnter: true });
    buttons.addRow().addButton('返回 档案', '/进化变异', { type: 'command', autoEnter: true });
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
  } catch (error) { await fail(message, error); }
};

export const evolutionMutationActionHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    await requireNpcAtCurrentPosition(event.current.UserId, 'evolution_lab'); const mutationId = Number(route.param('id')); const action = String(route.param('action'));
    const result = action === 'pause' ? await setMutationPaused(event.current.UserId, mutationId, true)
      : action === 'resume' ? await setMutationPaused(event.current.UserId, mutationId, false)
        : action === 'stabilize' ? await stabilizeMutation(event.current.UserId, mutationId)
          : action === 'archive' ? await archiveMutation(event.current.UserId, mutationId) : (() => { throw new Error('未知的变异操作。'); })();
    await withTransaction(connection => recalculateCharacterStats(connection, result.characterId));
    const text = action === 'pause' ? `【${result.name}】已暂停，不再影响当前面板与战斗结算。` : action === 'resume' ? `【${result.name}】已恢复观察。` : action === 'stabilize' ? `【${result.name}】已稳定处理，适应压力与稳定度已同步更新。` : `【${result.name}】已封存，历史记录仍会保留。`;
    await message.send({ format: messageFormat('变异处理完成', text) });
  } catch (error) { await fail(message, error); }
};
