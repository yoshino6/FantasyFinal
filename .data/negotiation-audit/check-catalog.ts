import { readFileSync, writeFileSync } from 'node:fs';
import { classifyNegotiationItem } from '../../src/game/negotiation-item-policy';
import { monsterNegotiationProfile } from '../../src/config/monster-negotiation';
const catalog = JSON.parse(readFileSync('.data/negotiation-audit/catalog.json', 'utf8'));
const groups: Record<string, string[]> = {};
for (const monster of catalog.monsters) {
  const profile = monsterNegotiationProfile(monster.code, monster.name);
  (groups[profile.family] ??= []).push(`${monster.code} ${monster.name}`);
}
console.log(JSON.stringify(groups, null, 2));
const counts: Record<string, number> = {};
const classified = catalog.items.map((item: any) => { const policy = classifyNegotiationItem(item); const key = `${policy.usable ? '可用' : '禁止'}:${policy.subtype}:${policy.reason}`; counts[key] = (counts[key] ?? 0) + 1; return { code: item.code, name: item.name, ...policy }; });
console.log(JSON.stringify(counts));
writeFileSync('.data/negotiation-audit/classification.json', JSON.stringify(classified, null, 2));
