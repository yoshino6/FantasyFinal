import { useEvent, useRoute, Format } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { messageFormat } from '../game/message.js';
import { acceptCompanion, companionAction, companionPanel, companionStats, companionSpecialties } from '../game/companion.service.js';

const specialties = { find: '寻物', gather: '采集', watch: '守夜', negotiate: '亲和', workshop: '工坊' };
const companionHandler = (mode = 'panel') => async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        if (mode === 'invite') {
            const answer = String(route.param('answer'));
            if (!['接纳', '婉拒'].includes(answer))
                throw new Error('请选择接纳或婉拒。');
            await message.send({ format: messageFormat('同行邀请', await acceptCompanion(event.current.UserId, answer === '接纳')) });
        }
        if (mode === 'action') {
            const actions = { 出行: 'out', 休整: 'rest', 喂食: 'feed', 交谈: 'talk', 改名: 'name', 放归: 'release', 专长: 'specialty' };
            const action = actions[String(route.param('action'))];
            if (!action)
                throw new Error('请选择有效随从操作。');
            let value = String(route.param('value') ?? '');
            if (action === 'specialty')
                value = Object.keys(specialties).find(key => specialties[key] === value) ?? value;
            await message.send({ format: messageFormat('随从', await companionAction(event.current.UserId, Number(route.param('id')), action, value)) });
        }
        const panel = await companionPanel(event.current.UserId);
        const buttons = Format.createButtonGroup();
        const md = Format.createMarkdown().addTitle(mode === 'detail' ? '随从·同行札记' : '随从名册').addNewline().addNewline();
        if (mode === 'detail') {
            const pet = panel.companions.find(p => Number(p.id) === Number(route.param('id')));
            if (!pet)
                throw new Error('这位随从不在你的名册中。');
            const stats = companionStats(Number(pet.level));
            md.addText(`${pet.name} · Lv.${pet.level}\n\n亲密 ${Number(pet.intimacy)} / 100｜安定 ${pet.stability} / 100\n${pet.injured ? '需要疗养' : pet.is_out ? '正在出行' : '正在休整'}｜专长：${specialties[String(pet.specialty)] ?? '寻物'}\n\n生命 ${stats.hp}｜攻击 ${stats.attack}｜防御 ${stats.defense}\n\n亲密 25：可以改名；50：开放物种专长；80：获得更亲近的回应。支援每三次主人行动触发一次，自动与手动共用次数。`);
            buttons.addRow().addButton(pet.is_out ? '安排休整' : '一起出行', `/随从操作 ${pet.id} ${pet.is_out ? '休整' : '出行'}`, { type: 'command', autoEnter: true, style: 'blue' }).addButton('喂食', `/随从操作 ${pet.id} 喂食`, { type: 'command', autoEnter: true });
            buttons.addRow().addButton('交谈', `/随从操作 ${pet.id} 交谈`, { type: 'command', autoEnter: true }).addButton('改名', `/随从操作 ${pet.id} 改名 `, { type: 'command', autoEnter: false });
            buttons.addRow().addButton('确认放归', `/随从操作 ${pet.id} 放归 `, { type: 'command', autoEnter: false });
            if (Number(pet.intimacy) >= 50)
                for (const specialty of companionSpecialties(String(pet.template_code)))
                    md.addNewline().addButton(`[改为${specialties[specialty]}]`, { data: `/随从操作 ${pet.id} 专长 ${specialties[specialty]}`, autoEnter: false });
            if (pet.template_code === 'golden_rabbit')
                md.addNewline().addText('微光护持：低于40%生命时，在支援时机恢复8%生命，每场一次。金鼻尖：每日最多寻得3株草药。亲密50后可在公会分享面包。放归后无法重新领取黄金兔。');
            md.addNewline().addNewline().addText('放归需要手动填写当前名字，确认后不能找回。');
        }
        else {
            md.addText(`名册 ${panel.companions.length}/6 · 同时出行 1 位\n\n`);
            if (!panel.companions.length)
                md.addText('名册还空着。成功交涉后，有些野怪会愿意继续与你同行；邀请会保留在这里。');
            for (const [index, pet] of panel.companions.entries()) {
                md.addBlockquote(`${pet.name} · Lv.${pet.level} · ${pet.injured ? '待疗养' : pet.is_out ? '出行' : '休整'} · 亲密 ${Number(pet.intimacy)}`).addNewline();
                if (index % 2 === 0)
                    buttons.addRow();
                buttons.addButton(String(pet.name), `/随从详情 ${pet.id}`, { type: 'command', autoEnter: true });
            }
            if (panel.invitation) {
                md.addNewline().addText(`${panel.invitation.name}正在等待你的答复。名册已满也不会失去这份邀请。`);
                buttons.addRow().addButton('接纳同行', '/随从邀请 接纳', { type: 'command', autoEnter: true, style: 'blue' }).addButton('婉拒同行', '/随从邀请 婉拒', { type: 'command', autoEnter: true });
            }
        }
        buttons.addRow().addButton('随从名册', '/随从', { type: 'command', autoEnter: true }).addButton('公会兽栏', '/初行公会 兽栏', { type: 'command', autoEnter: true });
        await message.send({ format: Format.create().addMarkdown(md).addButtonGroup(buttons) });
    }
    catch (error) {
        await message.send({ format: messageFormat('随从', error instanceof Error ? error.message : '请稍后再试。') });
    }
};

export { companionHandler };
