/** Design-time compiler only. Runtime imports the generated TypeScript, never reads the design documents. */
import { readFileSync, writeFileSync } from 'node:fs';
import type { OpeningRoute, OpeningChoice, OpeningPage, OpeningBranch } from '../src/game/opening.types';

const read = (name: string) => readFileSync(`docs/${name}.md`, 'utf8').replace(/\r/g, '');
const v3 = read('六地图奇幻开局与神界世界线重设计V3');
const v2 = read('其他地图初始路线完整剧情脚本V2');
const v1 = read('多地图开局、神技恩赐与随从系统设计方案V1');
const regions: Record<string, string> = { F: 'dark_forest', M: 'worldtree_meadow', R: 'morningdew_riverbank', S: 'gravelwind_shore', D: 'dark_forest_deep', H: 'ridge_foothills', I: 'rediron_pass', W: 'mistalgae_marsh', A: 'fallenstar_swamp', C: 'frostcrown_plateau', T: 'thundercliff', E: 'eclipse_ruins', B: 'baina_town', Y: 'world_tree' };
const blocks = (text: string) => [...text.matchAll(/^### ([A-Z]\d{2}) (.+)\n([\s\S]*?)(?=^### [A-Z]\d{2} |^## |$(?![\s\S]))/gm)];
const quoted = (text: string) => text.split('\n').filter(line => line.startsWith('>')).map(line => line.replace(/^> ?/, '')).join('\n').trim();
const pages = (title: string, text: string): OpeningPage[] => {
  const parts = text.split(/\n\n+/).filter(Boolean); const result: OpeningPage[] = []; let current = '';
  for (const part of parts) { if (current && current.length + part.length > 330) { result.push({ title, text: current }); current = ''; } current += (current ? '\n\n' : '') + part; }
  if (current) result.push({ title, text: current });
  return result;
};
const choiceLabels = (text: string) => [...text.matchAll(/(?:选择：|；|\n- )?([ABC]) `([^`]+)`/g)].map(m => ({ code: m[1] as OpeningBranch, label: m[2] }));
const uniqueLabels = (text: string) => [...new Map(choiceLabels(text).map(value => [value.code, value])).values()];
const rewardRows = new Map([...v3.matchAll(/^\| ([A-Z]\d{2}-[ABC]) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)].map(m => [m[1], { name: m[2].trim(), use: m[3].trim(), future: m[4].trim() }]));
const routes: OpeningRoute[] = [];

for (const match of blocks(v3)) {
  const [, code, title, text] = match;
  const beforeChoice = text.split(/^选择：/m)[0];
  const intro = quoted(beforeChoice);
  const transition = beforeChoice.match(/^\*\*(?:转折|意外)。\*\*(.+)$/m)?.[1]?.trim();
  // Explanatory transition paragraphs carry indispensable plot context, unlike editorial notes after choices.
  let opening = intro;
  if (transition) {
    const index = beforeChoice.indexOf(`**${beforeChoice.includes('**转折。**') ? '转折' : '意外'}。**`);
    opening = [quoted(beforeChoice.slice(0, index)), transition, quoted(beforeChoice.slice(index))].filter(Boolean).join('\n\n');
  }
  const tail = text.slice(Math.max(text.indexOf('**抵达与主线。**'), text.indexOf('**落脚与主线。**'), text.indexOf('**落脚主线。**')));
  const branchStarts = [...text.matchAll(/^\*\*([ABC])·([^*]+)\*\*/gm)];
  const labels = uniqueLabels(text.split(branchStarts[0]?.[0] ?? '\u0000')[0]);
  const commonQuest = tail.match(/(?:任务|完成)[《]([^》]+)》/)?.[1] ?? title;
  const choices: OpeningChoice[] = labels.map(label => {
    const i = branchStarts.findIndex(m => m[1] === label.code); const start = branchStarts[i];
    const branchText = text.slice(start.index! + start[0].length, branchStarts[i + 1]?.index ?? text.indexOf(tail));
    const reward = rewardRows.get(`${code}-${label.code}`)!;
    if (!reward) throw new Error(`Missing reward ${code}-${label.code}`);
    const taskMatch = tail.match(new RegExp(`${label.code}《([^》]+)》([^；。]+)`));
    return { ...label, pages: pages(start[2].replace(/[。.]$/, ''), quoted(branchText)), quest: taskMatch?.[1] ?? commonQuest,
      task: taskMatch?.[2]?.trim() ?? '与接引人完成本次见闻和安全教学交接', farewell: quoted(tail.split('**更替后版本')[0]),
      rewardCode: `opening_${code.toLowerCase()}_${label.code.toLowerCase()}`, rewardName: reward.name, rewardUse: reward.use, future: reward.future };
  });
  const destination = code === 'M01' ? 'floating_leaf_town' : code === 'C02' ? 'frost_dragon_inn' : code.startsWith('C') ? 'snowlamp_hollow' : code === 'T03' ? 'sleepwhale_market' : 'world_tree';
  routes.push({ code, version: 3, title, region: regions[code[0]], destination,
    moveEntry: text.match(/^- \*\*首次移动：\*\*(.+)$/m)?.[1] ?? '', huntEntry: text.match(/^- \*\*首次寻怪：\*\*(.+)$/m)?.[1] ?? '',
    pages: pages(title, opening), choices, arrival: [] });
}
for (const match of blocks(v2)) {
  const [, code, title, text] = match;
  if (routes.some(route => route.code === code)) continue;
  const heads = [...text.matchAll(/^\*\*第 ([1-5]) 页·([^*]+)\*\*/gm)];
  const section = (page: string, branch?: string) => heads.filter(h => h[1] === page && (!branch || h[2].includes(`选择 ${branch}`))).map(h => text.slice(h.index! + h[0].length, heads[heads.indexOf(h) + 1]?.index ?? text.length)).join('\n');
  const labels = uniqueLabels(section('2')); const end = text.match(/^入门动作：(.+)$/m)?.[1] ?? '';
  const settlement = text.match(/^结算：(.+)$/m)?.[1] ?? '';
  const quests = [...settlement.matchAll(/《([^》]+)》/g)].map(m => m[1]);
  const choices = labels.map((label, i): OpeningChoice => ({ ...label, pages: pages(title, quoted(section('3', label.code))),
    quest: quests[i] ?? quests[0] ?? title, task: end.match(new RegExp(`${label.code} ([^；。]+)`))?.[1] ?? '完成接引人的安全教学', farewell: end.split('完成台词：')[1] ?? '',
    rewardCode: `opening_${code.toLowerCase()}_${label.code.toLowerCase()}`, rewardName: '初行补给', rewardUse: '公会核验后的初行补给', future: title,
    pack: settlement.match(new RegExp(`${label.code} (R[医食匠商探契艺守])`))?.[1] ?? 'R探' }));
  const entry = quoted(text.slice(0, heads[0]?.index));
  routes.push({ code, version: 2, title, region: regions[code[0]], destination: ['D', 'B'].includes(code[0]) ? 'baina_town' : 'world_tree',
    moveEntry: entry, huntEntry: entry, pages: pages(title, [quoted(section('1')), quoted(section('2'))].join('\n\n')), choices,
    arrival: pages(title, [quoted(section('4')), quoted(section('5'))].join('\n\n')) });
}
// The three forest routes have a distinct treatment/companion sequence; their exact script is curated separately.
if (routes.length !== 39 || routes.some(r => !r.pages.length || r.choices.length < 2 || r.choices.some(c => !c.pages.length))) throw new Error('Incomplete opening script');
const divine = [...v1.matchAll(/^\| (G\d{2}) ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)].map(m => ({ code: `divine_${m[1].toLowerCase()}`, number: m[1], name: m[2].trim(), summary: m[3].trim(), description: m[4].trim() }));
if (divine.length !== 18) throw new Error('Incomplete divine skills');
writeFileSync('src/game/opening-content.generated.ts', `// Generated by scripts/generate-opening-content.ts. Edit the design or curated opening-content.ts, then regenerate.\nimport type { OpeningRoute } from './opening.types';\nexport const generatedOpeningRoutes: OpeningRoute[] = ${JSON.stringify(routes, null, 2)};\nexport const divineSkillDefinitions = ${JSON.stringify(divine, null, 2)} as const;\n`);
console.log(JSON.stringify({ routes: routes.length, branches: routes.reduce((n, r) => n + r.choices.length, 0), divine: divine.length }));
