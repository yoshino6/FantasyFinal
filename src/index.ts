import { Router, logger, defineChildren } from 'alemonjs';
import expose from './expose';
import koaRouter from 'koa-router';
import { getPool } from './database/pool';
import { spawnMonsters } from './game/adventure.service';
import { refreshBounties } from './game/bounty.service';
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
appGroup.use('一键领取邮件', () => import('./response/mail').then(module => ({ default: module.mailClaimAllHandler })))
appGroup.use({ path: '删除邮件', schema: { usage: '/删除邮件 <邮件编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/mail').then(module => ({ default: module.mailDeleteHandler })))
appGroup.use('管理', () => import('./response/admin'))
appGroup.use('BOSS管理', () => import('./response/admin').then(module => ({ default: module.bossManagementHandler })))
appGroup.use({ path: 'BOSS刷新', schema: { usage: '/BOSS刷新 <Boss代号>', args: [{ name: 'code', rules: [{ required: true }] }] } }, () => import('./response/admin').then(module => ({ default: module.bossSpawnHandler })))
appGroup.use({ path: 'BOSS消灭', schema: { usage: '/BOSS消灭 <Boss代号>', args: [{ name: 'code', rules: [{ required: true }] }] } }, () => import('./response/admin').then(module => ({ default: module.bossDefeatHandler })))
appGroup.use({ path: 'BOSS上赏', schema: { usage: '/BOSS上赏 <Boss代号>', args: [{ name: 'code', rules: [{ required: true }] }] } }, () => import('./response/admin').then(module => ({ default: module.bossBountyHandler })))
appGroup.use({ path: '管理员登录', schema: { usage: '/管理员登录 <密码>', args: [{ name: 'password', rules: [{ required: true }] }] } }, () => import('./response/admin').then(module => ({ default: module.ownerLoginHandler })))
appGroup.use('给予权限', () => import('./response/admin').then(module => ({ default: module.grantAdministratorHandler })))
appGroup.use('撤销权限', () => import('./response/admin').then(module => ({ default: module.revokeAdministratorHandler })))
appGroup.use('查看权限', () => import('./response/admin').then(module => ({ default: module.permissionListHandler })))
appGroup.use({ path: '管理员命令 邮件发放', schema: { usage: '/管理员命令 邮件发放 <个人|全服>', args: [{ name: 'scope', rules: [{ required: true, type: 'enum', enum: ['个人', '全服'] }] }] } }, () => import('./response/admin').then(module => ({ default: module.adminMailTargetHandler })))
appGroup.use('管理员邮件 切换全服', () => import('./response/admin').then(module => ({ default: module.switchMailScopeHandler })))
appGroup.use('管理员邮件 添加收件人', () => import('./response/admin').then(module => ({ default: module.addRecipientHandler })))
appGroup.use({ path: '管理员邮件 添加昵称', schema: { usage: '/管理员邮件 添加昵称 <昵称>', args: [{ name: 'name', rules: [{ required: true, type: 'rest' }] }] } }, () => import('./response/admin').then(module => ({ default: module.addRecipientNameHandler })))
appGroup.use({ path: '管理员邮件 删除收件人', schema: { usage: '/管理员邮件 删除收件人 <QID>', args: [{ name: 'qq', rules: [{ required: true }] }] } }, () => import('./response/admin').then(module => ({ default: module.removeRecipientHandler })))
appGroup.use({ path: '管理员邮件 编辑内容', schema: { usage: '/管理员邮件 编辑内容 <内容>', args: [{ name: 'content', rules: [{ required: true, type: 'rest' }] }] } }, () => import('./response/admin').then(module => ({ default: module.updateContentHandler })))
appGroup.use('管理员邮件 清空内容', () => import('./response/admin').then(module => ({ default: module.clearContentHandler })))
appGroup.use({ path: '管理员邮件 编辑标题', schema: { usage: '/管理员邮件 编辑标题 <标题>', args: [{ name: 'title', rules: [{ required: true, type: 'rest' }] }] } }, () => import('./response/admin').then(module => ({ default: module.updateTitleHandler })))
appGroup.use('管理员邮件 清空标题', () => import('./response/admin').then(module => ({ default: module.clearTitleHandler })))
appGroup.use({ path: '管理员邮件 添加附件ID', schema: { usage: '/管理员邮件 添加附件ID <物品ID> [数量]', args: [{ name: 'item', rules: [{ required: true }] }, { name: 'quantity', rules: [{ type: 'number', min: 1 }] }] } }, () => import('./response/admin').then(module => ({ default: module.addAttachmentHandler })))
appGroup.use({ path: '管理员邮件 添加附件名称', schema: { usage: '/管理员邮件 添加附件名称 <名称> [数量]', args: [{ name: 'item', rules: [{ required: true }] }, { name: 'quantity', rules: [{ type: 'number', min: 1 }] }] } }, () => import('./response/admin').then(module => ({ default: module.addAttachmentHandler })))
appGroup.use({ path: '管理员邮件 修改附件数量', schema: { usage: '/管理员邮件 修改附件数量 <物品ID> <数量>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }, { name: 'quantity', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/admin').then(module => ({ default: module.updateAttachmentQuantityHandler })))
appGroup.use({ path: '管理员邮件 删除附件', schema: { usage: '/管理员邮件 删除附件 <物品ID>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/admin').then(module => ({ default: module.removeAttachmentHandler })))
appGroup.use('管理员邮件 继续编辑', () => import('./response/admin').then(module => ({ default: module.continueEditHandler })))
appGroup.use('管理员邮件 暂存编辑', () => import('./response/admin').then(module => ({ default: module.stashEditHandler })))
appGroup.use('管理员邮件 退出编辑', () => import('./response/admin').then(module => ({ default: module.discardEditHandler })))
appGroup.use('管理员邮件 发送', () => import('./response/admin').then(module => ({ default: module.previewEditHandler })))
appGroup.use('管理员邮件 确认发放', () => import('./response/admin').then(module => ({ default: module.confirmEditHandler })))
appGroup.use('面板', () => import('./response/panel'))
appGroup.use('战斗信息', () => import('./response/battle-info'))
appGroup.use('探索', () => import('./response/explore'))
appGroup.use({ path: '背包', schema: { usage: '/背包 [装备|道具|材料]', args: [{ name: 'category', rules: [{ type: 'enum', enum: ['装备', '道具', '材料'] }] }] } }, () => import('./response/inventory'))
appGroup.use('图鉴', () => import('./response/codex'))
appGroup.use({ path: '图鉴列表', schema: { usage: '/图鉴列表 <装备|道具|材料|怪物|技能> [子分类]', args: [{ name: 'kind', rules: [{ required: true, type: 'enum', enum: ['装备', '道具', '材料', '怪物', '技能'] }] }, { name: 'category' }] } }, () => import('./response/codex').then(module => ({ default: module.codexListHandler })))
appGroup.use({ path: '图鉴分页', schema: { usage: '/图鉴分页 <分类> <子分类> <页码> [关键词]', args: [{ name: 'kind', rules: [{ required: true, type: 'enum', enum: ['装备', '道具', '材料', '怪物', '技能'] }] }, { name: 'category', rules: [{ required: true }] }, { name: 'page', rules: [{ required: true, type: 'number', min: 1 }] }, { name: 'keyword', rules: [{ type: 'rest' }] }] } }, () => import('./response/codex').then(module => ({ default: module.codexPageHandler })))
appGroup.use({ path: '图鉴搜索', schema: { usage: '/图鉴搜索 <分类> <关键词>', args: [{ name: 'kind', rules: [{ required: true, type: 'enum', enum: ['装备', '道具', '材料', '怪物', '技能'] }] }, { name: 'keyword', rules: [{ required: true, type: 'rest' }] }] } }, () => import('./response/codex').then(module => ({ default: module.codexSearchHandler })))
appGroup.use({ path: '物品图鉴', schema: { usage: '/物品图鉴 <物品ID>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/item-codex'))
appGroup.use({ path: '装备详情', schema: { usage: '/装备详情 <装备编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/equipment-detail'))
appGroup.use({ path: '卸下装备', schema: { usage: '/卸下装备 <部位>', args: [{ name: 'slot', rules: [{ required: true, type: 'enum', enum: ['weapon', 'offhand', 'shoulder', 'upper', 'waist', 'lower', 'feet', 'necklace', 'bracelet', 'ring'] }] }] } }, () => import('./response/equipment').then(module => ({ default: module.unequipHandler })))
appGroup.use({ path: '选择装备', schema: { usage: '/选择装备 <部位>', args: [{ name: 'slot', rules: [{ required: true, type: 'enum', enum: ['weapon', 'offhand', 'shoulder', 'upper', 'waist', 'lower', 'feet', 'necklace', 'bracelet', 'ring'] }] }] } }, () => import('./response/equipment').then(module => ({ default: module.chooseEquipmentHandler })))
appGroup.use({ path: '穿戴装备', schema: { usage: '/穿戴装备 <部位> <装备编号>', args: [{ name: 'slot', rules: [{ required: true, type: 'enum', enum: ['weapon', 'offhand', 'shoulder', 'upper', 'waist', 'lower', 'feet', 'necklace', 'bracelet', 'ring'] }] }, { name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/equipment').then(module => ({ default: module.equipHandler })))
appGroup.use('装备', () => import('./response/equipment'))
appGroup.use({ path: '技能列表', schema: { usage: '/技能列表 [已学习|未学习]', args: [{ name: 'view', rules: [{ type: 'enum', enum: ['已学习', '未学习'] }] }] } }, () => import('./response/skill-list'))
appGroup.use({ path: '技能详情', schema: { usage: '/技能详情 <技能编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/skill-list').then(module => ({ default: module.skillDetailHandler })))
appGroup.use({ path: '技能图鉴详情', schema: { usage: '/技能图鉴详情 <技能编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/codex').then(module => ({ default: module.skillCodexDetailHandler })))
appGroup.use({ path: '学习技能', schema: { usage: '/学习技能 <技能编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/skill-list').then(module => ({ default: module.learnSkillHandler })))
appGroup.use({ path: '技能快捷', schema: { usage: '/技能快捷 <技能编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/skill-list').then(module => ({ default: module.skillShortcutHandler })))
appGroup.use({ path: '升级技能', schema: { usage: '/升级技能 <技能编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/skill-list').then(module => ({ default: module.upgradeSkillHandler })))
appGroup.use({ path: '升级专精', schema: { usage: '/升级专精 <技能编号> <过充|瞬息|节能|强效|娴熟|随心>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }, { name: 'specialization', rules: [{ required: true, type: 'enum', enum: ['过充', '瞬息', '节能', '强效', '娴熟', '随心'] }] }] } }, () => import('./response/skill-list').then(module => ({ default: module.upgradeSpecializationHandler })))
appGroup.use({ path: '升级鉴识', schema: { usage: '/升级鉴识 <慧眼|识珠>', args: [{ name: 'direction', rules: [{ required: true, type: 'enum', enum: ['慧眼', '识珠'] }] }] } }, () => import('./response/skill-list').then(module => ({ default: module.upgradeAppraisalHandler })))
appGroup.use('队伍', () => import('./response/party-info'))
appGroup.use('队伍列表', () => import('./response/party-info').then(module => ({ default: module.listHandler })))
appGroup.use('退出队伍', () => import('./response/party-info').then(module => ({ default: module.leaveHandler })))
appGroup.use({ path: '修改队伍名', schema: { usage: '/修改队伍名 <新队伍名>', args: [{ name: 'name', rules: [{ required: true, type: 'rest' }] }] } }, () => import('./response/party-info').then(module => ({ default: module.renameHandler })))
appGroup.use({ path: '委任队长', schema: { usage: '/委任队长 <游戏ID>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 10000001 }] }] } }, () => import('./response/party-info').then(module => ({ default: module.transferHandler })))
appGroup.use({ path: '队伍成员信息', schema: { usage: '/队伍成员信息 <游戏ID>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 10000001 }] }] } }, () => import('./response/party-info').then(module => ({ default: module.memberInfoHandler })))
appGroup.use({ path: '移动', schema: { usage: '/移动 <上|下|左|右>', args: [{ name: 'direction', rules: [{ required: true, type: 'enum', enum: ['上', '下', '左', '右'] }] }] } }, () => import('./response/move'))
appGroup.use('休息', () => import('./response/panel').then(module => ({ default: module.restHandler })))
appGroup.use('行动', () => import('./response/panel').then(module => ({ default: module.resumeActionHandler })))
appGroup.use({ path: '自动战斗', schema: { usage: '/自动战斗 <开启|关闭|配置>', args: [{ name: 'action', rules: [{ type: 'enum', enum: ['开启', '关闭', '配置'] }] }] } }, () => import('./response/auto-battle'))
appGroup.use({ path: '自动战斗 出招选择', schema: { usage: '/自动战斗 出招选择 <位置> [页码]', args: [{ name: 'sequence', rules: [{ required: true, type: 'number', min: 1, max: 30 }] }, { name: 'page', rules: [{ type: 'number', min: 1 }] }] } }, () => import('./response/auto-battle').then(module => ({ default: module.selectActionHandler })))
appGroup.use({ path: '自动战斗 选择出招', schema: { usage: '/自动战斗 选择出招 <位置> <技能编号，普攻为0>', args: [{ name: 'sequence', rules: [{ required: true, type: 'number', min: 1, max: 30 }] }, { name: 'skill', rules: [{ required: true, type: 'number', min: 0 }] }] } }, () => import('./response/auto-battle').then(module => ({ default: module.chooseActionHandler })))
appGroup.use({ path: '自动战斗 出招搜索', schema: { usage: '/自动战斗 出招搜索 <位置> <关键词>', args: [{ name: 'sequence', rules: [{ required: true, type: 'number', min: 1, max: 30 }] }, { name: 'keyword', rules: [{ required: true, type: 'rest' }] }] } }, () => import('./response/auto-battle').then(module => ({ default: module.actionSearchHandler })))
appGroup.use({ path: '自动战斗 删除', schema: { usage: '/自动战斗 删除 <位置>', args: [{ name: 'sequence', rules: [{ required: true, type: 'number', min: 1, max: 30 }] }] } }, () => import('./response/auto-battle').then(module => ({ default: module.deleteActionHandler })))
appGroup.use('自动战斗 快速配置', () => import('./response/auto-battle').then(module => ({ default: module.quickSetupHandler })))
appGroup.use({ path: '自动战斗 快速选择', schema: { usage: '/自动战斗 快速选择 <技能编号，普攻为0>', args: [{ name: 'skill', rules: [{ required: true, type: 'number', min: 0 }] }] } }, () => import('./response/auto-battle').then(module => ({ default: module.quickChoiceHandler })))
appGroup.use({ path: '自动战斗 快速选择页', schema: { usage: '/自动战斗 快速选择页 <页码>', args: [{ name: 'page', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/auto-battle').then(module => ({ default: module.quickPageHandler })))
appGroup.use({ path: '自动战斗 快速搜索', schema: { usage: '/自动战斗 快速搜索 <关键词>', args: [{ name: 'keyword', rules: [{ required: true, type: 'rest' }] }] } }, () => import('./response/auto-battle').then(module => ({ default: module.quickSearchHandler })))
appGroup.use('自动战斗 完成配置', () => import('./response/auto-battle').then(module => ({ default: module.quickFinishHandler })))
appGroup.use({ path: '自动战斗 嗑药', schema: { usage: '/自动战斗 嗑药 <开启|关闭>', args: [{ name: 'state', rules: [{ required: true, type: 'enum', enum: ['开启', '关闭'] }] }] } }, () => import('./response/auto-battle').then(module => ({ default: module.potionToggleHandler })))
appGroup.use({ path: '自动战斗 设置门槛', schema: { usage: '/自动战斗 设置门槛 <生命|魔力> [百分比]', args: [{ name: 'kind', rules: [{ required: true, type: 'enum', enum: ['生命', '魔力'] }] }, { name: 'value', rules: [{ type: 'number', min: 1, max: 99 }] }] } }, () => import('./response/auto-battle').then(module => ({ default: module.thresholdHandler })))
appGroup.use({ path: '自动战斗 药剂选择', schema: { usage: '/自动战斗 药剂选择 <生命|魔力> [页码]', args: [{ name: 'kind', rules: [{ required: true, type: 'enum', enum: ['生命', '魔力'] }] }, { name: 'page', rules: [{ type: 'number', min: 1 }] }] } }, () => import('./response/auto-battle').then(module => ({ default: module.potionListHandler })))
appGroup.use({ path: '自动战斗 选择药剂', schema: { usage: '/自动战斗 选择药剂 <生命|魔力> <物品编号>', args: [{ name: 'kind', rules: [{ required: true, type: 'enum', enum: ['生命', '魔力'] }] }, { name: 'item', rules: [{ required: true, type: 'number', min: 0 }] }] } }, () => import('./response/auto-battle').then(module => ({ default: module.potionChoiceHandler })))
appGroup.use({ path: '自动战斗 药剂搜索', schema: { usage: '/自动战斗 药剂搜索 <生命|魔力> <关键词>', args: [{ name: 'kind', rules: [{ required: true, type: 'enum', enum: ['生命', '魔力'] }] }, { name: 'keyword', rules: [{ required: true, type: 'rest' }] }] } }, () => import('./response/auto-battle').then(module => ({ default: module.potionSearchHandler })))
appGroup.use({ path: '前往', schema: { usage: '/前往 <横坐标> <纵坐标>', args: [{ name: 'x', rules: [{ required: true, type: 'number' }] }, { name: 'y', rules: [{ required: true, type: 'number' }] }] } }, () => import('./response/go-to'))
appGroup.use({ path: '前往地图', schema: { usage: '/前往地图 <地图编号>', args: [{ name: 'code', rules: [{ required: true }] }] } }, () => import('./response/adventure').then(module => ({ default: module.goToMapHandler })))
appGroup.use('寻怪', () => import('./response/adventure').then(module => ({ default: module.huntHandler })))
appGroup.use('取消移动', () => import('./response/adventure').then(module => ({ default: module.cancelTravelHandler })))
appGroup.use('取消寻怪', () => import('./response/adventure').then(module => ({ default: module.cancelTravelHandler })))
appGroup.use('刷新行动', () => import('./response/adventure').then(module => ({ default: module.refreshTravelHandler })))
appGroup.use({ path: '目标', schema: { usage: '/目标 <编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/target'))
appGroup.use({ path: '偷袭', schema: { usage: '/偷袭 <编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/adventure').then(module => ({ default: module.ambushHandler })))
appGroup.use({ path: '伏击', schema: { usage: '/伏击 <编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/adventure').then(module => ({ default: module.queueAmbushHandler })))
appGroup.use('离开战斗', () => import('./response/adventure').then(module => ({ default: module.leaveOccupiedBattleHandler })))
appGroup.use({ path: '怪物详情', schema: { usage: '/怪物详情 <编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/monster-detail'))
appGroup.use({ path: '怪物图鉴详情', schema: { usage: '/怪物图鉴详情 <编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/codex').then(module => ({ default: module.monsterCodexDetailHandler })))
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
appGroup.use({ path: '任务分类', schema: { usage: '/任务分类 <分类>', args: [{ name: 'category', rules: [{ required: true, type: 'enum', enum: ['主线', '支线', '悬赏', '委托', '其他'] }] }] } }, () => import('./response/bounty').then(module => ({ default: module.taskCategoryHandler })))
appGroup.use({ path: '任务页', schema: { usage: '/任务页 <分类|全部> <页码> [关键词]', args: [{ name: 'category', rules: [{ required: true, type: 'enum', enum: ['全部', '主线', '支线', '悬赏', '委托', '其他'] }] }, { name: 'page', rules: [{ required: true, type: 'number', min: 1 }] }, { name: 'keyword' }] } }, () => import('./response/bounty').then(module => ({ default: module.taskPageHandler })))
appGroup.use({ path: '任务搜索', schema: { usage: '/任务搜索 <关键词>', args: [{ name: 'keyword', rules: [{ required: true }] }] } }, () => import('./response/bounty').then(module => ({ default: module.taskSearchHandler })))
appGroup.use('工会商店', () => import('./response/guild-shop').then(module => ({ default: module.guildShopHandler })))
appGroup.use('餐厅', () => import('./response/guild-restaurant'))
appGroup.use('铁匠铺', () => import('./response/blacksmith'))
appGroup.use('打造装备', () => import('./response/blacksmith').then(module => ({ default: module.forgeHandler })))
appGroup.use('副职业打造装备', () => import('./response/blacksmith').then(module => ({ default: module.secondaryProfessionForgeHandler })))
appGroup.use({ path: '打造部位', schema: { usage: '/打造部位 <部位>', args: [{ name: 'category', rules: [{ required: true, type: 'enum', enum: ['武器', '头肩', '上装', '腰部', '下装', '脚部'] }] }] } }, () => import('./response/blacksmith').then(module => ({ default: module.forgeCategoryHandler })))
appGroup.use({ path: '打造类型', schema: { usage: '/打造类型 <类型>', args: [{ name: 'subtype', rules: [{ required: true, type: 'enum', enum: ['长剑', '法杖', '匕首', '拳刃', '布甲', '皮甲', '轻甲', '重甲', '板甲'] }] }] } }, () => import('./response/blacksmith').then(module => ({ default: module.forgeSubtypeHandler })))
appGroup.use({ path: '打造等级', schema: { usage: '/打造等级 <等级>', args: [{ name: 'level', rules: [{ required: true, type: 'number', min: 5, max: 50 }] }] } }, () => import('./response/blacksmith').then(module => ({ default: module.forgeLevelHandler })))
appGroup.use('打造材料', () => import('./response/blacksmith').then(module => ({ default: module.forgeMaterialListHandler })))
appGroup.use({ path: '打造材料页', schema: { usage: '/打造材料页 <页码> [关键词]', args: [{ name: 'page', rules: [{ required: true, type: 'number', min: 1 }] }, { name: 'keyword' }] } }, () => import('./response/blacksmith').then(module => ({ default: module.forgeMaterialPageHandler })))
appGroup.use({ path: '打造材料搜索', schema: { usage: '/打造材料搜索 <关键词>', args: [{ name: 'keyword', rules: [{ required: true }] }] } }, () => import('./response/blacksmith').then(module => ({ default: module.forgeMaterialSearchHandler })))
appGroup.use({ path: '放入打造材料', schema: { usage: '/放入打造材料 <材料编号> [数量]', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }, { name: 'quantity', rules: [{ type: 'number', min: 1 }] }] } }, () => import('./response/blacksmith').then(module => ({ default: module.forgeMaterialHandler })))
appGroup.use({ path: '取出打造材料', schema: { usage: '/取出打造材料 <材料编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/blacksmith').then(module => ({ default: module.forgeMaterialRemoveHandler })))
appGroup.use({ path: '修改打造材料', schema: { usage: '/修改打造材料 <材料编号> <数量>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }, { name: 'quantity', rules: [{ required: true, type: 'number', min: 0 }] }] } }, () => import('./response/blacksmith').then(module => ({ default: module.forgeMaterialSetHandler })))
appGroup.use({ path: '删除打造材料', schema: { usage: '/删除打造材料 <材料编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/blacksmith').then(module => ({ default: module.forgeMaterialClearHandler })))
appGroup.use('开始打造', () => import('./response/blacksmith').then(module => ({ default: module.forgeStartHandler(false) })))
appGroup.use('确认打造', () => import('./response/blacksmith').then(module => ({ default: module.forgeStartHandler(true) })))
appGroup.use('关于锻造师', () => import('./response/blacksmith').then(module => ({ default: module.blacksmithAboutHandler })))
appGroup.use({ path: '选择副职业', schema: { usage: '/选择副职业 <副职业>', args: [{ name: 'name', rules: [{ required: true, type: 'enum', enum: ['锻造师'] }] }] } }, () => import('./response/blacksmith').then(module => ({ default: module.blacksmithProfessionSelectHandler })))
appGroup.use('接受锻造师任务', () => import('./response/blacksmith').then(module => ({ default: module.acceptBlacksmithQuestHandler })))
appGroup.use('提交锻造师任务', () => import('./response/blacksmith').then(module => ({ default: module.claimBlacksmithQuestHandler })))
appGroup.use('副职业', () => import('./response/blacksmith').then(module => ({ default: module.secondaryProfessionHandler })))
appGroup.use('精炼', () => import('./response/blacksmith').then(module => ({ default: module.refineListHandler })))
appGroup.use({ path: '精炼放入', schema: { usage: '/精炼放入 <武器实例编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/blacksmith').then(module => ({ default: module.refinePutHandler })))
appGroup.use({ path: '精炼执行', schema: { usage: '/精炼执行 <武器实例编号> <材料编号>', args: [{ name: 'instanceId', rules: [{ required: true, type: 'number', min: 1 }] }, { name: 'materialId', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/blacksmith').then(module => ({ default: module.refineExecuteHandler })))
appGroup.use('熔铸', () => import('./response/blacksmith').then(module => ({ default: module.fuseListHandler })))
appGroup.use({ path: '熔铸放入', schema: { usage: '/熔铸放入 <武器实例编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/blacksmith').then(module => ({ default: module.fusePutHandler })))
appGroup.use({ path: '熔铸执行', schema: { usage: '/熔铸执行 <武器实例编号> <材料编号>', args: [{ name: 'instanceId', rules: [{ required: true, type: 'number', min: 1 }] }, { name: 'materialId', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/blacksmith').then(module => ({ default: module.fuseExecuteHandler })))
appGroup.use('餐厅菜单', () => import('./response/guild-restaurant').then(module => ({ default: module.restaurantMenuHandler })))
appGroup.use({ path: '餐厅菜单页', schema: { usage: '/餐厅菜单页 <页码> [关键词]', args: [{ name: 'page', rules: [{ required: true, type: 'number', min: 1 }] }, { name: 'keyword' }] } }, () => import('./response/guild-restaurant').then(module => ({ default: module.restaurantMenuHandler })))
appGroup.use({ path: '餐厅搜索', schema: { usage: '/餐厅搜索 <菜品关键词>', args: [{ name: 'keyword', rules: [{ required: true }] }] } }, () => import('./response/guild-restaurant').then(module => ({ default: module.restaurantSearchHandler })))
appGroup.use({ path: '享用美食', schema: { usage: '/享用美食 <菜品编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/guild-restaurant').then(module => ({ default: module.enjoyMealHandler })))
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
      .then(async () => { await spawnMonsters(false); logger.info('游戏数据库、初始地图与怪物群已就绪'); })
      .catch(error => logger.error({ err: error }, '游戏数据库初始化失败'));
    setCron('0 * * * *', () => void getPool().then(async pool => { await refreshBounties(pool); await spawnMonsters(); }).catch(error => logger.error({ err: error }, '整点 Boss/悬赏刷新失败')));
  }
});
