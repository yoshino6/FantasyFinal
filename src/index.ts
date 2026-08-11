import { Router, logger, defineChildren } from 'alemonjs';
import expose from './expose';
import koaRouter from 'koa-router';
import { getPool } from './database/pool';
import { spawnMonsters } from './game/adventure.service';
import { setCron } from 'alemonjs';

const r = new koaRouter({
  prefix: '/api'
});

// 简单的 HTTP 路由示例 /app/api/ping
r.get('/ping', (ctx) => {
  ctx.body = 'pong';
});

const router = Router.create({
  events: ['message.create', 'private.message.create', 'interaction.create', 'private.interaction.create']
});

const appGroup = router.group({ // 精准规则匹配，复杂度 O1，稳定 且 几乎无损耗
  routeText: {
    prefixes: ['/', '#', '＃', '!', '！'],   // 允许使用的前缀
    stripPrefix: true, // 匹配时去掉前缀 
    allowBare: true  // 允许不使用前缀 
  }
})

appGroup.use("hello", () => import('./response/hello'))
appGroup.use("help", () => import('./response/help'))
appGroup.use('菜单', () => import('./response/help'))
appGroup.use('注册', () => import('./response/game-register'))
appGroup.use('注册 继续', () => import('./response/game-continue'))
appGroup.use('询问 这里是哪里', () => import('./response/ask-where'))
appGroup.use({ path: '选择去向', schema: { usage: '/选择去向 <天堂|异世界>', args: [{ name: 'destination', rules: [{ required: true, type: 'enum', enum: ['天堂', '异世界'] }] }] } }, () => import('./response/destination-select'))
appGroup.use({ path: '恩赐列表', schema: { usage: '/恩赐列表 <神器|能力>', args: [{ name: 'category', rules: [{ required: true, type: 'enum', enum: ['神器', '能力'] }] }] } }, () => import('./response/gift-catalog'))
appGroup.use({ path: '选择恩赐', schema: { usage: '/选择恩赐 <代号>', args: [{ name: 'gift', rules: [{ required: true, type: 'enum', enum: ['holy_sword_shirulu', 'demon_sword_aphia', 'growth_blessing', 'mana_affinity', 'lucky_favor'] }] }] } }, () => import('./response/gift-select'))
appGroup.use('冒险者登记', () => import('./response/adventurer-register'))
appGroup.use('角色', () => import('./response/character'))
appGroup.use({ path: '改名', schema: { usage: '/改名 <新昵称>', args: [{ name: 'name', rules: [{ required: true }] }] } }, () => import('./response/change-name'))
appGroup.use({ path: '改性', schema: { usage: '/改性 <男|女>', args: [{ name: 'gender', rules: [{ required: true, type: 'enum', enum: ['男', '女'] }] }] } }, () => import('./response/change-gender'))
appGroup.use('地图', () => import('./response/map'))
appGroup.use('面板', () => import('./response/panel'))
appGroup.use('战斗信息', () => import('./response/battle-info'))
appGroup.use('探索', () => import('./response/explore'))
appGroup.use({ path: '背包', schema: { usage: '/背包 [装备|道具|材料]', args: [{ name: 'category', rules: [{ type: 'enum', enum: ['装备', '道具', '材料'] }] }] } }, () => import('./response/inventory'))
appGroup.use({ path: '物品图鉴', schema: { usage: '/物品图鉴 <物品ID>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/item-codex'))
appGroup.use({ path: '装备详情', schema: { usage: '/装备详情 <装备编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/equipment-detail'))
appGroup.use({ path: '卸下装备', schema: { usage: '/卸下装备 <部位>', args: [{ name: 'slot', rules: [{ required: true, type: 'enum', enum: ['weapon', 'offhand', 'shoulder', 'upper', 'waist', 'lower', 'feet', 'necklace', 'bracelet', 'ring'] }] }] } }, () => import('./response/equipment').then(module => ({ default: module.unequipHandler })))
appGroup.use({ path: '选择装备', schema: { usage: '/选择装备 <部位>', args: [{ name: 'slot', rules: [{ required: true, type: 'enum', enum: ['weapon', 'offhand', 'shoulder', 'upper', 'waist', 'lower', 'feet', 'necklace', 'bracelet', 'ring'] }] }] } }, () => import('./response/equipment').then(module => ({ default: module.chooseEquipmentHandler })))
appGroup.use({ path: '穿戴装备', schema: { usage: '/穿戴装备 <部位> <装备编号>', args: [{ name: 'slot', rules: [{ required: true, type: 'enum', enum: ['weapon', 'offhand', 'shoulder', 'upper', 'waist', 'lower', 'feet', 'necklace', 'bracelet', 'ring'] }] }, { name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/equipment').then(module => ({ default: module.equipHandler })))
appGroup.use('装备', () => import('./response/equipment'))
appGroup.use({ path: '技能列表', schema: { usage: '/技能列表 [已学习|未学习]', args: [{ name: 'view', rules: [{ type: 'enum', enum: ['已学习', '未学习'] }] }] } }, () => import('./response/skill-list'))
appGroup.use({ path: '技能详情', schema: { usage: '/技能详情 <技能编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/skill-list').then(module => ({ default: module.skillDetailHandler })))
appGroup.use({ path: '学习技能', schema: { usage: '/学习技能 <技能编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/skill-list').then(module => ({ default: module.learnSkillHandler })))
appGroup.use({ path: '技能快捷', schema: { usage: '/技能快捷 <技能编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/skill-list').then(module => ({ default: module.skillShortcutHandler })))
appGroup.use({ path: '升级技能', schema: { usage: '/升级技能 <技能编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/skill-list').then(module => ({ default: module.upgradeSkillHandler })))
appGroup.use({ path: '升级专精', schema: { usage: '/升级专精 <技能编号> <过充|瞬息|节能|强效>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }, { name: 'specialization', rules: [{ required: true, type: 'enum', enum: ['过充', '瞬息', '节能', '强效'] }] }] } }, () => import('./response/skill-list').then(module => ({ default: module.upgradeSpecializationHandler })))
appGroup.use({ path: '升级鉴识', schema: { usage: '/升级鉴识 <慧眼|识珠>', args: [{ name: 'direction', rules: [{ required: true, type: 'enum', enum: ['慧眼', '识珠'] }] }] } }, () => import('./response/skill-list').then(module => ({ default: module.upgradeAppraisalHandler })))
appGroup.use('队伍', () => import('./response/party-info'))
appGroup.use({ path: '移动', schema: { usage: '/移动 <上|下|左|右>', args: [{ name: 'direction', rules: [{ required: true, type: 'enum', enum: ['上', '下', '左', '右'] }] }] } }, () => import('./response/move'))
appGroup.use('休息', () => import('./response/panel').then(module => ({ default: module.restHandler })))
appGroup.use('行动', () => import('./response/panel').then(module => ({ default: module.resumeActionHandler })))
appGroup.use({ path: '前往', schema: { usage: '/前往 <横坐标> <纵坐标>', args: [{ name: 'x', rules: [{ required: true, type: 'number' }] }, { name: 'y', rules: [{ required: true, type: 'number' }] }] } }, () => import('./response/go-to'))
appGroup.use({ path: '目标', schema: { usage: '/目标 <编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/target'))
appGroup.use({ path: '偷袭', schema: { usage: '/偷袭 <编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/adventure').then(module => ({ default: module.ambushHandler })))
appGroup.use({ path: '怪物详情', schema: { usage: '/怪物详情 <编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/monster-detail'))
appGroup.use({ path: '切换目标', schema: { usage: '/切换目标 <编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/adventure').then(module => ({ default: module.switchTargetHandler })))
appGroup.use({ path: '躲避', schema: { usage: '/躲避 <编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/encounter').then(module => ({ default: module.encounterHandler('avoid', '躲避') })))
appGroup.use({ path: '交涉', schema: { usage: '/交涉 <编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/encounter').then(module => ({ default: module.encounterHandler('persuade', '交涉') })))
appGroup.use('攻击', () => import('./response/combat').then(module => ({ default: module.attack })))
appGroup.use('鉴识', () => import('./response/combat-appraisal'))
appGroup.use({ path: '技能', schema: { usage: '/技能 <1-4>', args: [{ name: 'slot', rules: [{ required: true, type: 'number', min: 1, max: 4 }] }] } }, () => import('./response/combat').then(module => ({ default: module.skill })))
appGroup.use({ path: '道具', schema: { usage: '/道具 <1-4>', args: [{ name: 'slot', rules: [{ required: true, type: 'number', min: 1, max: 4 }] }] } }, () => import('./response/combat').then(module => ({ default: module.item })))
appGroup.use('逃跑', () => import('./response/combat').then(module => ({ default: module.escape })))
appGroup.use('组队 创建', () => import('./response/party-create'))
appGroup.use({ path: '组队 加入', schema: { usage: '/组队 加入 <队长QQ用户ID>', args: [{ name: 'leader', rules: [{ required: true }] }] } }, () => import('./response/party-join'))

export default defineChildren({
  // 注册内容
  register() {
    return {
      responseRouter: router.define,
      expose: expose,
      koaRouter: r
    };
  },
  // 当准备好时
  onReady() {
    logger.info('本地测试启动');
    void getPool()
      .then(async () => { await spawnMonsters(); logger.info('游戏数据库、初始地图与怪物群已就绪'); })
      .catch(error => logger.error({ err: error }, '游戏数据库初始化失败'));
    setCron('0 * * * *', () => void spawnMonsters().catch(error => logger.error({ err: error }, '整点刷怪失败')));
  }
});
