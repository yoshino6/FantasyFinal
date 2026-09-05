import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { totalmem, freemem, networkInterfaces, uptime, cpus, type, release, platform, hostname } from 'node:os';
import { parse } from 'node:path';
import { getPool } from '../database/pool.js';

const execFileAsync = promisify(execFile);
const count = async (sql) => {
    const pool = await getPool();
    const [rows] = await pool.query(sql);
    return Number(rows[0]?.total ?? 0);
};
const gameStatusSummary = async () => {
    try {
        const [characters, activeCharacters, battles, travelling, monsters, resources, dungeons, worldScenes] = await Promise.all([
            count('SELECT COUNT(*) AS total FROM characters WHERE npc_code IS NULL'),
            count("SELECT COUNT(*) AS total FROM characters WHERE npc_code IS NULL AND activity_status='active'"),
            count("SELECT COUNT(*) AS total FROM combat_sessions WHERE state='active'"),
            count('SELECT COUNT(*) AS total FROM player_travels'),
            count('SELECT COUNT(*) AS total FROM monster_spawns WHERE defeated_at IS NULL'),
            count('SELECT COUNT(*) AS total FROM resource_spawns WHERE mined_at IS NULL'),
            count("SELECT COUNT(*) AS total FROM dungeon_instances WHERE state<>'closed'"),
            count("SELECT COUNT(*) AS total FROM world_scene_instances WHERE status='active' AND expires_at>NOW()")
        ]);
        return { characters, activeCharacters, battles, travelling, monsters, resources, dungeons, worldScenes };
    }
    catch {
        return null;
    }
};
const storageStatus = async () => {
    const root = parse(process.cwd()).root;
    try {
        if (process.platform === 'win32') {
            const drive = root.replace(/[\\/]/g, '');
            const command = `$disk=Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='${drive}'\"; if($disk){\"$($disk.Size),$($disk.FreeSpace)\"}`;
            const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { timeout: 3000 });
            const [total, free] = stdout.trim().split(',').map(Number);
            return Number.isFinite(total) && Number.isFinite(free) ? { label: drive, total, free } : null;
        }
        const { stdout } = await execFileAsync('df', ['-Pk', process.cwd()], { timeout: 3000 });
        const fields = stdout.trim().split(/\r?\n/).at(-1)?.trim().split(/\s+/) ?? [];
        const blocks = Number(fields[1]);
        const available = Number(fields[3]);
        const label = fields.at(-1) ?? root;
        return Number.isFinite(blocks) && Number.isFinite(available) ? { label, total: blocks * 1024, free: available * 1024 } : null;
    }
    catch {
        return null;
    }
};
const systemStatusSnapshot = async () => {
    const total = totalmem();
    const free = freemem();
    const interfaces = Object.values(networkInterfaces()).filter(entries => entries?.some(entry => !entry.internal)).length;
    const [storage, game] = await Promise.all([storageStatus(), gameStatusSummary()]);
    return {
        capturedAt: new Date(),
        hostname: hostname(),
        operatingSystem: `${type()} ${release()} (${platform()})`,
        architecture: process.arch,
        cpu: cpus()[0]?.model?.trim() || '未知处理器',
        cpuCores: cpus().length,
        serviceUptimeSeconds: Math.floor(process.uptime()),
        systemUptimeSeconds: Math.floor(uptime()),
        memory: { total, free, used: total - free, process: process.memoryUsage().rss },
        storage,
        networkInterfaces: interfaces,
        game
    };
};

export { systemStatusSnapshot };
