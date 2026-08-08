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
appGroup.use('注册', () => import('./response/game-register'))
appGroup.use('注册 继续', () => import('./response/game-continue'))
appGroup.use({
  path: '加点',
  schema: {
    usage: '/加点 <体质|精神|力量|智力|敏捷|感知> <点数>',
    args: [
      { name: 'attribute', rules: [{ required: true, type: 'enum', enum: ['体质', '精神', '力量', '智力', '敏捷', '感知'] }] },
      { name: 'points', rules: [{ required: true, type: 'number', min: 1, max: 20 }] }
    ]
  }
}, () => import('./response/add-points'))
appGroup.use('重置加点', () => import('./response/reset-points'))
appGroup.use('确认属性', () => import('./response/confirm-attributes'))
appGroup.use('角色', () => import('./response/character'))
appGroup.use('地图', () => import('./response/map'))
appGroup.use('面板', () => import('./response/panel'))
appGroup.use('战斗信息', () => import('./response/battle-info'))
appGroup.use('探索', () => import('./response/explore'))
appGroup.use('背包', () => import('./response/inventory'))
appGroup.use({ path: '移动', schema: { usage: '/移动 <上|下|左|右>', args: [{ name: 'direction', rules: [{ required: true, type: 'enum', enum: ['上', '下', '左', '右'] }] }] } }, () => import('./response/move'))
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
