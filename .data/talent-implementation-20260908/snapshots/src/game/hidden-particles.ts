/** 调配只使用这12种粒子；旧“金元素微尘”沿用物品身份，对应土元素。 */
export const hiddenParticles = [
  { code: 'water_element_dust', name: '水微尘', element: '水', role: '即时恢复' },
  { code: 'fire_element_dust', name: '火微尘', element: '火', role: '爆发与灼烧' },
  { code: 'metal_element_dust', name: '土相微尘', element: '土', role: '护盾与承伤' },
  { code: 'wood_element_dust', name: '木微尘', element: '木', role: '持续再生' },
  { code: 'wind_element_dust', name: '风微尘', element: '风', role: '扩散至多目标' },
  { code: 'ice_element_dust', name: '冰微尘', element: '冰', role: '减速与冻结' },
  { code: 'thunder_element_dust', name: '雷微尘', element: '雷', role: '冲击与眩晕' },
  { code: 'light_element_dust', name: '光微尘', element: '光', role: '净化与护盾' },
  { code: 'dark_element_dust', name: '暗微尘', element: '暗', role: '侵蚀双防' },
  { code: 'energy_ember', name: '能量余烬', element: '奥术', role: '延续与分段释放' },
  { code: 'magic_unit', name: '魔力微弧', element: '奥术', role: '提高伤害' },
  { code: 'blood_residue', name: '血肉残渣', element: '无', role: '提高回复' }
] as const;
export type HiddenParticleCode = typeof hiddenParticles[number]['code'];
export type MixOutcome = 'failure' | 'success' | 'great';
export type MixCatalyst = 'stable' | 'excite' | undefined;
export type MixBranch = { code: HiddenParticleCode; element: string; weight: number; damage: number; heal: number; regeneration: number; shield: number; slow: number; defenseDown: number; burn: number; damageScale: number; healScale: number; stateScale: number; control?: { code: 'freeze' | 'stun'; chance: number } };
export const diminishingParticle = (count: number) => 2 * (1 - 2 ** -Math.max(0, count));
const elemental = new Set(hiddenParticles.slice(0, 9).map(particle => particle.code));
export const validateHiddenParticles = (particles: readonly string[]): HiddenParticleCode[] => {
  if (particles.length < 2 || particles.length > 4 || particles.some(code => !hiddenParticles.some(particle => particle.code === code))) throw new Error('每次调配需要2～4颗有效粒子，每颗各消耗1个。');
  return particles as HiddenParticleCode[];
};
export const hiddenMixProbability = (count: number, catalyst?: MixCatalyst, kettle = false) => {
  if (![2, 3, 4].includes(count)) throw new Error('投料数量必须为2～4颗。');
  let failure = 15 + (count - 2) * 2 - (kettle ? 5 : 0), great = kettle ? 30 : 15;
  if (catalyst === 'stable') { failure = Math.max(2, failure - 10); great = Math.max(5, great - 5); }
  if (catalyst === 'excite') { failure += 10; great += 15; }
  return { failure, success: 100 - failure - great, great };
};
export const rollHiddenMix = (count: number, catalyst?: MixCatalyst, kettle = false, random = Math.random): MixOutcome => {
  const chance = hiddenMixProbability(count, catalyst, kettle), roll = random() * 100;
  return roll < chance.failure ? 'failure' : roll < chance.failure + chance.success ? 'success' : 'great';
};
export const hiddenMix = (input: readonly string[], outcome: MixOutcome = 'success', kettle = false) => {
  const particles = validateHiddenParticles(input), primary = particles[0];
  const counts = Object.fromEntries(hiddenParticles.map(particle => [particle.code, particles.filter(code => code === particle.code).length])) as Record<HiddenParticleCode, number>;
  const count = particles.length, great = outcome === 'great';
  const normalTargets = Math.min(3, 1 + counts.wind_element_dust), targets = Math.min(4, normalTargets + (great && counts.wind_element_dust > 0 ? 1 : 0));
  const normalDuration = 2 + Number(counts.energy_ember >= 1) + Number(counts.energy_ember >= 3), duration = Math.min(4, normalDuration + Number(great));
  const radiusScale = targets ** -.65, growth = [0, 0, 1, 1.12, 1.198][count];
  const arc = counts.magic_unit - Number(primary === 'magic_unit'), blood = counts.blood_residue - Number(primary === 'blood_residue');
  const codes = new Set<HiddenParticleCode>(particles.filter(code => elemental.has(code as typeof hiddenParticles[0]['code'])));
  // 风只在主材时生成自身伤害；余烬、魔弧和残渣优先修改已有通道。
  if (primary === 'energy_ember' || primary === 'magic_unit' || primary === 'blood_residue') codes.add(primary);
  if (primary !== 'wind_element_dust') codes.delete('wind_element_dust');
  const damageElements: HiddenParticleCode[] = ['fire_element_dust', 'ice_element_dust', 'thunder_element_dust', 'dark_element_dust', 'wind_element_dust', 'energy_ember', 'magic_unit'];
  if (counts.magic_unit && ![...codes].some(code => damageElements.includes(code))) codes.add('magic_unit');
  if (counts.blood_residue && ![...codes].some(code => ['water_element_dust', 'wood_element_dust', 'blood_residue'].includes(code))) codes.add('blood_residue');
  const branchCount = codes.size, baseWeight = branchCount === 1 ? 1 : 1 / (branchCount + 1);
  const branches: MixBranch[] = [...codes].sort().map(code => {
    const weight = branchCount === 1 ? 1 : code === primary ? baseWeight * 2 : baseWeight;
    const addition = elemental.has(code as typeof hiddenParticles[0]['code']) ? .16 * diminishingParticle(counts[code] - 1) : 0;
    const damageScale = Math.min(1.9, growth * (1 + addition + .20 * diminishingParticle(arc)));
    const healScale = Math.min(1.9, growth * (1 + addition + .25 * diminishingParticle(blood)));
    const stateScale = Math.min(1.6, growth * (1 + addition));
    const branch: MixBranch = { code, element: hiddenParticles.find(p => p.code === code)!.element, weight, damage: 0, heal: 0, regeneration: 0, shield: 0, slow: 0, defenseDown: 0, burn: 0, damageScale, healScale, stateScale };
    if (code === 'water_element_dust') branch.heal = 12;
    if (code === 'fire_element_dust') { branch.damage = 110; branch.burn = 16; }
    if (code === 'metal_element_dust') branch.shield = 14;
    if (code === 'wood_element_dust') branch.regeneration = 16;
    if (code === 'wind_element_dust') branch.damage = 95;
    if (code === 'ice_element_dust') { branch.damage = 95; branch.slow = 15; }
    if (code === 'thunder_element_dust') branch.damage = 110;
    if (code === 'light_element_dust') branch.shield = 8;
    if (code === 'dark_element_dust') { branch.damage = 90; branch.defenseDown = 12; }
    if (code === 'energy_ember' || code === 'magic_unit') branch.damage = 100;
    if (code === 'blood_residue') branch.heal = 10;
    if ((code === 'ice_element_dust' || code === 'thunder_element_dust') && counts[code] >= 2) branch.control = { code: code === 'ice_element_dust' ? 'freeze' : 'stun', chance: Math.min(great ? 75 : 55, 35 + 10 * diminishingParticle(counts[code] - 2) + (great ? 20 : 0)) * weight };
    return branch;
  });
  const control = branches.some(branch => branch.control);
  const mana = [0, 0, 90, 145, 205][count] + 25 * (branchCount - 1) + 30 * (normalTargets - 1) + 15 * (normalDuration - 2) + 25 * Number(control) + (kettle ? 160 : 0);
  const cooldown = kettle ? 6 : count - 1 + Number(normalTargets > 1) + Number(control);
  return { primary, particles, counts, branches, targets, normalTargets, duration, normalDuration, mana, cooldown, radiusScale, outcome,
    numericScale: (great ? 2 : 1) * (kettle ? 1.25 : 1), stateScale: (great ? 1.5 : 1) * (kettle ? 1.25 : 1), failureDamageScale: outcome === 'failure' ? .35 : 1,
    healCap: great ? 40 : 24, shieldCap: great ? 40 : 28, slowCap: great ? 45 : 30, defenseCap: great ? 40 : 30 };
};

/** V和扩散乘区均在防御结算后，不能提前扩大系数而获得平方收益。 */
export const hiddenBranchDamage = (mix: ReturnType<typeof hiddenMix>, branch: MixBranch, magic: number, defense: number) => {
  const attack = Math.max(0, magic) * branch.damage / 100;
  return attack ? attack ** 2 / (attack + Math.max(0, defense)) * branch.weight * branch.damageScale * mix.radiusScale * mix.numericScale * mix.failureDamageScale : 0;
};
export const hiddenBranchHealing = (mix: ReturnType<typeof hiddenMix>, branch: MixBranch, hpMax: number) => hpMax * (branch.heal + branch.regeneration) / 100 * branch.weight * branch.healScale * mix.radiusScale * mix.numericScale;
