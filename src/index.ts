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
appGroup.use('地图', () => import('./response/map'))
appGroup.use('面板', () => import('./response/panel'))
appGroup.use('战斗信息', () => import('./response/battle-info'))
appGroup.use('探索', () => import('./response/explore'))
appGroup.use('背包', () => import('./response/inventory'))
appGroup.use('装备', () => import('./response/equipment'))
appGroup.use('技能列表', () => import('./response/skill-list'))
appGroup.use('队伍', () => import('./response/party-info'))
appGroup.use({ path: '移动', schema: { usage: '/移动 <上|下|左|右>', args: [{ name: 'direction', rules: [{ required: true, type: 'enum', enum: ['上', '下', '左', '右'] }] }] } }, () => import('./response/move'))
appGroup.use({ path: '前往', schema: { usage: '/前往 <横坐标> <纵坐标>', args: [{ name: 'x', rules: [{ required: true, type: 'number' }] }, { name: 'y', rules: [{ required: true, type: 'number' }] }] } }, () => import('./response/go-to'))
appGroup.use({ path: '目标', schema: { usage: '/目标 <编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/target'))
appGroup.use({ path: '偷袭', schema: { usage: '/偷袭 <编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/encounter').then(module => ({ default: module.encounterHandler('sneak', '偷袭') })))
appGroup.use({ path: '躲避', schema: { usage: '/躲避 <编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/encounter').then(module => ({ default: module.encounterHandler('avoid', '躲避') })))
appGroup.use({ path: '交涉', schema: { usage: '/交涉 <编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/encounter').then(module => ({ default: module.encounterHandler('persuade', '交涉') })))
appGroup.use('攻击', () => import('./response/combat').then(module => ({ default: module.attack })))
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
