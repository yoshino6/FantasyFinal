import { Format, useEvent, useMessage, useRoute } from 'alemonjs';
import { messageFormat } from '../game/message';
import { requireAdministrator } from '../game/permission.service';
import { setWorldContentEnabled, setWorldContentWeight, worldAdminSnapshot, worldContentPreview, worldLedger } from '../game/world-dynamics.service';

const fail = async (message: any, error: unknown, title: string) => await message.send({ format: messageFormat(title, error instanceof Error ? error.message : '操作失败。') });

const statusNames: Record<string, string> = {
  locked: '尚未满足条件', ready: '已满足出现条件', spawned: '已出现', cooldown: '恢复中',
  active: '活跃', dormant: '沉寂', stirring: '出现异动', deployed: '正在响应现场', returned: '已返回', stationed: '驻守中',
  patrolling: '巡逻中', inspecting: '巡查中', repairing: '修缮中', surveying: '勘察中', guiding: '引路中',
  gathering: '采集中', crossing: '通行中', recording: '记录中', hosting: '接待中', cataloguing: '编录中',
  maintaining: '维护中', sampling: '采样中', sealing: '封存中', tending: '照看中', watching: '观望中',
  signalling: '传讯中', supplying: '补给中', guarding: '守卫中', delivering: '投递中', herding: '放牧中', cultivating: '培育中', calibrating: '校准中', sheltering: '避险中'
};

const eventNames: Record<string, string> = {
  'weather.transition': '天气变换', 'site.commission': '站点委托', 'site.action': '站点行动', 'exploration.exposure': '探索记录',
  'scene.opened': '公共现场开启', 'scene.resolved': '公共现场结算', 'scene.joined': '加入公共现场', 'scene.contribution': '公共现场协作',
  'encounter.opened': '个人奇遇开启', 'encounter.resolved': '个人奇遇结算', 'worldline.updated': '世界线推进',
  'npc.presence': '巡游实体调度', 'worldline.boss_activation': '首领门状态更新', 'content.control': '内容配置更新'
};

const outcomeNames: Record<string, string> = {
  initial: '初始设定', scheduled: '定时变化', anomaly: '异象变化', completed: '已完成', claimed: '已领取', accepted: '已接受',
  active: '进行中', resolved: '已结算', continued: '继续推进', recorded: '已记录', deployed: '已调度', returned: '已返回',
  stationed: '驻守中', boss_ready: '首领可出现', site_updated: '站点已更新', spawned: '已出现', cooldown: '恢复中', failed: '未能完成',
  observer: '旁观加入', witness: '见证加入', shared_reward: '共享奖励', updated: '已更新'
};

const section = (markdown: ReturnType<typeof Format.createMarkdown>, title: string, lines: string[], empty: string) => {
  markdown.addText(title).addNewline().addBlockquote(lines.length ? lines.join('\n') : empty).addNewline().addNewline();
};

const displayStatus = (value: unknown, fallback = '状态未记录') => statusNames[String(value ?? '')] ?? fallback;

export const worldManagementHandler = async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  try {
    await requireAdministrator(event.current.UserId);
    const snapshot = await worldAdminSnapshot();
    const worldlineNames = new Map(snapshot.worldlines.map(row => [row.code, String(row.state.name ?? '未命名世界线')]));
    const markdown = Format.createMarkdown().addTitle('世界生态管理').addNewline().addNewline().addBlockquote(`内容模板 ${snapshot.templateCount} 条｜今日记录 ${snapshot.ledgerToday} 条｜进行中的个人奇遇 ${snapshot.activeEncounters} 个｜进行中的公共现场 ${snapshot.activeScenes} 个`).addNewline().addNewline();

    section(markdown, '区域天气', snapshot.weather.map(row => `${row.regionName}：${row.name}｜强度 ${row.intensity} 级`), '尚无区域天气记录。');
    section(markdown, '世界线', snapshot.worldlines.map(row => `${String(row.state.name ?? '未命名世界线')}：当前阶段 ${row.stage}`), '尚无世界线记录。');
    section(markdown, '首领门', snapshot.bossGates.map(row => `${row.bossName}：${worldlineNames.get(row.worldline) ?? '未命名世界线'}｜${displayStatus(row.state)}｜需推进至阶段 ${row.stageRequired}`), '暂无首领门记录。');
    section(markdown, '巡游实体', snapshot.npcs.map(row => `${row.name}｜${row.regionName}｜${String(row.state.currentPoint ?? displayStatus(row.status))}`), '暂无巡游实体。');
    section(markdown, '特色建筑与站点', snapshot.sites.map(row => `${row.name}｜${row.regionName}｜${displayStatus(row.state.state)}`), '暂无特色建筑或站点。');

    await message.send({
      format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow()
        .addButton('事件账本', '/世界事件账本 20', { type: 'command', autoEnter: true, style: 'blue' })
        .addButton('内容预览', '/世界内容预览', { type: 'command', autoEnter: true })
        .addButton('刷新面板', '/世界生态管理', { type: 'command', autoEnter: true }))
    });
  } catch (error) {
    await fail(message, error, '世界生态管理失败');
  }
};

export const worldLedgerHandler = async () => {
  const [event] = useEvent();
  const [route] = useRoute();
  const [message] = useMessage();
  try {
    await requireAdministrator(event.current.UserId);
    const rows = await worldLedger(Number(route.param('limit')) || 20);
    const markdown = Format.createMarkdown().addTitle('世界事件账本').addNewline().addNewline();
    if (!rows.length) markdown.addBlockquote('暂无事件记录。');
    else for (const row of rows) markdown.addBlockquote(`第 ${row.id} 条｜${row.createdAt.toLocaleString('zh-CN', { hour12: false })}\n${eventNames[row.eventType] ?? '世界事件'}｜${outcomeNames[row.outcome] ?? '状态已更新'}｜${row.actorName ?? '系统'}｜${row.regionName ?? '全局'}`).addNewline();
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('世界生态', '/世界生态管理', { type: 'command', autoEnter: true, style: 'blue' })) });
  } catch (error) {
    await fail(message, error, '事件账本查询失败');
  }
};

export const worldContentPreviewHandler = async () => {
  const [event] = useEvent();
  const [route] = useRoute();
  const [message] = useMessage();
  try {
    await requireAdministrator(event.current.UserId);
    const code = String(route.param('code') ?? '').trim() || undefined;
    const rows = await worldContentPreview(code);
    const markdown = Format.createMarkdown().addTitle('世界内容预览').addNewline().addNewline();
    if (!rows.length) markdown.addBlockquote('暂无内容模板。');
    else for (const row of rows) markdown.addText(`【${row.title}】`).addNewline().addBlockquote(`${row.enabled ? '已启用' : '已停用'}｜触发权重 ${row.weight}\n适用区域 ${row.regions.length} 处｜适用天气 ${row.weather.length} 种\n${row.valid ? '配置校验通过' : '配置存在需要处理的问题'}`).addNewline().addNewline();
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('世界生态', '/世界生态管理', { type: 'command', autoEnter: true, style: 'blue' })) });
  } catch (error) {
    await fail(message, error, '内容预览失败');
  }
};

export const worldContentEnabledHandler = async () => {
  const [event] = useEvent();
  const [route] = useRoute();
  const [message] = useMessage();
  try {
    await requireAdministrator(event.current.UserId);
    const enabled = String(route.param('state')) === '启用';
    await setWorldContentEnabled(String(route.param('code')), enabled);
    await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('世界内容控制').addNewline().addNewline().addBlockquote(`内容已${enabled ? '启用' : '停用'}；已经生成的奇遇仍保留创建时的配置。`)) });
  } catch (error) {
    await fail(message, error, '内容控制失败');
  }
};

export const worldContentWeightHandler = async () => {
  const [event] = useEvent();
  const [route] = useRoute();
  const [message] = useMessage();
  try {
    await requireAdministrator(event.current.UserId);
    const weight = Number(route.param('weight'));
    await setWorldContentWeight(String(route.param('code')), weight);
    await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('世界内容权重').addNewline().addNewline().addBlockquote(`后续触发权重已设为 ${weight}；已经生成的实例不受影响。`)) });
  } catch (error) {
    await fail(message, error, '权重调整失败');
  }
};
