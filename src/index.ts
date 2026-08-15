import { Router, logger, defineChildren } from 'alemonjs';
import expose from './expose';
import koaRouter from 'koa-router';
import { getPool } from './database/pool';
import { spawnMonsters } from './game/adventure.service';
import { setCron } from 'alemonjs';
import { installGroupReplyMention } from './middleware/group-reply-mention';

installGroupReplyMention();

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
appGroup.use('邮件', () => import('./response/mail'))
appGroup.use({ path: '邮件页', schema: { usage: '/邮件页 <页码> [关键词]', args: [{ name: 'page', rules: [{ required: true, type: 'number', min: 1 }] }, { name: 'keyword' }] } }, () => import('./response/mail').then(module => ({ default: module.mailPageHandler })))
appGroup.use({ path: '邮件搜索', schema: { usage: '/邮件搜索 <关键词>', args: [{ name: 'keyword', rules: [{ required: true }] }] } }, () => import('./response/mail').then(module => ({ default: module.mailSearchHandler })))
appGroup.use({ path: '查看邮件', schema: { usage: '/查看邮件 <邮件编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/mail').then(module => ({ default: module.mailDetailHandler })))
appGroup.use({ path: '领取邮件', schema: { usage: '/领取邮件 <邮件编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/mail').then(module => ({ default: module.mailClaimHandler })))
appGroup.use({ path: '删除邮件', schema: { usage: '/删除邮件 <邮件编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/mail').then(module => ({ default: module.mailDeleteHandler })))
appGroup.use('管理', () => import('./response/admin'))
appGroup.use({ path: '管理员登录', schema: { usage: '/管理员登录 <密码>', args: [{ name: 'password', rules: [{ required: true }] }] } }, () => import('./response/admin').then(module => ({ default: module.ownerLoginHandler })))
appGroup.use('给予权限', () => import('./response/admin').then(module => ({ default: module.grantAdministratorHandler })))
appGroup.use('撤销权限', () => import('./response/admin').then(module => ({ default: module.revokeAdministratorHandler })))
appGroup.use('查看权限', () => import('./response/admin').then(module => ({ default: module.permissionListHandler })))
appGroup.use({ path: '管理员命令 邮件发放', schema: { usage: '/管理员命令 邮件发放 <@玩家|全服>', args: [{ name: 'target' }] } }, () => import('./response/admin').then(module => ({ default: module.adminMailTargetHandler })))
appGroup.use({ path: '管理邮件发放', schema: { usage: '/管理邮件发放 <玩家QQ> <物品代码/图鉴ID/名称/物品ID> <数量> [标题]', args: [{ name: 'target', rules: [{ required: true }] }, { name: 'item', rules: [{ required: true }] }, { name: 'quantity', rules: [{ required: true, type: 'number', min: 1 }] }, { name: 'title' }] } }, () => import('./response/admin').then(module => ({ default: module.adminMailHandler })))
appGroup.use({ path: '管理全服邮件发放', schema: { usage: '/管理全服邮件发放 <物品代码/图鉴ID/名称/物品ID> <数量> [标题]', args: [{ name: 'item', rules: [{ required: true }] }, { name: 'quantity', rules: [{ required: true, type: 'number', min: 1 }] }, { name: 'title' }] } }, () => import('./response/admin').then(module => ({ default: module.adminAllMailHandler })))
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
appGroup.use({ path: '升级专精', schema: { usage: '/升级专精 <技能编号> <过充|瞬息|节能|强效|娴熟|随心>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }, { name: 'specialization', rules: [{ required: true, type: 'enum', enum: ['过充', '瞬息', '节能', '强效', '娴熟', '随心'] }] }] } }, () => import('./response/skill-list').then(module => ({ default: module.upgradeSpecializationHandler })))
appGroup.use({ path: '升级鉴识', schema: { usage: '/升级鉴识 <慧眼|识珠>', args: [{ name: 'direction', rules: [{ required: true, type: 'enum', enum: ['慧眼', '识珠'] }] }] } }, () => import('./response/skill-list').then(module => ({ default: module.upgradeAppraisalHandler })))
appGroup.use('队伍', () => import('./response/party-info'))
appGroup.use({ path: '移动', schema: { usage: '/移动 <上|下|左|右>', args: [{ name: 'direction', rules: [{ required: true, type: 'enum', enum: ['上', '下', '左', '右'] }] }] } }, () => import('./response/move'))
appGroup.use('休息', () => import('./response/panel').then(module => ({ default: module.restHandler })))
appGroup.use('行动', () => import('./response/panel').then(module => ({ default: module.resumeActionHandler })))
appGroup.use({ path: '前往', schema: { usage: '/前往 <横坐标> <纵坐标>', args: [{ name: 'x', rules: [{ required: true, type: 'number' }] }, { name: 'y', rules: [{ required: true, type: 'number' }] }] } }, () => import('./response/go-to'))
appGroup.use('寻怪', () => import('./response/adventure').then(module => ({ default: module.huntHandler })))
appGroup.use('取消移动', () => import('./response/adventure').then(module => ({ default: module.cancelTravelHandler })))
appGroup.use('取消寻怪', () => import('./response/adventure').then(module => ({ default: module.cancelTravelHandler })))
appGroup.use('刷新行动', () => import('./response/adventure').then(module => ({ default: module.refreshTravelHandler })))
appGroup.use({ path: '目标', schema: { usage: '/目标 <编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/target'))
appGroup.use({ path: '偷袭', schema: { usage: '/偷袭 <编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/adventure').then(module => ({ default: module.ambushHandler })))
appGroup.use({ path: '伏击', schema: { usage: '/伏击 <编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/adventure').then(module => ({ default: module.queueAmbushHandler })))
appGroup.use('离开战斗', () => import('./response/adventure').then(module => ({ default: module.leaveOccupiedBattleHandler })))
appGroup.use({ path: '怪物详情', schema: { usage: '/怪物详情 <编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/monster-detail'))
appGroup.use({ path: '切换目标', schema: { usage: '/切换目标 <编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/adventure').then(module => ({ default: module.switchTargetHandler })))
appGroup.use({ path: '躲避', schema: { usage: '/躲避 <编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/encounter').then(module => ({ default: module.encounterHandler('avoid', '躲避') })))
appGroup.use({ path: '交涉', schema: { usage: '/交涉 <编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/encounter').then(module => ({ default: module.encounterHandler('persuade', '交涉') })))
appGroup.use({ path: '初章 包容之镇', schema: { usage: '/初章 包容之镇 <选项>', args: [{ name: 'action', rules: [{ required: true, type: 'enum', enum: ['循声而去', '上前打招呼', '我也不清楚，睁开眼时就在这儿了', '加入', '婉拒并询问城镇位置'] }] }] } }, () => import('./response/adventure').then(module => ({ default: module.forestGuideHandler })))
appGroup.use('继续剧情', () => import('./response/adventure').then(module => ({ default: module.continueStoryHandler })))
appGroup.use({ path: '建筑进入', schema: { usage: '/建筑进入 <编号>', args: [{ name: 'code', rules: [{ required: true }] }] } }, () => import('./response/adventure').then(module => ({ default: module.buildingHandler('enter') })))
appGroup.use({ path: '建筑忽略', schema: { usage: '/建筑忽略 <编号>', args: [{ name: 'code', rules: [{ required: true }] }] } }, () => import('./response/adventure').then(module => ({ default: module.buildingHandler('ignore') })))
appGroup.use({ path: '建筑离开', schema: { usage: '/建筑离开 <编号>', args: [{ name: 'code', rules: [{ required: true }] }] } }, () => import('./response/adventure').then(module => ({ default: module.buildingHandler('leave') })))
appGroup.use({ path: '建筑区域', schema: { usage: '/建筑区域 <编号> <区域>', args: [{ name: 'code', rules: [{ required: true }] }, { name: 'area', rules: [{ required: true }] }] } }, () => import('./response/adventure').then(module => ({ default: module.buildingHandler('area') })))
appGroup.use('公会注册', () => import('./response/adventure').then(module => ({ default: module.guildRegistrationHandler })))
appGroup.use('悬赏板', () => import('./response/bounty').then(module => ({ default: module.bountyBoardHandler })))
appGroup.use('任务', () => import('./response/bounty').then(module => ({ default: module.taskHandler })))
appGroup.use('任务栏', () => import('./response/bounty').then(module => ({ default: module.taskHandler })))
appGroup.use('工会商店', () => import('./response/guild-shop').then(module => ({ default: module.guildShopHandler })))
appGroup.use('商店购买', () => import('./response/guild-shop').then(module => ({ default: module.shopBuyListHandler })))
appGroup.use({ path: '商店购买页', schema: { usage: '/商店购买页 <页码> [关键词]', args: [{ name: 'page', rules: [{ required: true, type: 'number', min: 1 }] }, { name: 'keyword' }] } }, () => import('./response/guild-shop').then(module => ({ default: module.shopBuyListHandler })))
appGroup.use({ path: '商店搜索', schema: { usage: '/商店搜索 <物品名关键词>', args: [{ name: 'keyword', rules: [{ required: true }] }] } }, () => import('./response/guild-shop').then(module => ({ default: module.shopSearchHandler })))
appGroup.use({ path: '购买商品', schema: { usage: '/购买商品 <商品编号> [数量]', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }, { name: 'quantity', rules: [{ type: 'number', min: 1 }] }] } }, () => import('./response/guild-shop').then(module => ({ default: module.shopPurchaseHandler })))
appGroup.use('商店出售', () => import('./response/guild-shop').then(module => ({ default: module.shopSellListHandler })))
appGroup.use({ path: '商店出售页', schema: { usage: '/商店出售页 <页码> [关键词]', args: [{ name: 'page', rules: [{ required: true, type: 'number', min: 1 }] }, { name: 'keyword' }] } }, () => import('./response/guild-shop').then(module => ({ default: module.shopSellListHandler })))
appGroup.use({ path: '商店出售搜索', schema: { usage: '/商店出售搜索 <物品名关键词>', args: [{ name: 'keyword', rules: [{ required: true }] }] } }, () => import('./response/guild-shop').then(module => ({ default: module.shopSellSearchHandler })))
appGroup.use({ path: '出售商品', schema: { usage: '/出售商品 <物品编号> [数量]', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }, { name: 'quantity', rules: [{ type: 'number', min: 1 }] }] } }, () => import('./response/guild-shop').then(module => ({ default: module.shopSellHandler })))
appGroup.use('商店闲聊', () => import('./response/guild-shop').then(module => ({ default: module.shopChatHandler })))
appGroup.use({ path: '接取悬赏', schema: { usage: '/接取悬赏 <编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/bounty').then(module => ({ default: module.acceptBountyHandler })))
appGroup.use({ path: '领取悬赏', schema: { usage: '/领取悬赏 <编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/bounty').then(module => ({ default: module.claimBountyHandler })))
appGroup.use('职业选择', () => import('./response/adventure').then(module => ({ default: module.professionHandler('select') })))
appGroup.use({ path: '职业查看', schema: { usage: '/职业查看 <职业>', args: [{ name: 'name', rules: [{ required: true, type: 'enum', enum: ['战士', '法师', '盗贼', '牧师'] }] }] } }, () => import('./response/adventure').then(module => ({ default: module.professionHandler('detail') })))
appGroup.use({ path: '选择职业', schema: { usage: '/选择职业 <职业>', args: [{ name: 'name', rules: [{ required: true, type: 'enum', enum: ['战士', '法师', '盗贼', '牧师'] }] }] } }, () => import('./response/adventure').then(module => ({ default: module.professionHandler('choose') })))
appGroup.use('前台闲聊', () => import('./response/adventure').then(module => ({ default: module.guildChatHandler })))
appGroup.use('卡片', () => import('./response/adventure').then(module => ({ default: module.adventurerCardHandler })))
appGroup.use('梨子喵', () => import('./response/adventure').then(module => ({ default: module.pearGuideHandler })))
appGroup.use({ path: 'NPC对话', schema: { usage: '/NPC对话 <编号>', args: [{ name: 'code', rules: [{ required: true }] }] } }, () => import('./response/adventure').then(module => ({ default: module.npcEncounterHandler('talk') })))
appGroup.use({ path: 'NPC忽略', schema: { usage: '/NPC忽略 <编号>', args: [{ name: 'code', rules: [{ required: true }] }] } }, () => import('./response/adventure').then(module => ({ default: module.npcEncounterHandler('ignore') })))
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
