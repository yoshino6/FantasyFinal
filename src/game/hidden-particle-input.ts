import { hiddenParticles, type HiddenParticleCode } from './hidden-particles';

const aliases = new Map<string, HiddenParticleCode>();
for (const [index, particle] of hiddenParticles.entries()) {
  for (const name of [particle.code, particle.name, ...(index < 9 ? [particle.element, `${particle.element}粒子`, `${particle.element}元素微尘`] : [])]) aliases.set(name, particle.code);
}
for (const [name, code] of Object.entries({余烬:'energy_ember',魔弧:'magic_unit',微弧:'magic_unit',血肉:'blood_residue',残渣:'blood_residue'})) aliases.set(name, code as HiddenParticleCode);

/** QQ 连点可能夹入机器人提及和完整命令；仅去掉已知包装，不吞掉未知选材。 */
export const parseHiddenParticleInput = (input: string, code: string, revision?: number): HiddenParticleCode[] => {
  let text = input
    .replace(/<@!?[^>]+>|\[CQ:at,[^\]]+\]|<qqbot-at-user\b[^>]*\/?\s*>/gi, ' ')
    .replace(/[@＠][^\s/／!！#＃,，、+＋;；|<>@＠]*/g, ' ');
  text = text.replace(/[/／!！#＃]?隐藏战技\s+(\S+)\s+(\d+)\s+(particle|particles)(?=\s|$)/g, (_match, otherCode: string, otherRevision: string) => {
    if (otherCode !== code || Number(otherRevision) !== revision) throw new Error('混入了其他技能或旧面板的选择，请清空输入框后从当前面板重新选材。');
    return ' ';
  });
  const tokens = text.split(/[\s,，、+＋;；|/／]+/).filter(Boolean);
  if (!tokens.length || tokens.length > 4) throw new Error('请一次选择1～4颗粒子；完整调配需要2～4颗。');
  return tokens.map(token => {
    const particle = aliases.get(token);
    if (!particle) throw new Error(`无法识别粒子「${token}」，请用粒子按钮或以空格分隔粒子名称。`);
    return particle;
  });
};
