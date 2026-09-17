import { Format, useEvent, useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { folioTargetView, saveFolioTargets } from '../game/folio-target.service';
import { messageFormat } from '../game/message';
export const folioTargetFormat = async (user: string, slot: number, chosen?: number[]) => {
    const view = await folioTargetView(user, slot);
    if (!view)
        return null;
    const ids = chosen ?? [view.primary, ...view.pool.filter(t => t.id !== view.primary).map(t => t.id)].filter((v): v is number => Boolean(v)).slice(0, view.skill.targetCount);
    const md = Format.createMarkdown().addTitle(view.skill.name + ' · 选择目标').addNewline().addNewline().addText('首位为主目标，目标退场不自动补打。点击可增删，最后确认。\n\n');
    for (const t of view.pool) {
        const next = ids.includes(t.id) ? ids.filter(id => id !== t.id) : [...ids, t.id].slice(-view.skill.targetCount);
        md.addButton((ids.includes(t.id) ? '✓ ' : '') + t.name, { data: '/战技目标 ' + slot + ' ' + (next.join(',') || '-'), autoEnter: false }).addNewline();
    }
    md.addText('\n已选：' + ids.map(id => view.pool.find(t => t.id === id)?.name).join(' → ') + '\n');
    if (ids.length)
        md.addButton('确认释放', { data: '/确认战技目标 ' + slot + ' ' + ids.join(',') + ' ' + view.battle.turn + ' ' + view.battle.sessionId, autoEnter: false });
    return Format.create().addMarkdown(md);
};
export default async () => { const [e] = useEvent(); const [r] = useRoute(); const [m] = useMessage(); try {
    const ids = String(r.param('ids') ?? '');
    const f = await folioTargetFormat(e.current.UserId, Number(r.param('slot')), ids === '-' ? [] : ids ? ids.split(',').map(Number) : undefined);
    if (f)
        await m.send({ format: f });
}
catch (error) {
    await m.send({ format: messageFormat('选择目标', (error as Error).message) });
} };
export const confirm = async () => { const [e] = useEvent(); const [r] = useRoute(); const [m] = useMessage(); try {
    const slot = Number(r.param('slot'));
    const result = await saveFolioTargets(e.current.UserId, slot, String(r.param('ids')).split(',').map(Number), Number(r.param('turn')), String(r.param('session')));
    await (await import('./adventure')).sendCombatResult(m, e.current.UserId, result);
}
catch (error) {
    await m.send({ format: messageFormat('释放技能', (error as Error).message) });
} };
