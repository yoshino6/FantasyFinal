import { nativeSkillBalance } from '../src/game/combat-skill-balance.config';
import { residentSkills } from '../src/game/resident-skill.config';
import { folioSkills } from '../src/game/active-folio-skills.config';
import { hiddenSkills } from '../src/game/hidden-profession.config';
import { advancedSkillDescriptions } from '../src/game/advanced-resource.config';
import { activeDeviceDefinitions } from '../src/game/device.service';
import { automatonSkills } from '../src/game/automaton-skill-catalog';

const out: unknown[] = [];
for (const s of nativeSkillBalance) if (s.scope === '全体') out.push({ src: 'native', code: s.code, tier: s.tier, mana: s.mana, cd: s.cooldown, power: s.power, chant: s.chant, name: s.name ?? '', desc: s.description ?? '' });
for (const s of residentSkills) if (s.scope === 'enemies' || s.scope === 'allies') out.push({ src: 'resident', code: s.code, id: s.id, tier: s.tier, mana: s.mana, cd: s.cooldown, power: s.power, chant: s.chant, name: s.name, desc: s.description });
for (const s of folioSkills) if (s.scope === 'enemies' || s.scope === 'allies') out.push({ src: 'folio', code: s.code, id: s.id, tier: s.tier, mana: s.mana, cd: s.cooldown, power: s.power, chant: s.chant, name: s.name, desc: s.description });
for (const s of hiddenSkills) if (/全体|全队|敌方/.test(s.description)) out.push({ src: 'hidden', code: s.code, tier: s.tier, mana: s.mana, cd: s.cooldown, power: s.power, name: s.name, desc: s.description });
for (const [code, desc] of Object.entries(advancedSkillDescriptions)) if (/全体|全队|敌方/.test(desc)) out.push({ src: 'advanced', code, tier: '中位', desc });
for (const d of activeDeviceDefinitions) for (const s of d.skills) if (s.targetScope === 'all_enemies' || s.targetScope === 'all_allies' || /全体/.test(s.description)) out.push({ src: 'device', device: d.code, code: s.code, name: s.name, energy: s.energyCost, cd: s.cooldownTurns, power: s.power, effect: s.effect, desc: s.description });
for (const s of automatonSkills) if (/全体|全队|敌人|友方/.test(s.description)) out.push({ src: 'automaton', code: s.code, name: s.name, kind: s.kind, rarity: s.rarity, cost: s.cost, desc: s.description });
console.log('COUNT=' + out.length);
console.log(JSON.stringify(out, null, 1));
