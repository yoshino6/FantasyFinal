import { useEvent, useRoute, Format } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';
import { buyFolioBook, folioShopCatalog, folioShopNames } from '../game/folio-shop.service.js';
import { folioSkillByCode } from '../game/active-folio-skills.config.js';
import { messageFormat } from '../game/message.js';

const folioShopFormat = async (user, shop, page = 1, filter = '全部', tier = '全部') => {
    const data = await folioShopCatalog(user, shop, page, filter, tier);
    const md = Format.createMarkdown().addTitle(data.name).addNewline().addNewline().addText(`铜币 ${data.copper}｜${data.page}/${data.pages}页\n研读仅领悟；学习另耗SP。绑定书籍，库存不限。\n\n`);
    for (const category of ['全部', '物理', '魔法', '净化', '增益'])
        md.addButton(category, { data: `/战技商店 ${shop} 1 ${category} ${tier}`, autoEnter: false }).addText(' ');
    md.addNewline();
    for (const rank of ['全部', '基础', '下位', '中位'])
        md.addButton(rank, { data: `/战技商店 ${shop} 1 ${filter} ${rank}`, autoEnter: false }).addText(' ');
    md.addNewline().addNewline();
    for (const s of data.items)
        md.addButton(s.name, { data: `/战技书详情 ${s.code}`, autoEnter: false }).addText(`｜${s.tier}｜Lv.${s.learnLevel}\n${s.price}铜币｜${s.known ? '已领悟/学会' : s.owned ? '已有未读本' : '可购买'}\n\n`);
    if (data.page > 1)
        md.addButton('上一页', { data: `/战技商店 ${shop} ${data.page - 1} ${filter} ${tier}`, autoEnter: false });
    if (data.page < data.pages)
        md.addButton('下一页', { data: `/战技商店 ${shop} ${data.page + 1} ${filter} ${tier}`, autoEnter: false });
    return Format.create().addMarkdown(md);
};
var folioShop = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        await message.send({ format: await folioShopFormat(event.current.UserId, String(route.param('shop')), Number(route.param('page') ?? 1), String(route.param('filter') ?? '全部'), String(route.param('tier') ?? '全部')) });
    }
    catch (e) {
        await message.send({ format: messageFormat('战技商店', e.message) });
    }
};
const detail = async () => {
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        const s = folioSkillByCode(String(route.param('code')));
        if (!s)
            throw Error('找不到这本战技书。');
        const md = Format.createMarkdown().addTitle(s.name).addNewline().addNewline().addText(`${s.tier}｜${s.category === 'physical' ? '物理' : s.category === 'magic' ? '魔法' : '辅助'}｜${s.targetCount ? `${s.targetCount}目标` : '全体'}\n威力：${s.category === 'utility' ? '—' : s.power}${s.parts.length > 1 ? '（' + s.parts.join('+') + '）' : ''}\n蓝耗：${s.mana}\n冷却：${s.cooldown}回合\n吟唱：${s.chant}回合\n效果：${s.description}\n\n学习条件：Lv.${s.learnLevel}，${s.tier === '基础' ? 1 : s.tier === '下位' ? 2 : 3}SP\n售价：${s.price}铜币｜${folioShopNames[s.shop]}\n等级不足可提前购买、研读，但不能学习。\n\n`)
            .addButton('确认购买', { data: `/购买战技书 ${s.code} 确认`, autoEnter: false }).addText('　').addButton('使用150抵用券', { data: `/购买战技书 ${s.code} 抵用券`, autoEnter: false }).addNewline().addButton('返回目录', { data: `/战技商店 ${s.shop}`, autoEnter: false });
        await message.send({ format: Format.create().addMarkdown(md) });
    }
    catch (e) {
        await message.send({ format: messageFormat('战技书详情', e.message) });
    }
};
const buy = async () => {
    const [event] = useEvent();
    const [route] = useRoute();
    const [message] = useGameMessage();
    try {
        const result = await buyFolioBook(event.current.UserId, String(route.param('code')), ['确认', '抵用券'].includes(String(route.param('confirm'))), route.param('confirm') === '抵用券');
        await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('购买成功').addNewline().addNewline().addText(`获得技能书·${result.name}\n实付${result.price}铜币，抵扣${result.discount}铜币。\n`).addButton('研读技能书', { data: `/研读技能书 ${result.itemId}`, autoEnter: false })) });
    }
    catch (e) {
        await message.send({ format: messageFormat('购买未完成', e.message) });
    }
};

export { buy, folioShop as default, detail, folioShopFormat };
