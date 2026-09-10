import { Format } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message.js';

const traitDescriptions = [
    ['普通', '生命×3.2，其余属性不变', '经验+0%，掉率+0%'],
    ['强大', '生命×4，韧性×1.2，其余属性×1.1', '经验+20%，掉率+10%'],
    ['英雄', '生命×4.8，韧性×1.3，其余属性×1.2', '经验+30%，掉率+20%'],
    ['深渊', '生命×6.4，韧性×1.5，其余属性×1.35', '经验+50%，掉率+40%'],
    ['地狱', '生命×8，韧性×1.8，其余属性×1.5', '经验+80%，掉率+60%'],
    ['猩红', '生命×8，韧性×2；物攻、魔攻、命中、暴击、暴伤属性×2，其余属性×1.5', '经验+100%，掉率+80%'],
    ['腐化', '生命×8，韧性×3；物防、魔防、暴免、暴抗属性×2.5，其余属性×1.5', '经验+100%，掉率+80%'],
    ['神圣', '生命×12，韧性×3，闪避×2.5，其余属性×1.5', '经验+100%，掉率+80%'],
    ['黄金', '生命×9.6，韧性×5，闪避×2.5，其余属性×1.6', '经验+150%，掉率+100%'],
    ['璀璨', '生命×11.2，韧性×10，闪避×2.5，其余属性×1.8', '经验+250%，掉率+250%'],
    ['梦幻', '生命×12.8，韧性×20，闪避×2.5，其余属性×2', '经验+600%，掉率+600%']
];
var bossTrait = async () => {
    const [message] = useGameMessage();
    const markdown = Format.createMarkdown().addTitle('BOSS词条说明').addNewline().addNewline();
    traitDescriptions.forEach(([name, attributes, rewards], index) => {
        markdown.addText(`【${name}】`).addNewline()
            .addBlockquote(attributes).addNewline()
            .addBlockquote(rewards);
        if (index < traitDescriptions.length - 1)
            markdown.addNewline().addNewline();
    });
    await message.send({ format: Format.create().addMarkdown(markdown) });
};

export { bossTrait as default };
