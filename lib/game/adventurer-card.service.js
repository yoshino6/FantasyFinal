import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import axios from 'axios';
import sharp from 'sharp';
import { getPool } from '../database/pool.js';
import fileUrl from '../assets/game/cards/adventurer-card-background.png.js';

const escapeXml = (value) => String(value ?? '').replace(/[<>&'\"]/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[character]));
const displayDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '未知日期' : `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
};
const secondaryProfessionNames = { blacksmith: '锻造师', alchemist: '炼金师', deconstructor: '解构师', omniscient: '全知者' };
const secondaryLabel = (profile) => profile.secondaryProfession ? `${secondaryProfessionNames[profile.secondaryProfession] ?? profile.secondaryProfession} Lv.${profile.secondaryLevel ?? 1}` : '尚未就职';
const cardBackgroundPath = decodeURIComponent(fileUrl).replace(/^([a-zA-Z]):(?![\\/])/, '$1:\\');
const cardBackgroundBuffer = () => readFile(cardBackgroundPath);
const avatarData = async (url) => {
    if (!url || !/^https?:\/\//i.test(url))
        return null;
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000, maxContentLength: 2 * 1024 * 1024 });
        return await sharp(Buffer.from(response.data)).resize(164, 164, { fit: 'cover' }).png().toBuffer();
    }
    catch {
        return null;
    }
};
const rankBadgeStyle = (rankValue) => {
    const rank = rankValue.trim().toUpperCase();
    if (rank.startsWith('S'))
        return { fill: 'url(#rank-rainbow-dark)', stroke: 'url(#rank-rainbow)', innerStroke: 'url(#rank-rainbow)', text: 'url(#rank-rainbow)', name: 'url(#rank-rainbow)' };
    return {
        F: { fill: '#0c0b0a', stroke: '#b89451', innerStroke: '#7c5a26', text: '#f7f0db', name: '#fffdf6' },
        E: { fill: '#15110a', stroke: '#bd9550', innerStroke: '#9a7132', text: '#ddc18d', name: '#c3a56f' },
        D: { fill: '#201707', stroke: '#cba451', innerStroke: '#aa8037', text: '#ecd197', name: '#d3b16d' },
        C: { fill: '#2b1e08', stroke: '#dcba64', innerStroke: '#c09342', text: '#f5dca7', name: '#e0bf7a' },
        B: { fill: '#382808', stroke: '#e9ca77', innerStroke: '#d0a24a', text: '#fae7b7', name: '#efce88' },
        A: { fill: '#4a3308', stroke: '#f7da8a', innerStroke: '#e2bb5d', text: '#fff1c6', name: '#ffe5a0' }
    }[rank] ?? { fill: '#0c0b0a', stroke: '#b89451', innerStroke: '#7c5a26', text: '#f7f0db', name: '#fffdf6' };
};
const cardSvg = (profile, skills, avatar) => {
    const avatarHref = avatar ? `data:image/png;base64,${avatar.toString('base64')}` : '';
    const nameInitial = escapeXml([...profile.name][0] ?? 'A');
    const badge = rankBadgeStyle(profile.rank);
    const skillRows = [...skills.slice(0, 5), ...Array.from({ length: Math.max(0, 5 - skills.length) }, () => ({ name: '—', level: 0 }))]
        .map((skill, index) => `<text x="740" y="${366 + index * 43}" class="skill-num">${String(index + 1).padStart(2, '0')}</text><text x="786" y="${366 + index * 43}" class="skill">${escapeXml(skill.name)}${skill.level ? `  Lv.${skill.level}` : ''}</text>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="700" viewBox="0 0 1200 700" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="obsidian" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#07090d"/><stop offset=".42" stop-color="#17120e"/><stop offset="1" stop-color="#050608"/></linearGradient>
    <radialGradient id="aura" cx="76%" cy="9%" r="82%"><stop stop-color="#85612a" stop-opacity=".34"/><stop offset=".5" stop-color="#6e4c1c" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#5e4319"/><stop offset=".48" stop-color="#d7b86e"/><stop offset="1" stop-color="#6a4a1b"/></linearGradient>
    <linearGradient id="rank-rainbow" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff6b8d"/><stop offset=".18" stop-color="#ffbc5b"/><stop offset=".36" stop-color="#fff27d"/><stop offset=".54" stop-color="#70e7a4"/><stop offset=".72" stop-color="#6fb7ff"/><stop offset=".88" stop-color="#bd82ff"/><stop offset="1" stop-color="#ff78cd"/></linearGradient>
    <linearGradient id="rank-rainbow-dark" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#4a1428"/><stop offset=".25" stop-color="#4a3212"/><stop offset=".5" stop-color="#143d31"/><stop offset=".75" stop-color="#182c59"/><stop offset="1" stop-color="#441d53"/></linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="portrait"><circle cx="182" cy="265" r="80"/></clipPath>
    <pattern id="filigree" width="112" height="112" patternUnits="userSpaceOnUse"><path d="M0 56C26 56 26 16 56 16s30 40 56 40M0 56c26 0 26 40 56 40s30-40 56-40M56 0c0 26-40 26-40 56s40 30 40 56M56 0c0 26 40 26 40 56s-40 30-40 56" fill="none" stroke="#bd9750" stroke-opacity=".15" stroke-width="1.25"/></pattern>
    <style>
      .serif { font-family: 'Palatino Linotype','Times New Roman',serif; fill:#f7f0db; letter-spacing:2px; }
      .script { font-family:'Segoe Script','Brush Script MT','Palatino Linotype',serif; fill:#f8edcb; }
      .cn { font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif; fill:#f7f3e8; }
      .muted { font-family:'Palatino Linotype','Microsoft YaHei',serif; fill:#c4aa78; letter-spacing:2px; }
      .skill { font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif; fill:#eee8d8; font-size:21px; }
      .skill-num { font-family:'Palatino Linotype',serif; fill:#b89045; font-size:17px; }
    </style>
  </defs>
  <g transform="translate(0,-35)">
    <text x="75" y="88" class="serif" font-size="20">ADVENTURER'S GUILD</text>
    <circle cx="182" cy="265" r="96" fill="#090a0d" stroke="url(#gold)" stroke-width="3"/>
    <circle cx="182" cy="265" r="87" fill="#17110a" stroke="#d1ae66" stroke-opacity=".45"/>
    ${avatarHref ? `<image href="${avatarHref}" x="102" y="185" width="160" height="160" preserveAspectRatio="xMidYMid slice" clip-path="url(#portrait)"/>` : `<text x="182" y="285" text-anchor="middle" class="script" font-size="78">${nameInitial}</text>`}
    <circle cx="182" cy="265" r="80" fill="none" stroke="#ebd188" stroke-opacity=".8"/>
    <text x="75" y="402" class="muted" font-size="14">GUILD ID</text><text x="75" y="432" class="serif" font-size="28">${String(profile.gameId).padStart(8, '0')}</text>
    <text x="75" y="481" class="muted" font-size="14">REGISTERED</text><text x="75" y="510" class="serif" font-size="22">${displayDate(profile.createdAt)}</text>
    <text x="318" y="245" class="script" style="fill:${badge.name}" font-size="62">${escapeXml(profile.name)}</text>
    <text x="322" y="281" class="muted" font-size="17">${escapeXml(profile.gender === '男' ? 'MALE ADVENTURER' : profile.gender === '女' ? 'FEMALE ADVENTURER' : 'ADVENTURER')}</text>
    <path d="M320 303H664" stroke="#b89451" stroke-opacity=".7"/>
    <text x="320" y="350" class="muted" font-size="14">CURRENT LEVEL</text><text x="320" y="390" class="serif" font-size="42">Lv.${profile.level}</text>
    <text x="475" y="350" class="muted" font-size="14">PRIMARY PROFESSION</text><text x="475" y="390" class="cn" font-size="25">${escapeXml(profile.profession ?? '未选择')}</text>
    <text x="320" y="453" class="muted" font-size="14">SECONDARY VOCATION</text><text x="320" y="490" class="cn" font-size="22">${escapeXml(secondaryLabel(profile))}</text>
    <text x="320" y="546" class="muted" font-size="14">REGISTRY</text><text x="320" y="576" class="cn" font-size="20">百纳镇冒险者公会</text>
  </g>
  <g transform="translate(974 66)"><path d="M65 0l59 34v70l-59 34-59-34V34z" fill="${badge.fill}" stroke="${badge.stroke}" stroke-width="2"/><path d="M65 10l49 28v62l-49 28-49-28V38z" fill="none" stroke="${badge.innerStroke}"/><text x="65" y="82" text-anchor="middle" class="script" style="fill:${badge.text}" font-size="61">${escapeXml(profile.rank)}</text><text x="65" y="115" text-anchor="middle" class="muted" style="fill:${badge.text}" font-size="18">RANK</text></g>
  <path d="M705 184v374" stroke="url(#gold)" stroke-width="1.5"/><text x="740" y="230" class="serif" font-size="25">ATTESTED SKILLS</text><text x="742" y="260" class="muted" font-size="13">RECOGNISED BY THE GUILD</text>
  ${skillRows}
  <text x="740" y="606" class="muted" font-size="13">OBSIDIAN CREDENTIAL · VOID ALTERATION PROHIBITED</text>
  <path d="M75 622c80-36 150-36 230 0M895 622c80-36 150-36 230 0" fill="none" stroke="#b99450" stroke-width="1.2" opacity=".8"/>
</svg>`;
};
const adventurerCardImage = async (qqUserId, avatarUrl) => {
    const pool = await getPool();
    const [profiles] = await pool.execute(`SELECT c.id,c.game_id AS gameId,c.name,c.gender,c.level,c.adventurer_rank AS rank,p.name AS profession,
    sp.profession_code AS secondaryProfession,sp.level AS secondaryLevel,c.created_at AS createdAt
    FROM characters c JOIN players pl ON pl.id=c.player_id
    LEFT JOIN profession_definitions p ON p.code=c.profession_code
    LEFT JOIN player_secondary_professions sp ON sp.character_id=c.id AND sp.profession_code=c.secondary_profession_code
    WHERE pl.qq_user_id=? LIMIT 1`, [qqUserId]);
    const profile = profiles[0];
    if (!profile?.id)
        throw new Error('请先创建角色。');
    const [registered] = await pool.execute('SELECT adventurer_registered FROM characters WHERE id=? LIMIT 1', [profile.id]);
    if (!registered[0]?.adventurer_registered)
        throw new Error('尚未完成冒险者注册。');
    const [skills] = await pool.execute('SELECT s.name,ps.level FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? ORDER BY ps.level DESC,ps.learned_at,s.id LIMIT 5', [profile.id]);
    const signature = createHash('sha256').update(JSON.stringify({ profile, skills, avatarUrl: avatarUrl ?? '', background: 'golden-arcana-v6-jpeg' })).digest('hex');
    const [cached] = await pool.execute('SELECT fingerprint,image_data FROM player_adventurer_card_cache WHERE character_id=? LIMIT 1', [profile.id]);
    if (cached[0]?.fingerprint === signature && Buffer.isBuffer(cached[0].image_data))
        return { image: cached[0].image_data, cached: true };
    const [background, avatar] = await Promise.all([cardBackgroundBuffer(), avatarData(avatarUrl)]);
    const image = await sharp(background).resize(1200, 700, { fit: 'cover' })
        .composite([{ input: Buffer.from(cardSvg(profile, skills, avatar)) }])
        .jpeg({ quality: 86, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer();
    await pool.execute(`INSERT INTO player_adventurer_card_cache (character_id,fingerprint,image_data) VALUES (?,?,?)
    ON DUPLICATE KEY UPDATE fingerprint=VALUES(fingerprint),image_data=VALUES(image_data)`, [profile.id, signature, image]);
    return { image, cached: false };
};

export { adventurerCardImage };
