import { Format } from 'alemonjs';

const warrantNoticeFormat = (wanted, options = {}) => {
    const { independent = false, passive = false } = options;
    const markdown = Format.createMarkdown().addTitle('城镇通缉').addNewline().addNewline()
        .addText(`不法分子【${wanted.name}】${passive ? '正位于' : '进入'}${wanted.regionName}！`).addNewline()
        .addText(`坐标：（${wanted.x}, ${wanted.y}）`);
    const buttons = Format.createButtonGroup().addRow()
        .addButton('前往', `/前往 ${wanted.x} ${wanted.y}`, { type: 'command', autoEnter: true, style: 'blue' });
    const format = independent ? new Format() : Format.create();
    return format.addMarkdown(markdown).addButtonGroup(buttons);
};

export { warrantNoticeFormat };
