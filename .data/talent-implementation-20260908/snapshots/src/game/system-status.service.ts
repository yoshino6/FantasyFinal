import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cpus, freemem, hostname, networkInterfaces, platform, release, totalmem, type, uptime } from 'node:os';
import { parse } from 'node:path';
import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../database/pool';

const execFileAsync = promisify(execFile);

export type StorageStatus = { label: string; total: number; free: number };
export type GameStatusSummary = {
  characters: number;
  activeCharacters: number;
  battles: number;
  travelling: number;
  monsters: number;
  resources: number;
  dungeons: number;
  worldScenes: number;
};
export type SystemStatusSnapshot = {
  capturedAt: Date;
  hostname: string;
  operatingSystem: string;
  architecture: string;
  cpu: string;
  cpuCores: number;
  serviceUptimeSeconds: number;
  systemUptimeSeconds: number;
  memory: { total: number; free: number; used: number; process: number };
  storage: StorageStatus | null;
  networkInterfaces: number;
  game: GameStatusSummary | null;
};

const count = async (sql: string) => {
  const pool = await getPool();
  const [rows] = await pool.query<(RowDataPacket & { total: number })[]>(sql);
  return Number(rows[0]?.total ?? 0);
};

const gameStatusSummary = async (): Promise<GameStatusSummary | null> => {
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
  } catch {
    // 游戏数据库暂不可用时，设备状态仍可正常查看。
    return null;
  }
};

const storageStatus = async (): Promise<StorageStatus | null> => {
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
    const blocks = Number(fields[1]); const available = Number(fields[3]); const label = fields.at(-1) ?? root;
    return Number.isFinite(blocks) && Number.isFinite(available) ? { label, total: blocks * 1024, free: available * 1024 } : null;
  } catch { return null; }
};

export const systemStatusSnapshot = async (): Promise<SystemStatusSnapshot> => {
  const total = totalmem(); const free = freemem();
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
