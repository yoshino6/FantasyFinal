import { Format, useEvent } from 'alemonjs';

const installedKey = Symbol.for('fantasy-final.group-reply-mention-installed');
let rawFormatCreate = null;
const createFormatWithoutGroupMention = () => (rawFormatCreate ?? Format.create).call(Format);
const installGroupReplyMention = () => {
    const runtime = globalThis;
    if (runtime[installedKey])
        return;
    runtime[installedKey] = true;
    const create = Format.create;
    rawFormatCreate = create;
    Format.create = () => {
        const format = create.call(Format);
        try {
            const [event] = useEvent();
            const { IsPrivate, UserId } = event.current;
            if (!IsPrivate && UserId)
                format.addMention(UserId).addText('\n');
        }
        catch {
        }
        return format;
    };
};

export { createFormatWithoutGroupMention, installGroupReplyMention };
