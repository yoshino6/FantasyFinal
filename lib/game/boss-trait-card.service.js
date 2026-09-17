import sharp from 'sharp';
import { level32BossDifficultyTraits } from './level32-boss-difficulty.config.js';

const escapeXml = (value) => String(value ?? '').replace(/[<>&'\"]/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[character]));
const tierName = (name) => name.replace(/的$/, '');
const bossTraitStrengthLabel = (value) => {
    if (value <= 1.15)
        return '很低';
    if (value <= 1.35)
        return '较低';
    if (value <= 1.50)
        return '低';
    if (value <= 1.75)
        return '略低';
    if (value <= 2.25)
        return '中';
    if (value <= 3.00)
        return '略高';
    if (value <= 4.00)
        return '较高';
    if (value <= 6.00)
        return '高';
    if (value <= 10.00)
        return '很高';
    return '极高';
};
const bossRewardStrengthLabel = (value) => {
    if (value <= 40)
        return '很低';
    if (value <= 70)
        return '较低';
    if (value <= 100)
        return '低';
    if (value <= 150)
        return '略低';
    if (value <= 220)
        return '中';
    if (value <= 320)
        return '略高';
    if (value <= 500)
        return '较高';
    if (value <= 700)
        return '高';
    if (value <= 900)
        return '很高';
    return '极高';
};
const accents = {
    infernal: ['#65b7ff', '#8fd8ff'], abyssal: ['#7b8dff', '#aaa7ff'], crimson: ['#ff5d78', '#ff9a86'],
    corrupted: ['#9e63dc', '#d18df2'], holy: ['#f2d37a', '#fff1b1'], golden: ['#eebd4c', '#ffe28a'],
    brilliant: ['#65e3dd', '#b5fff2'], dreamlike: ['#cf85ff', '#80c9ff']
};
const wrapText = (value, limit = 38) => {
    const characters = [...value];
    const lines = [];
    for (let index = 0; index < characters.length; index += limit)
        lines.push(characters.slice(index, index + limit).join(''));
    return lines.length ? lines : ['暂无说明'];
};
const statTile = (x, y, label, value, accent) => `
  <rect x="${x}" y="${y}" width="258" height="94" rx="18" fill="#10244c" fill-opacity=".74" stroke="#d8ebff" stroke-opacity=".16"/>
  <rect x="${x}" y="${y}" width="5" height="94" rx="2.5" fill="${accent}"/>
  <text x="${x + 24}" y="${y + 34}" class="stat-label">${escapeXml(label)}</text>
  <text x="${x + 24}" y="${y + 72}" class="stat-value">${escapeXml(bossTraitStrengthLabel(value))}</text>`;
const effectMarkup = (effects, startY, accent) => (effects.length ? effects : ['本场没有附加随机特殊效果。']).map((effect, index) => {
    const matched = /^【([^】]+)】(.*)$/.exec(effect);
    const title = matched?.[1] ?? (effects.length ? '特殊效果' : '稳定词条');
    const description = matched?.[2] ?? effect;
    const lines = wrapText(description);
    const y = startY + index * 114;
    return `<rect x="54" y="${y}" width="1092" height="96" rx="18" fill="#10244c" fill-opacity=".70" stroke="#d8ebff" stroke-opacity=".16"/>
    <circle cx="82" cy="${y + 31}" r="6" fill="${accent}"/><text x="102" y="${y + 38}" class="effect-title">${escapeXml(title)}</text>
    ${lines.slice(0, 2).map((line, lineIndex) => `<text x="102" y="${y + 68 + lineIndex * 23}" class="effect-text">${escapeXml(line)}</text>`).join('')}`;
}).join('');
const bossTraitCardSvg = ({ bossName, difficultyCode, effects }) => {
    const trait = level32BossDifficultyTraits[difficultyCode];
    const [accent, secondary] = accents[difficultyCode];
    const stats = trait.statMultipliers;
    const entries = [
        ['最大生命', stats.hp], ['物理 / 魔法攻击', stats.physicalAttack], ['物理 / 魔法防御', stats.physicalDefense], ['命中', stats.accuracy],
        ['闪避', stats.evasion], ['暴击', stats.critRate], ['暴击伤害', stats.critDamage], ['暴击免疫', stats.critResist],
        ['暴击伤害抗性', stats.critReduction], ['韧性', stats.tenacity], ['速度', stats.speed], ['MP / 破韧 / 感知', trait.statMultiplier]
    ];
    const effectsY = 790;
    const height = effectsY + Math.max(1, effects.length) * 114 + 92;
    const statMarkup = entries.map(([label, value], index) => statTile(54 + index % 4 * 278, 250 + Math.floor(index / 4) * 112, label, value, accent)).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="${height}" viewBox="0 0 1200 ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#07162f"/><stop offset=".52" stop-color="#173768"/><stop offset="1" stop-color="#4b2f6c"/></linearGradient>
    <radialGradient id="light" cx="83%" cy="4%" r="78%"><stop stop-color="${secondary}" stop-opacity=".36"/><stop offset=".46" stop-color="${accent}" stop-opacity=".10"/><stop offset="1" stop-color="#07162f" stop-opacity="0"/></radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#f8fbff"/><stop offset="1" stop-color="${secondary}"/></linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <style>
      .eyebrow{font-family:'Segoe UI','Microsoft YaHei',sans-serif;fill:#b8d3f6;font-size:16px;font-weight:700;letter-spacing:4px}.title{font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif;fill:url(#title);font-size:42px;font-weight:700}.subtitle{font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif;fill:#c8daf3;font-size:19px}.badge{font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif;fill:#fff;font-size:19px;font-weight:700}.section{font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif;fill:#f5f9ff;font-size:25px;font-weight:700}.stat-label{font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif;fill:#abc7e9;font-size:17px}.stat-value{font-family:'Segoe UI','Microsoft YaHei',sans-serif;fill:#fff;font-size:27px;font-weight:700}.reward-label{font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif;fill:#b6cdef;font-size:17px}.reward-value{font-family:'Segoe UI','Microsoft YaHei',sans-serif;fill:#fff;font-size:31px;font-weight:700}.effect-title{font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif;fill:#fff;font-size:22px;font-weight:700}.effect-text{font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif;fill:#c4d7f1;font-size:17px}.footer{font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif;fill:#9eb9de;font-size:15px}
    </style>
  </defs>
  <rect width="1200" height="${height}" fill="url(#bg)"/><rect width="1200" height="${height}" fill="url(#light)"/>
  <path d="M-60 145C198 284 388 23 683 145s365 12 592 112" fill="none" stroke="#d5ecff" stroke-opacity=".16" stroke-width="2"/>
  <circle cx="84" cy="72" r="3" fill="${secondary}" filter="url(#glow)"/><circle cx="222" cy="148" r="2" fill="#e8f5ff"/><circle cx="1048" cy="92" r="4" fill="${accent}" filter="url(#glow)"/>
  <text x="54" y="68" class="eyebrow">FANTASY FINAL · BOSS TRAIT</text>
  <text x="54" y="127" class="title">${escapeXml(bossName)}</text><text x="54" y="164" class="subtitle">${escapeXml(tierName(trait.name))}难度 · Lv.32 BOSS词条概览</text>
  <text x="54" y="226" class="section">战斗属性</text>${statMarkup}
  <text x="54" y="618" class="section">胜利奖励</text>
  <rect x="54" y="640" width="536" height="58" rx="18" fill="#10244c" fill-opacity=".72" stroke="#d8ebff" stroke-opacity=".16"/><text x="80" y="664" class="reward-label">经验收益</text><text x="560" y="680" text-anchor="end" class="reward-value">${escapeXml(bossRewardStrengthLabel(trait.experiencePct))}</text>
  <rect x="610" y="640" width="536" height="58" rx="18" fill="#10244c" fill-opacity=".72" stroke="#d8ebff" stroke-opacity=".16"/><text x="636" y="664" class="reward-label">掉落收益</text><text x="1116" y="680" text-anchor="end" class="reward-value">${escapeXml(bossRewardStrengthLabel(trait.dropPct))}</text>
  <text x="54" y="${effectsY - 22}" class="section">本场特殊效果</text>${effectMarkup(effects, effectsY, accent)}
  <text x="54" y="${height - 38}" class="footer">属性与奖励仅显示概览等级；随机效果只展示本场实际抽中的效果。</text>
</svg>`;
};
const bossTraitCardImage = (data) => sharp(Buffer.from(bossTraitCardSvg(data))).webp({ quality: 90, effort: 4 }).toBuffer();

export { bossRewardStrengthLabel, bossTraitCardImage, bossTraitCardSvg, bossTraitStrengthLabel };
