import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import fileUrl from '../assets/game/story/system-status-background.png.js';

const systemStatusBackgroundPath = decodeURIComponent(fileUrl).replace(/^([a-zA-Z]):(?![\\/])/, '$1:\\');
const escapeXml = (value) => String(value ?? '').replace(/[<>&'"]/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[character]));
const sizeText = (value) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unit = 0;
    let output = Math.max(0, value);
    while (output >= 1024 && unit < units.length - 1) {
        output /= 1024;
        unit += 1;
    }
    return `${output >= 100 || unit === 0 ? output.toFixed(0) : output.toFixed(1)} ${units[unit]}`;
};
const durationText = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor(seconds % 86400 / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    return days ? `${days}天 ${hours}小时 ${minutes}分钟` : hours ? `${hours}小时 ${minutes}分钟` : `${minutes}分钟`;
};
const percent = (used, total) => Math.max(0, Math.min(100, used / Math.max(1, total) * 100));
const numberText = (value) => value.toLocaleString('zh-CN');
const metricTile = (x, y, label, value, accent) => `<rect x="${x}" y="${y}" width="416" height="108" rx="18" fill="#102653" fill-opacity=".30" stroke="#d7edff" stroke-opacity=".20"/><rect x="${x}" y="${y}" width="7" height="108" rx="3" fill="${accent}"/><text x="${x + 26}" y="${y + 38}" class="tile-label">${escapeXml(label)}</text><text x="${x + 26}" y="${y + 81}" class="tile-value">${escapeXml(value)}</text>`;
const gameTiles = (game, startY) => {
    if (!game)
        return `<rect x="62" y="${startY}" width="876" height="174" rx="18" fill="#102653" fill-opacity=".30" stroke="#d7edff" stroke-opacity=".20"/><text x="90" y="${startY + 60}" class="tile-label">游戏世界数据暂不可读取</text><text x="90" y="${startY + 100}" class="muted">设备状态正常；请检查数据库连接或等待初始化完成。</text>`;
    return [
        metricTile(62, startY, '已创建角色', numberText(game.characters), '#8fc9ff'),
        metricTile(522, startY, '可行动角色', numberText(game.activeCharacters), '#8de8bd'),
        metricTile(62, startY + 128, '进行中战斗 / 行程', `${numberText(game.battles)} / ${numberText(game.travelling)}`, '#ffbc81'),
        metricTile(522, startY + 128, '野外怪物 / 资源', `${numberText(game.monsters)} / ${numberText(game.resources)}`, '#c6a6ff'),
        metricTile(62, startY + 256, '活动迷宫', numberText(game.dungeons), '#ff9db7'),
        metricTile(522, startY + 256, '世界奇遇', numberText(game.worldScenes), '#f4d879')
    ].join('');
};
const statusSvg = (status) => {
    const memoryUsed = percent(status.memory.used, status.memory.total);
    const storageUsed = status.storage ? percent(status.storage.total - status.storage.free, status.storage.total) : 0;
    const updated = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium', hour12: false }).format(status.capturedAt);
    const storageText = status.storage ? `${status.storage.label}  ${sizeText(status.storage.total - status.storage.free)} / ${sizeText(status.storage.total)}` : '未能读取当前工作磁盘';
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1000" height="1600" viewBox="0 0 1000 1600" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0a1b42"/><stop offset=".52" stop-color="#264f9c"/><stop offset="1" stop-color="#747bc3"/></linearGradient>
    <radialGradient id="light" cx="82%" cy="5%" r="78%"><stop stop-color="#b1dcff" stop-opacity=".48"/><stop offset=".45" stop-color="#5b94e2" stop-opacity=".14"/><stop offset="1" stop-color="#07142f" stop-opacity="0"/></radialGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d8edff" stop-opacity=".20"/><stop offset="1" stop-color="#92b8fa" stop-opacity=".08"/></linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <style>
      .cn { font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif; fill:#f7fbff; }
      .eyebrow { font-family:'Segoe UI',sans-serif; fill:#b9d8ff; letter-spacing:5px; font-size:15px; }
      .title { font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif; fill:#fff; font-size:43px; font-weight:700; }
      .sub { font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif; fill:#d8e9ff; font-size:20px; }
      .section { font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif; fill:#fff; font-size:25px; font-weight:700; }
      .label { font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif; fill:#bcd4f5; font-size:17px; }
      .value { font-family:'Segoe UI','Microsoft YaHei',sans-serif; fill:#fff; font-size:20px; font-weight:700; }
      .amount { font-family:'Segoe UI','Microsoft YaHei',sans-serif; fill:#fff; font-size:27px; font-weight:700; }
      .tile-label { font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif; fill:#c5daf9; font-size:18px; }
      .tile-value { font-family:'Segoe UI','Microsoft YaHei',sans-serif; fill:#fff; font-size:29px; font-weight:700; }
      .muted { font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif; fill:#bcd1f2; font-size:17px; }
    </style>
  </defs>
  <rect width="1000" height="1600" fill="url(#bg)" fill-opacity="0"/><rect width="1000" height="1600" fill="url(#light)" fill-opacity="0"/>
  <path d="M-70 134C185 260 314 31 580 143s308 12 510 92" fill="none" stroke="#d3e9ff" stroke-opacity=".16" stroke-width="2"/>
  <circle cx="92" cy="93" r="3" fill="#e7f5ff"/><circle cx="188" cy="165" r="2" fill="#e7f5ff"/><circle cx="665" cy="96" r="3" fill="#e7f5ff"/><circle cx="917" cy="221" r="2" fill="#e7f5ff"/>
  <text x="62" y="91" class="eyebrow">SYSTEM &amp; WORLD STATUS</text><text x="62" y="143" class="title">运行状态面板</text><text x="62" y="178" class="sub">${escapeXml(status.hostname)} · 服务正常运行中</text>
  <rect x="62" y="215" width="876" height="155" rx="22" fill="#102653" fill-opacity=".30" stroke="#d7edff" stroke-opacity=".20"/>
  <circle cx="125" cy="292" r="42" fill="#1d6ee6" filter="url(#glow)"/><path d="M125 266a26 26 0 1 0 24 35" fill="none" stroke="#e9f7ff" stroke-width="8" stroke-linecap="round"/><circle cx="125" cy="292" r="7" fill="#e9f7ff"/>
  <text x="192" y="267" class="label">设备运行时间</text><text x="192" y="306" class="amount">${escapeXml(durationText(status.systemUptimeSeconds))}</text><text x="192" y="338" class="muted">服务已运行 ${escapeXml(durationText(status.serviceUptimeSeconds))}</text>
  <text x="890" y="270" text-anchor="end" class="label">网络</text><text x="890" y="306" text-anchor="end" class="amount">${status.networkInterfaces} 个接口</text><text x="890" y="338" text-anchor="end" class="muted">未采集累计流量</text>
  <text x="62" y="424" class="section">设备资源</text>
  <rect x="62" y="451" width="876" height="202" rx="20" fill="#102653" fill-opacity=".30" stroke="#d7edff" stroke-opacity=".20"/>
  <text x="90" y="490" class="label">内存使用情况</text><text x="910" y="490" text-anchor="end" class="value">${escapeXml(`${sizeText(status.memory.used)} / ${sizeText(status.memory.total)}`)}</text><text x="90" y="536" class="amount">${memoryUsed.toFixed(1)}%</text><rect x="90" y="558" width="820" height="16" rx="8" fill="#10234c" fill-opacity=".30"/><rect x="90" y="558" width="${820 * memoryUsed / 100}" height="16" rx="8" fill="#91d5ff" fill-opacity=".30" filter="url(#glow)"/><text x="90" y="620" class="muted">可用 ${escapeXml(sizeText(status.memory.free))} · 机器人进程 ${escapeXml(sizeText(status.memory.process))}</text>
  <rect x="62" y="680" width="876" height="177" rx="20" fill="#102653" fill-opacity=".30" stroke="#d7edff" stroke-opacity=".20"/>
  <text x="90" y="719" class="label">工作磁盘</text><text x="910" y="719" text-anchor="end" class="value">${escapeXml(storageText)}</text><text x="90" y="765" class="amount">${status.storage ? `${storageUsed.toFixed(1)}%` : '—'}</text><rect x="90" y="787" width="820" height="16" rx="8" fill="#10234c" fill-opacity=".30"/><rect x="90" y="787" width="${820 * storageUsed / 100}" height="16" rx="8" fill="#f4c987" fill-opacity=".30" filter="url(#glow)"/>
  <text x="90" y="830" class="muted">${status.storage ? `可用 ${escapeXml(sizeText(status.storage.free))}` : '磁盘查询失败不影响服务运行'}</text>
  <text x="62" y="911" class="section">系统信息</text>
  <rect x="62" y="937" width="876" height="46" rx="14" fill="#102653" fill-opacity=".30" stroke="#d7edff" stroke-opacity=".20"/><text x="84" y="967" class="label">操作系统</text><text x="252" y="967" class="value">${escapeXml(status.operatingSystem)}</text>
  <rect x="62" y="991" width="876" height="46" rx="14" fill="#102653" fill-opacity=".30" stroke="#d7edff" stroke-opacity=".20"/><text x="84" y="1021" class="label">处理器</text><text x="252" y="1021" class="value">${escapeXml(`${status.cpu} · ${status.cpuCores} 核 · ${status.architecture}`)}</text>
  <text x="62" y="1092" class="section">游戏世界概况</text>
  ${gameTiles(status.game, 1125)}
  <text x="62" y="1535" class="eyebrow" style="font-size:13px;letter-spacing:3px">刷新于 ${escapeXml(updated)}</text>
</svg>`;
};
const systemStatusPanelImage = async (status) => {
    const background = await readFile(systemStatusBackgroundPath);
    return sharp(background).resize(1000, 1600, { fit: 'cover', position: 'attention' })
        .composite([{ input: Buffer.from(statusSvg(status)) }])
        .webp({ quality: 88, effort: 4 })
        .toBuffer();
};

export { systemStatusPanelImage };
