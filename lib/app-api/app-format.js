const mdNodeToText = (node) => {
    const value = node.value;
    switch (node.type) {
        case 'MD.title':
            return `【${String(value ?? '')}】\n`;
        case 'MD.subtitle':
            return `— ${String(value ?? '')} —\n`;
        case 'MD.text':
        case 'MD.content':
            return String(value ?? '');
        case 'MD.bold':
            return `**${String(value ?? '')}**`;
        case 'MD.italic':
            return `*${String(value ?? '')}*`;
        case 'MD.strikethrough':
            return `~~${String(value ?? '')}~~`;
        case 'MD.blockquote':
            return `> ${String(value ?? '').replace(/\r?\n/g, '\n> ')}`;
        case 'MD.code':
            return `\`${String(value ?? '')}\``;
        case 'MD.link':
            return String(value?.text ?? '');
        case 'MD.image':
            return value ? `[图片]` : '';
        case 'MD.mention':
            return `@${String(value ?? '')}`;
        case 'MD.list':
            return Array.isArray(value) ? value.map(item => `- ${String(item)}`).join('\n') : '';
        case 'MD.newline':
            return '\n';
        case 'MD.divider':
            return '\n——————————\n';
        default:
            return '';
    }
};
const markdownToText = (nodes) => {
    if (!Array.isArray(nodes))
        return '';
    return nodes.map(node => {
        const item = node;
        if (Array.isArray(item.value))
            return markdownToText(item.value);
        return mdNodeToText(item);
    }).join('');
};
const formatValueToText = (formatValue) => {
    if (!Array.isArray(formatValue))
        return '';
    const parts = formatValue.map(node => {
        const item = node;
        if (item.type === 'Text')
            return String(item.value ?? '');
        if (item.type === 'Markdown')
            return markdownToText(item.value);
        if (item.type === 'MarkdownOriginal')
            return String(item.value ?? '');
        if (item.type === 'Image')
            return item.value ? '[图片]' : '';
        if (item.type === 'BT.group')
            return '';
        return '';
    });
    return parts
        .join('')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};
const commandFrom = (options, fallback) => {
    const data = options?.data;
    if (typeof data === 'string' && data.trim())
        return data.trim();
    return String('').trim();
};
const formatValueToButtons = (formatValue) => {
    if (!Array.isArray(formatValue))
        return [];
    const buttons = [];
    const visit = (value) => {
        if (!Array.isArray(value))
            return;
        for (const node of value) {
            const item = node;
            if (item.type === 'BT.group' || item.type === 'BT.row') {
                visit(item.value);
                continue;
            }
            if (item.type === 'Button') {
                const command = commandFrom(item.options);
                if (command)
                    buttons.push({ label: String(item.value ?? '按钮'), command });
                continue;
            }
            if (item.type === 'MD.button') {
                const command = commandFrom(item.options);
                if (command)
                    buttons.push({ label: String(item.value ?? '按钮'), command });
                continue;
            }
            if (item.type === 'Markdown' || item.type === 'MD.row')
                visit(item.value);
        }
    };
    visit(formatValue);
    return buttons;
};
const formatToAppMessage = (format, petReply) => ({
    text: formatValueToText(format.value),
    buttons: formatValueToButtons(format.value),
    petReply
});
const plainAppMessage = (text, buttons = [], petReply) => ({
    text: text.trim(),
    buttons,
    petReply
});

export { formatToAppMessage, formatValueToButtons, formatValueToText, plainAppMessage };
