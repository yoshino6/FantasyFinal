import { Format, useEvent, useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { leafRouteAction, leafRouteView } from '../game/leaf-route.service';
import { messageFormat } from '../game/message';
import {leafRouteScenes} from '../game/leaf-route.config';
export const leafRouteFormat = async (user: string) => {
    const v = await leafRouteView(user), md = Format.createMarkdown().addTitle('风从未寄达的地方 · ' + v.stage + '/12').addNewline().addNewline().addText(v.scene.title + '\n\n');
    for (const paragraph of v.scene.text.split(/\r?\n\r?\n/))
        md.addBlockquote(paragraph.replace(/\r?\n/g, '\n> ')).addNewline().addNewline();
    if (v.claimed)
        md.addText('已结案，个人航路许可已生效。');
    else {
        md.addText('地点：' + v.point.region + '（' + [v.point.x, v.point.y, v.point.z].join(',') + '）\n');
        const steps: Record<number, string[]> = { 3: ['第一处风标', '第二处风标', '第三处风标'], 5: ['检查承重榫', '扶正风叶', '对齐铃片'], 7: ['校准青色回音', '校准黄色回音', '校准白色回音'], 10: ['排除铃片故障', '理顺测风绳', '确认登舱'] };
        md.addText('当前：' + (steps[v.stage]?.[v.work] ?? ([4, 8].includes(v.stage) && !v.work ? '进入任务战斗' : '完成本幕交接')) + '\n\n');
        md.addButton('前往本幕地点', { data: '/前往 ' + [v.point.x, v.point.y, v.point.z].join(' '), autoEnter: false }).addText('　').addButton('确认推进', { data: '/航路推进 continue ' + v.revision, autoEnter: false });
        if (v.stage >= 11 && !v.atLeaf)
            md.addNewline().addButton('凭临时船票接驳', { data: '/航路推进 board ' + v.revision, autoEnter: false });
    }
    if (v.atLeaf)
        md.addNewline().addButton('安全返回世界树', { data: '/航路推进 return ' + v.revision, autoEnter: false });
    md.addNewline().addButton('战斗面板', { data: '/战斗', autoEnter: false }).addText('　').addButton('补领地面通行地图', { data: '/初行服务 map_reclaim', autoEnter: false });
    md.addNewline().addButton('队伍管理', {data:'/队伍',autoEnter:false});
    if(v.started)md.addText('　').addButton('回顾航务记录',{data:'/航路回顾 1',autoEnter:false});
    return Format.create().addMarkdown(md);
};
export default async () => { const [e] = useEvent(); const [m] = useMessage(); try {
    await m.send({ format: await leafRouteFormat(e.current.UserId) });
}
catch (error) {
    await m.send({ format: messageFormat('航路任务', (error as Error).message) });
} };
export const review=async()=>{
    const[e]=useEvent();const[r]=useRoute();const[m]=useMessage();
    try{
        const v=await leafRouteView(e.current.UserId),stage=Number(r.param('stage'));
        if(!v.started||!Number.isInteger(stage)||stage<1||stage>v.stage)throw Error('只能回顾已经抵达的剧情幕。');
        const scene=stage===v.stage?v.scene:leafRouteScenes[stage-1];
        const md=Format.createMarkdown().addTitle('航务回顾 · '+stage+'/12').addNewline().addNewline().addText(scene.title+'\n\n');
        for(const paragraph of scene.text.split(/\r?\n\r?\n/))md.addBlockquote(paragraph.replace(/\r?\n/g,'\n> ')).addNewline().addNewline();
        if(stage>1)md.addButton('上一幕',{data:'/航路回顾 '+(stage-1),autoEnter:false}).addText('　');
        if(stage<v.stage)md.addButton('下一幕',{data:'/航路回顾 '+(stage+1),autoEnter:false}).addText('　');
        md.addButton('当前进度',{data:'/浮叶航路',autoEnter:false});
        await m.send({format:Format.create().addMarkdown(md)});
    }catch(error){await m.send({format:messageFormat('航务回顾',(error as Error).message)});}
};
export const advance = async () => { const [e] = useEvent(); const [r] = useRoute(); const [m] = useMessage(); try {
    const text = await leafRouteAction(e.current.UserId, String(r.param('action')), Number(r.param('revision')));
    await m.send({ format: messageFormat('航务记录', text) });
    await m.send({ format: await leafRouteFormat(e.current.UserId) });
}
catch (error) {
    await m.send({ format: messageFormat('航路任务', (error as Error).message) });
} };
export const anchor = async () => { const [e] = useEvent(); const [m] = useMessage(); try {
    const result = await (await import('../game/adventure.service')).combatAction(e.current.UserId, 'anchor');
    await (await import('./adventure')).sendCombatResult(m, e.current.UserId, result);
}
catch (error) {
    await m.send({ format: messageFormat('重新锚定', (error as Error).message) });
} };
