import { useMessage, Format, ResultCode, useEvent, useRoute, logger } from 'alemonjs';
import { acknowledgeAutomatonBattleText, reserveDailyAutomaton, finishDailyAutomaton } from './automaton-dialogue.service.js';
import { automatonBattleInteractionText, automatonInteractionText } from './automaton-dialogue.js';
import { secondaryShopFormatSource } from './secondary-shop-format.js';
import { AsyncLocalStorage } from 'node:async_hooks';

const mutedAutomatonInteractions = new AsyncLocalStorage();
const withoutAutomatonInteractions = (message) => ({ ...message, send(params) {
        const original = Array.isArray(params) ? params : params?.format instanceof Format ? params.format.value : params?.format;
        const split = separateAutomatonBattleQuotes(original);
        const quiet = split.quotes.length ? (Array.isArray(params) ? split.source : { ...params, format: split.source }) : params;
        return mutedAutomatonInteractions.run(true, () => message.send(quiet));
    } });
const separateAutomatonBattleQuotes = (source) => {
    const quotes = [];
    const visit = (value) => {
        if (Array.isArray(value))
            return value.map(visit);
        if (!value || typeof value !== 'object')
            return value;
        const node = value;
        if (typeof node.value === 'string' && ['Text', 'MarkdownOriginal', 'MD.text', 'MD.blockquote', 'MD.code'].includes(node.type ?? '')) {
            const lines = node.value.split(/\r?\n/).filter(line => {
                if (!/^(?:\u2063[【〖][^\r\n]+[】〗]|【[^\r\n]+（机巧）】)「[^\r\n]+」$/.test(line))
                    return true;
                const quote = line.replace(/^\u2063/, '');
                if (!quotes.includes(quote))
                    quotes.push(quote);
                return false;
            });
            return { ...node, value: lines.join('\n') };
        }
        return Array.isArray(node.value) ? { ...node, value: visit(node.value) } : value;
    };
    return { source: visit(source), quotes };
};
const useGameMessage = (eventArg) => {
    const [message] = useMessage(eventArg);
    return [{ ...message, async send(params) {
                const original = Array.isArray(params) ? params : params?.format instanceof Format ? params.format.value : params?.format;
                const shopSource = secondaryShopFormatSource(original);
                const split = separateAutomatonBattleQuotes(shopSource);
                if (split.quotes.length || shopSource !== original)
                    params = (Array.isArray(params) ? split.source : { ...params, format: split.source });
                const results = await message.send(params);
                if (!results.length || !results.every(r => r.code === ResultCode.Ok))
                    return results;
                if (mutedAutomatonInteractions.getStore())
                    return results;
                try {
                    const [event] = useEvent(eventArg), [route] = useRoute();
                    const user = event.current.UserId;
                    if (!user)
                        return results;
                    for (const quote of split.quotes) {
                        const sent = await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addText(automatonBattleInteractionText(quote))) });
                        if (sent.length && sent.every(r => r.code === ResultCode.Ok))
                            await acknowledgeAutomatonBattleText(user, quote);
                    }
                    const daily = route.matched ? await reserveDailyAutomaton(user, Boolean(event.current.IsPrivate)) : null;
                    if (daily) {
                        const sent = await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addText(automatonInteractionText(daily.name, daily.text))) });
                        if (sent.length && sent.every(r => r.code === ResultCode.Ok))
                            await finishDailyAutomaton(daily, true);
                        else if (sent.length && sent.every(r => r.code !== ResultCode.Ok))
                            await finishDailyAutomaton(daily, false);
                    }
                }
                catch (error) {
                    logger.warn({ err: error }, '游戏回复已发送，机巧互动消息暂未送达');
                }
                return results;
            } }];
};

export { separateAutomatonBattleQuotes, useGameMessage, withoutAutomatonInteractions };
