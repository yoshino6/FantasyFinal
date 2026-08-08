import { Router, logger, defineChildren } from 'alemonjs';
import expose from './expose';
import koaRouter from 'koa-router';

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
  }
});
