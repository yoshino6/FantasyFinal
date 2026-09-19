import { getCharacter } from '../game/character.service.js';
import { partyInfo, toggleSkillShortcut, upgradeSkill, learnSkill, skillDetail, skillList, unequip, equip, equipmentDetail, equipment, battleStatus, combatAction, resumeAction, startRest, travelStatus, currentEncounter, moveToMap, move, explore, inventoryView } from '../game/adventure.service.js';
import { messageFormat } from '../game/message.js';
import { registrationScene } from '../game/divine-message.js';
import { plainAppMessage, formatToAppMessage } from './app-format.js';

const characterText = async (qqUserId) => {
    const character = await getCharacter(qqUserId);
    if (!character) {
        return plainAppMessage('你还没有创建角色。发送“注册”开始异世界之旅。', [{ label: '注册', command: '/注册' }]);
    }
    return formatToAppMessage(messageFormat('角色', [
        `昵称：${character.name}`,
        `性别：${character.gender === '男' ? '♂' : character.gender === '女' ? '♀' : '未设定'}`,
        `等级：Lv.${character.level}`,
        `职业：${character.professionName ?? '未选择'}`,
        `经验：${character.experience}`,
        `生命：${Math.round(character.currentHp)}/${Math.round(character.hpMax)}`,
        `魔力：${Math.round(character.currentMp)}/${Math.round(character.mpMax)}`,
        `体力：${Math.round(character.stamina)}/${Math.round(character.staminaMax)}`,
        `位置：${character.regionName} (${character.x}, ${character.y}, ${character.z})`,
        `天赋：${character.giftName ?? '无'}`
    ].join('\n')), '今天也要一起出发吗？');
};
const inventoryText = async (qqUserId) => {
    const view = await inventoryView(qqUserId);
    const lines = ['【背包】'];
    if (view.stacked.length) {
        lines.push('', '可堆叠物品：');
        lines.push(...view.stacked.slice(0, 20).map(item => `${item.name} ×${item.quantity}`));
    }
    if (view.instances.length) {
        lines.push('', '装备与实例：');
        lines.push(...view.instances.slice(0, 20).map(item => `${item.name}（${item.quality}%）`));
    }
    if (view.recent.length) {
        lines.push('', '最近获得：');
        lines.push(...view.recent.slice(0, 5).map(item => item.name));
    }
    if (lines.length === 1)
        lines.push('背包空空如也。');
    return plainAppMessage(lines.join('\n'), [
        { label: '装备', command: '/背包 装备' },
        { label: '道具', command: '/背包 道具' },
        { label: '材料', command: '/背包 材料' }
    ], '你的行囊我帮你记着。');
};
const exploreText = async (qqUserId) => {
    const result = await explore(qqUserId);
    const lines = [result.text];
    if (result.spawns.length) {
        lines.push('', '发现：');
        lines.push(...result.spawns.map(spawn => `#${spawn.id} ${spawn.name} Lv.${spawn.level}`));
    }
    const buttons = result.spawns.length
        ? [{ label: '目标', command: `/目标 ${result.spawns[0].id}` }]
        : [];
    return plainAppMessage(lines.join('\n'), buttons, result.spawns.length ? '前面有动静。' : '暂时没有敌人。');
};
const moveText = async (qqUserId, direction) => {
    const result = await move(qqUserId, direction);
    const text = result.text ?? '你移动了一步。';
    return plainAppMessage(text, [], '我跟着你走。');
};
const mapTravelText = async (qqUserId, mapCode) => {
    const result = await moveToMap(qqUserId, mapCode);
    const text = 'text' in result && result.text ? String(result.text) : '你开始前往目标地点。';
    return plainAppMessage(text, [], '路上小心。');
};
const statusText = async (qqUserId) => {
    const [character, travel, encounter] = await Promise.all([
        getCharacter(qqUserId),
        travelStatus(qqUserId),
        currentEncounter(qqUserId).catch(() => null)
    ]);
    const lines = [];
    if (character) {
        lines.push(`角色：${character.name} Lv.${character.level}`);
        lines.push(`位置：${character.regionName} (${character.x}, ${character.y}, ${character.z})`);
        lines.push(`状态：${character.activityStatus === 'active' ? '行动中' : character.activityStatus === 'resting' ? '休息中' : character.activityStatus}`);
    }
    if (travel) {
        lines.push(`行程：正在前往${travel.destinationName ?? travel.regionName}，剩余 ${travel.remaining} 秒`);
    }
    if (encounter?.spawns?.length) {
        lines.push(`遭遇：${encounter.spawns.map(spawn => spawn.name).join('、')}`);
    }
    if (!lines.length)
        lines.push('你还没有角色。发送“注册”开始冒险。');
    return plainAppMessage(lines.join('\n'), [
        { label: '角色', command: '/角色' },
        { label: '背包', command: '/背包' },
        { label: '探索', command: '/探索' }
    ], '这是现在的旅途。');
};
const restText = async (qqUserId, command) => {
    if (command.includes('起床') || command.includes('继续')) {
        const result = await resumeAction(qqUserId);
        return plainAppMessage(result.message, [], '休息好了。');
    }
    const result = await startRest(qqUserId);
    return plainAppMessage(result.message, [{ label: '起床', command: '/起床' }], '你休息吧，我守夜。');
};
const battleText = async (qqUserId, args) => {
    const battle = await battleStatus(qqUserId);
    const action = args[0] ?? '';
    if (action === '攻击' || action === '普攻' || action === 'atk') {
        const result = await combatAction(qqUserId, 'attack');
        return plainAppMessage(result.log ?? '你发起了攻击。', [], '上了！');
    }
    if (action === '防御' || action === 'defend') {
        const result = await combatAction(qqUserId, 'defend');
        return plainAppMessage(result.log ?? '你进入防御。', [], '稳住。');
    }
    if (action === '逃跑' || action === 'escape') {
        const result = await combatAction(qqUserId, 'escape');
        return plainAppMessage(result.log ?? '你尝试脱离战斗。', [], '跑得掉就跑！');
    }
    if (/^\d+$/.test(action)) {
        const slot = Number(action);
        const result = await combatAction(qqUserId, 'skill', slot);
        return plainAppMessage(result.log ?? `你使用了技能 ${slot}。`, [], '这一手漂亮！');
    }
    const lines = [
        battle.targets.length ? `目标：${battle.targets.map(target => target.name).join('、')}` : '战斗中没有目标。',
        `我方 HP：${battle.playerHp}/${battle.playerHpMax}｜MP：${battle.playerMp}/${battle.playerMpMax}`,
        battle.turn ? `回合：${battle.turn}` : ''
    ].filter(Boolean);
    return plainAppMessage(lines.join('\n'), [
        { label: '攻击', command: '/战斗 攻击' },
        { label: '防御', command: '/战斗 防御' },
        { label: '逃跑', command: '/战斗 逃跑' }
    ], '战斗还没结束。');
};
const equipmentText = async (qqUserId) => {
    const items = await equipment(qqUserId);
    if (!items.length)
        return plainAppMessage('你还没有穿戴任何装备。', [{ label: '背包', command: '/背包 装备' }], '空荡荡的，去背包看看吧。');
    const slotNames = {
        weapon: '武器', offhand: '副手', shoulder: '头肩', upper: '上装', waist: '腰部',
        lower: '下装', feet: '脚部', necklace: '项链', bracelet: '手镯', ring: '戒指'
    };
    const lines = ['【我的装备】'];
    for (const item of items) {
        lines.push(`${slotNames[item.slot] ?? item.slot}：${item.name}${item.appearanceName && item.appearanceName !== item.name ? `（外观：${item.appearanceName}）` : ''}`);
    }
    return plainAppMessage(lines.join('\n'), [
        { label: '背包', command: '/背包' },
        { label: '技能', command: '/技能' }
    ], '这一身很适合你。');
};
const equipmentDetailText = async (qqUserId, id) => {
    const item = await equipmentDetail(qqUserId, id);
    const lines = [`【${item.name}】`, `部位：${item.item_category}`, `稀有度：${item.rarity}`, `等级：${item.required_level}`, `品质：${item.quality}%`, `耐久：${item.durability}/${item.durability_max}`];
    if (item.description)
        lines.push(`说明：${item.description}`);
    return plainAppMessage(lines.join('\n'), [{ label: '装备', command: '/装备' }], '这是你的伙伴。');
};
const equipText = async (qqUserId, slot, id) => {
    const item = await equip(qqUserId, slot, id);
    return plainAppMessage(`已装备【${item.name}】。`, [{ label: '装备', command: '/装备' }], '穿好了。');
};
const unequipText = async (qqUserId, slot) => {
    const item = await unequip(qqUserId, slot);
    return plainAppMessage(`已卸下【${item.name}】。`, [{ label: '装备', command: '/装备' }], '收好了。');
};
const skillsText = async (qqUserId, view, id) => {
    if (id) {
        const skill = await skillDetail(qqUserId, id);
        const lines = [`【${skill.name}】Lv.${skill.level}`, `类别：${skill.category}｜${skill.tier}`, `法力：${skill.actualManaCost}｜冷却：${skill.actualCooldown}回合`, `威力：${skill.actualPower}`, skill.description ? `说明：${skill.description}` : ''];
        const buttons = skill.learned
            ? [{ label: '升级', command: `/升级技能 ${skill.id}` }, { label: '快捷', command: `/技能快捷 ${skill.id}` }]
            : [{ label: '学习', command: `/学习技能 ${skill.id}` }];
        return plainAppMessage(lines.filter(Boolean).join('\n'), buttons, '这是你的力量。');
    }
    const data = await skillList(qqUserId);
    const source = view === '未学习' ? data.discoveries : data.skills;
    const lines = [`【技能列表·${view}】`, `技能点：${data.skillPoints}`, ''];
    if (!source.length)
        lines.push(view === '未学习' ? '没有可学习的技能。' : '还没有学会任何技能。');
    for (const skill of source.slice(0, 12)) {
        lines.push(`#${skill.id} ${skill.name}${'level' in skill && skill.level ? ` Lv.${skill.level}` : ''}${'category' in skill && skill.category === 'passive' ? '（被动）' : ''}`);
    }
    return plainAppMessage(lines.join('\n'), [
        { label: '已学习', command: '/技能 已学习' },
        { label: '未学习', command: '/技能 未学习' },
        { label: '详情', command: '/技能详情 ' }
    ], '想学点什么？');
};
const learnSkillText = async (qqUserId, id) => {
    const result = await learnSkill(qqUserId, id);
    return plainAppMessage(`已学会【${result.name}】${result.cost ? `，消耗 ${result.cost} 技能点。` : '。'}`, [{ label: '技能', command: '/技能' }], '又变强了一点。');
};
const upgradeSkillText = async (qqUserId, id) => {
    const result = await upgradeSkill(qqUserId, id);
    return plainAppMessage(`【${result.name}】升至 Lv.${result.level}，消耗 ${result.cost} 技能点。`, [{ label: '技能', command: '/技能' }], '越来越熟练了。');
};
const toggleShortcutText = async (qqUserId, id) => {
    const result = await toggleSkillShortcut(qqUserId, id);
    return plainAppMessage(result.slot ? `已将【${result.name}】放入快捷栏 ${result.slot}。` : `已从快捷栏移除【${result.name}】。`, [{ label: '技能', command: '/技能' }], '快捷栏更新好了。');
};
const partyText = async (qqUserId) => {
    const party = await partyInfo(qqUserId);
    if (!party)
        return plainAppMessage('你还没有加入任何队伍。', [], '一个人走也可以。');
    const lines = [`【队伍·${party.name}】`, `队长：${party.leader?.name ?? '未知'}`];
    for (const member of party.members)
        lines.push(`成员：${member.name}（${member.gameId}）`);
    return plainAppMessage(lines.join('\n'), [
        { label: '退出队伍', command: '/退出队伍' },
        { label: '队员信息', command: '/队伍成员信息 ' }
    ], '一起走吧。');
};
const mailText = async (qqUserId, page = 1) => {
    const { playerMails } = await import('../game/mail.service.js');
    const data = await playerMails(qqUserId, page);
    const lines = [`【我的邮件】第 ${data.page}/${data.totalPages} 页`, ''];
    if (!data.mails.length)
        lines.push('邮箱空空如也。');
    for (const mail of data.mails) {
        lines.push(`${mail.id}. ${mail.title}${mail.attachmentCount ? `（${mail.claimed ? '已领取' : '有附件'}）` : ''}`);
    }
    return plainAppMessage(lines.join('\n'), [
        { label: '上一页', command: `/邮件页 ${Math.max(1, page - 1)}` },
        { label: '一键领取', command: '/一键领取邮件' },
        { label: '下一页', command: `/邮件页 ${Math.min(data.totalPages, page + 1)}` }
    ], '有新的消息。');
};
const mailDetailText = async (qqUserId, id) => {
    const { mailDetail } = await import('../game/mail.service.js');
    const mail = await mailDetail(qqUserId, id);
    return plainAppMessage(`【${mail.title}】\n${mail.content || '无内容'}\n\n附件：${mail.attachments}`, mail.attachmentCount && !mail.claimed ? [{ label: '领取', command: `/领取邮件 ${mail.id}` }] : [], '这是给你的信。');
};
const mailClaimText = async (qqUserId, id) => {
    const { claimMail, claimAllMails } = await import('../game/mail.service.js');
    if (!id) {
        const result = await claimAllMails(qqUserId);
        return plainAppMessage(`已领取 ${result.mailCount} 封邮件的附件。\n${result.items.map(item => `获得【${item.name}】×${item.quantity}`).join('\n') || '没有额外物品。'}`, [{ label: '邮件', command: '/邮件' }], '都收下啦。');
    }
    const result = await claimMail(qqUserId, id);
    return plainAppMessage(`附件已领取：${result.items.map(item => `【${item.name}】×${item.quantity}`).join('、')}`, [{ label: '邮件', command: '/邮件' }], '收到！');
};
const useItemText = async (qqUserId, id) => {
    const { randomUUID } = await import('node:crypto');
    const { useInventoryItem } = await import('../game/item-use.service.js');
    const result = await useInventoryItem(qqUserId, id, randomUUID());
    return plainAppMessage(result.message, [{ label: '背包', command: '/背包 道具' }], '用好了。');
};
const giftText = async (qqUserId, code) => {
    const { chooseGift } = await import('../game/character.service.js');
    const character = await chooseGift(qqUserId, code);
    if (!character)
        return plainAppMessage('选择天赋失败，请重试。', [], '再试一次。');
    return plainAppMessage(`天赋已绑定【${character.giftName ?? '未知'}】。`, [{ label: '角色', command: '/角色' }], '这条路的起点定了。');
};
const registerText = async (qqUserId, command) => {
    const args = command.replace(/^注册\s*/, '').trim().split(/\s+/).filter(Boolean);
    if (args[0] === '继续') {
        const { continueRegistration } = await import('../game/character.service.js');
        const next = await continueRegistration(qqUserId, args[1] ?? undefined);
        if (next === 'completed')
            return plainAppMessage('你已经完成注册，可以开始冒险了。', [{ label: '角色', command: '/角色' }], '欢迎回来！');
        return formatToAppMessage(await registrationScene(next, qqUserId), '我在这里等你。');
    }
    const { beginRegistration } = await import('../game/character.service.js');
    const result = await beginRegistration(qqUserId);
    if (result.alreadyRegistered)
        return plainAppMessage('你已经创建过角色，直接继续冒险吧。', [{ label: '角色', command: '/角色' }], '老伙伴了。');
    return formatToAppMessage(await registrationScene(result.stage, qqUserId), '欢迎来到猫拉瑞亚。');
};
const unsupportedText = (command) => plainAppMessage(`命令“${command}”暂未接入 App 网关。当前支持：角色、背包、探索、移动、地图前往、状态、休息、战斗、注册。`, [
    { label: '角色', command: '/角色' },
    { label: '背包', command: '/背包' },
    { label: '状态', command: '/状态' }
], '这条命令我还没学会。');
const executeAppCommand = async (input) => {
    const raw = String(input.command ?? '').trim();
    const command = raw.startsWith('/') ? raw.slice(1) : raw;
    const [head, ...args] = command.split(/\s+/).filter(Boolean);
    switch (head) {
        case '角色':
        case '我':
            return characterText(input.qqUserId);
        case '背包':
        case '物品':
            return inventoryText(input.qqUserId);
        case '探索':
        case '寻怪':
            return exploreText(input.qqUserId);
        case '移动':
        case '走':
            if (!args[0])
                return plainAppMessage('移动需要方向：/移动 上｜下｜左｜右', [], '告诉我往哪走。');
            return moveText(input.qqUserId, args[0]);
        case '前往':
        case '地图前往':
            if (!args[0])
                return plainAppMessage('前往需要地图代码：/前往 baina_town', [], '要去哪张地图？');
            return mapTravelText(input.qqUserId, args[0]);
        case '状态':
        case '旅途':
            return statusText(input.qqUserId);
        case '休息':
        case '起床':
            return restText(input.qqUserId, command);
        case '战斗':
        case '攻击':
            return battleText(input.qqUserId, args);
        case '注册':
            return registerText(input.qqUserId, command);
        case '装备':
        case '我的装备':
            return equipmentText(input.qqUserId);
        case '装备详情':
        case '已装备详情':
            return equipmentDetailText(input.qqUserId, Number(args[0] ?? 0));
        case '穿戴装备':
            return equipText(input.qqUserId, args[0] ?? '', Number(args[1] ?? 0));
        case '卸下装备':
            return unequipText(input.qqUserId, args[0] ?? '');
        case '技能':
        case '技能列表':
            return skillsText(input.qqUserId, args[0] ?? '已学习');
        case '技能详情':
            return skillsText(input.qqUserId, '已学习', Number(args[0] ?? 0));
        case '学习技能':
            return learnSkillText(input.qqUserId, Number(args[0] ?? 0));
        case '升级技能':
            return upgradeSkillText(input.qqUserId, Number(args[0] ?? 0));
        case '技能快捷':
            return toggleShortcutText(input.qqUserId, Number(args[0] ?? 0));
        case '队伍':
        case '队伍列表':
            return partyText(input.qqUserId);
        case '邮件':
            return mailText(input.qqUserId, Number(args[0] ?? 1));
        case '邮件页':
            return mailText(input.qqUserId, Number(args[0] ?? 1));
        case '查看邮件':
            return mailDetailText(input.qqUserId, Number(args[0] ?? 0));
        case '领取邮件':
            return mailClaimText(input.qqUserId, Number(args[0] ?? 0));
        case '一键领取邮件':
            return mailClaimText(input.qqUserId);
        case '使用道具':
            return useItemText(input.qqUserId, Number(args[0] ?? 0));
        case '选择恩赐':
            return giftText(input.qqUserId, args[0] ?? '');
        default:
            return unsupportedText(raw);
    }
};
const appQuickPanel = () => plainAppMessage('桌宠待命中。', [
    { label: '角色', command: '/角色' },
    { label: '背包', command: '/背包' },
    { label: '状态', command: '/状态' },
    { label: '探索', command: '/探索' }
], '今天想去哪里？');

export { appQuickPanel, executeAppCommand };
