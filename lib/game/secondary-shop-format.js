import { currentSecondaryShop } from './secondary-shop-context.js';
import { secondaryShopCommands } from './secondary-shop-commands.js';

const shopReturnCommands = { blacksmith: '/铁匠铺', alchemy_sweetshop: '/糖水屋', oddworkshop: '/异工坊', bookshop: '/百味书屋' };
const secondaryShopFormatSource = (source) => {
    const context = currentSecondaryShop();
    if (!context)
        return source;
    const commands = secondaryShopCommands[context.shop];
    const visit = (value) => {
        if (Array.isArray(value))
            return value.map(visit).filter(v => v !== null);
        if (!value || typeof value !== 'object')
            return value;
        let node = { ...value };
        if (['Button', 'MD.button'].includes(node.type) && typeof node.options?.data === 'string') {
            const match = /^\/([^\s]+)([\s\S]*)$/.exec(node.options.data);
            if (match) {
                const [, command, args] = match;
                if (['副职业导师', '解构图纸研习'].includes(command))
                    return null;
                if (context.personalProfession !== 'alchemist' && /^(炼金手记|保存炼金配方|炼金配方|加入炼金配方|删除炼金配方)/.test(command))
                    return null;
                const data = command === '副职业' ? `/店铺副职业 ${context.shop}` : commands.includes(command) ? `/店铺${command}${args}` : node.options.data;
                node.options = { ...node.options, data };
            }
        }
        if (typeof node.value === 'string' && node.type === 'MD.text')
            node.value = node.value.replace(/熟练度：\d+\/\d+\n[■□]+/g, '店铺服务：固定 Lv.3，不增加熟练度');
        if (node.type === 'MD.title' && typeof node.value === 'string')
            node.value = node.value.replace(/^副职业·/, '店铺服务·');
        if (Array.isArray(node.value)) {
            node.value = visit(node.value);
            if (['BT.row', 'BT.group'].includes(node.type) && !node.value.length)
                return null;
        }
        return node;
    };
    const result = visit(source);
    if (Array.isArray(result))
        result.unshift({ type: 'Markdown', value: [{ type: 'MD.blockquote', value: context.shop === 'bookshop' ? '洛文提供 Lv.3 全知者咨询，不增加熟练度；明鉴与巧思展示职业能力，店内咨询不会赋予玩家战斗被动。' : '店主代工 Lv.3｜消耗背包材料与原有费用｜不增加熟练度' }] });
    if (Array.isArray(result))
        result.push({ type: 'BT.group', value: [{ type: 'BT.row', value: [{ type: 'Button', value: '返回店铺', options: { data: shopReturnCommands[context.shop], type: 'command', autoEnter: true } }] }] });
    return result;
};

export { secondaryShopFormatSource, shopReturnCommands };
