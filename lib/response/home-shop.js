import { useEvent, useMessage, useRoute, Format } from 'alemonjs';
import { tradeHomeOffer, listHomeShop } from '../game/home.service.js';
import { messageFormat } from '../game/message.js';

const homeShopFormat = async (qqUserId) => {
    const shop = await listHomeShop(qqUserId);
    const markdown = Format.createMarkdown().addTitle('百纳镇·百纳居').addNewline().addNewline()
        .addBlockquote('店员将木料、石料与金属整齐码在柜台前。“建材可以用铜币购买；拿锻材来换会更划算。屋子总会越住越像自己的。”').addNewline().addNewline();
    for (const offer of shop.offers) {
        const price = offer.inputName ? `${offer.inputName}×${offer.inputQuantity}` : `铜币×${offer.copperPrice}`;
        markdown.addText(`【${offer.outputName}】×${offer.outputQuantity} `).addButton('[购买/兑换]', { data: `/百纳居交易 ${offer.id} `, autoEnter: false }).addNewline()
            .addBlockquote(`需要：${price}${offer.inputName ? '（锻材兑换优惠）' : ''}`).addNewline().addNewline();
    }
    markdown.addText(`持有铜币：**${shop.copper}**`).addNewline().addText('输入数量即可批量购买或兑换。');
    return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow()
        .addButton('购买小屋', '/家园购买', { type: 'command', autoEnter: true, style: 'blue' })
        .addButton('我的家园', '/家园', { type: 'command', autoEnter: true, style: 'blue' })
        .addButton('离开百纳居', '/建筑离开 baina_residence', { type: 'command', autoEnter: true }));
};
const homeShopHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try {
    await message.send({ format: await homeShopFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('百纳居暂不可用', error instanceof Error ? error.message : '请先站在百纳居柜台前。') });
} };
const homeShopTradeHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try {
    const raw = String(route.param('quantity') ?? '').trim();
    const result = await tradeHomeOffer(event.current.UserId, Number(route.param('id')), raw ? Number(raw) : 1);
    await message.send({ format: messageFormat('交易完成', `获得【${result.name}】×${result.quantity}`) });
    await message.send({ format: await homeShopFormat(event.current.UserId) });
}
catch (error) {
    await message.send({ format: messageFormat('交易失败', error instanceof Error ? error.message : '请稍后重试。') });
} };

export { homeShopFormat, homeShopHandler, homeShopTradeHandler };
