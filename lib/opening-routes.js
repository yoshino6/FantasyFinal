const registerOpeningRoutes = (group) => {
    group.use({ path: '女神', schema: { usage: '/女神 [进度] [选择]', args: [{ name: 'revision', rules: [{ type: 'number', min: 0 }] }, { name: 'action' }] } }, () => import('./response/aqua.js'));
    for (const path of ['公会', '初行公会'])
        group.use({ path, schema: { usage: `/${path} [区域]`, args: [{ name: 'area' }] } }, () => import('./response/opening-guild.js').then(m => ({ default: m.openingGuildHandler() })));
    group.use('初行入会', () => import('./response/opening-guild.js').then(m => ({ default: m.openingGuildHandler('enter') })));
    group.use('初行离会', () => import('./response/opening-guild.js').then(m => ({ default: m.openingGuildHandler('leave') })));
    group.use('初行见闻', () => import('./response/opening-guild.js').then(m => ({ default: m.openingGuildHandler('keepsakes') })));
    group.use({ path: '初行凭物', schema: { usage: '/初行凭物 <凭物代码> [操作] [装备编号或目的地]', args: [{ name: 'code', rules: [{ required: true }] }, { name: 'action' }, { name: 'value' }] } }, () => import('./response/opening-keepsakes.js').then(m => ({ default: m.keepsakeHandler })));
    group.use({ path: '初行委托', schema: { usage: '/初行委托 [进度]', args: [{ name: 'revision', rules: [{ type: 'number', min: 0 }] }] } }, () => import('./response/opening-keepsakes.js').then(m => ({ default: m.openingJobHandler })));
    group.use({ path: '初行服务', schema: { usage: '/初行服务 <项目> [编号]', args: [{ name: 'action', rules: [{ required: true }] }, { name: 'value' }] } }, () => import('./response/opening-guild.js').then(m => ({ default: m.openingGuildHandler('service') })));
    group.use({ path: '初行接驳', schema: { usage: '/初行接驳 <目的地>', args: [{ name: 'destination', rules: [{ required: true }] }] } }, () => import('./response/opening-guild.js').then(m => ({ default: m.openingGuildHandler('transport') })));
    group.use({ path: '打开宝箱', schema: { usage: '/打开宝箱 <宝箱代码> [数量]', args: [{ name: 'code', rules: [{ required: true }] }, { name: 'quantity', rules: [{ type: 'number', min: 1, max: 100 }] }] } }, () => import('./response/opening-chest.js').then(m => ({ default: m.openingChestHandler('preview') })));
    group.use({ path: '宝箱内容', schema: { usage: '/宝箱内容 [宝箱代码]', args: [{ name: 'code' }] } }, () => import('./response/opening-chest.js').then(m => ({ default: m.openingChestHandler('contents') })));
    group.use({ path: '确认开箱', schema: { usage: '/确认开箱 <凭据>', args: [{ name: 'token', rules: [{ required: true }] }] } }, () => import('./response/opening-chest.js').then(m => ({ default: m.openingChestHandler('confirm') })));
    group.use({ path: '开箱记录', schema: { usage: '/开箱记录 <凭据> [页码]', args: [{ name: 'token', rules: [{ required: true }] }, { name: 'page', rules: [{ type: 'number', min: 1 }] }] } }, () => import('./response/opening-chest.js').then(m => ({ default: m.openingChestHandler('result') })));
    group.use('随从', () => import('./response/companion.js').then(m => ({ default: m.companionHandler() })));
    group.use({ path: '随从详情', schema: { usage: '/随从详情 <编号>', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }] } }, () => import('./response/companion.js').then(m => ({ default: m.companionHandler('detail') })));
    group.use({ path: '随从邀请', schema: { usage: '/随从邀请 <接纳|婉拒>', args: [{ name: 'answer', rules: [{ required: true, type: 'enum', enum: ['接纳', '婉拒'] }] }] } }, () => import('./response/companion.js').then(m => ({ default: m.companionHandler('invite') })));
    group.use({ path: '随从操作', schema: { usage: '/随从操作 <编号> <操作> [名字或专长]', args: [{ name: 'id', rules: [{ required: true, type: 'number', min: 1 }] }, { name: 'action', rules: [{ required: true }] }, { name: 'value' }] } }, () => import('./response/companion.js').then(m => ({ default: m.companionHandler('action') })));
};

export { registerOpeningRoutes };
