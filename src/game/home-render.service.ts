import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { RowDataPacket } from 'mysql2/promise';
import sharp from 'sharp';
import { getPool, withTransaction } from '../database/pool';
import { backfillHomeFloorLayout, roomForHouseLevel } from './home-layout.service';
import floor1Morning from '../assets/home/room/floor-1-morning.png';
import floor1Noon from '../assets/home/room/floor-1-noon.png';
import floor1Evening from '../assets/home/room/floor-1-evening.png';
import floor2Morning from '../assets/home/room/floor-2-morning.png';
import floor2Noon from '../assets/home/room/floor-2-noon.png';
import floor2Evening from '../assets/home/room/floor-2-evening.png';
import floor3Morning from '../assets/home/room/floor-3-morning.png';
import floor3Noon from '../assets/home/room/floor-3-noon.png';
import floor3Evening from '../assets/home/room/floor-3-evening.png';
import woodenBed from '../assets/home/furniture/wooden-bed.png';
import slimeBed from '../assets/home/furniture/slime-bed.png';
import storageChest from '../assets/home/furniture/storage-chest.png';
import trainingDummy from '../assets/home/furniture/training-dummy.png';
import warmHearth from '../assets/home/furniture/warm-hearth.png';
import wolfhideCarpet from '../assets/home/furniture/wolfhide-carpet.png';
import alchemyShelf from '../assets/home/furniture/alchemy-shelf.png';
import moonlightLamp from '../assets/home/furniture/moonlight-lamp.png';

const HOME_ASSET_VERSION = 'cozy-pixel-home-v5-all-floor-daylight-third-floor-wide-window';
const assetPath = (asset: string) => decodeURIComponent(asset).replace(/^([a-zA-Z]):(?![\\/])/, '$1:\\');
type HomePeriod = 'morning' | 'noon' | 'evening';
const backgrounds: Record<1 | 2 | 3, Record<HomePeriod, string>> = {
  1: {
    morning: assetPath(floor1Morning),
    noon: assetPath(floor1Noon),
    evening: assetPath(floor1Evening)
  },
  2: {
    morning: assetPath(floor2Morning),
    noon: assetPath(floor2Noon),
    evening: assetPath(floor2Evening)
  },
  3: {
  morning: assetPath(floor3Morning),
  noon: assetPath(floor3Noon),
  evening: assetPath(floor3Evening)
  }
};
const furnitureAssets: Record<string, string> = {
  wooden_bed: assetPath(woodenBed), slime_bed: assetPath(slimeBed), storage_chest: assetPath(storageChest), training_dummy: assetPath(trainingDummy),
  warm_hearth: assetPath(warmHearth), wolfhide_carpet: assetPath(wolfhideCarpet), alchemy_shelf: assetPath(alchemyShelf), moonlight_lamp: assetPath(moonlightLamp)
};

type HomeRow = RowDataPacket & { id: number; house_level: number; floor_count: number };
type FurnitureRow = RowDataPacket & { id: number; furniture_code: string; name: string; floor_no: number; grid_x: number; grid_y: number; grid_width: number; grid_height: number; layer_order: number };
type RenderCache = RowDataPacket & { layout_hash: string; image_path: string };

const cachePathFor = (homeId: number, floor: number, hash: string) => resolve(process.cwd(), '.data', 'qq-bot', 'home-renders', String(homeId), `${floor}-${hash}.webp`);
const shadowSvg = (width: number, height: number) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="5" y="7" width="${Math.max(1, width - 10)}" height="${Math.max(1, height - 10)}" rx="10" fill="#3b2215" opacity=".22"/></svg>`);
const floorLabelSvg = (size: number, floor: number, level: number) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect x="18" y="18" width="164" height="39" rx="19" fill="#4d2d1c" opacity=".72"/><text x="100" y="44" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="19" font-weight="bold" fill="#fff5dd">第 ${floor} 层 · 小屋 Lv.${level}</text></svg>`);
const homePeriod = (): HomePeriod => {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'noon';
  return 'evening';
};
const backgroundForFloor = (floor: number, period: HomePeriod) => backgrounds[floor as 1 | 2 | 3]?.[period] ?? backgrounds[1][period];

export const homeFloorImage = async (qqUserId: string, floor: number) => {
  if (!Number.isInteger(floor) || floor < 1 || floor > 3) throw new Error('楼层不存在。');
  const home = await withTransaction(async connection => {
    const [rows] = await connection.execute<HomeRow[]>(`SELECT h.id,h.house_level,h.floor_count FROM player_homes h
      JOIN characters c ON c.id=h.character_id JOIN players p ON p.id=c.player_id
      WHERE p.qq_user_id=? AND h.status='active' LIMIT 1 FOR UPDATE`, [qqUserId]);
    const current = rows[0];
    if (!current) throw new Error('你还没有小屋。');
    if (floor > Number(current.floor_count)) throw new Error(`第 ${floor} 层尚未扩建。`);
    await backfillHomeFloorLayout(connection, Number(current.id), floor, Number(current.house_level));
    return current;
  });
  const pool = await getPool();
  const [furnitureRows] = await pool.execute<FurnitureRow[]>(`SELECT f.id,f.furniture_code,d.name,f.floor_no,f.grid_x,f.grid_y,d.grid_width,d.grid_height,d.layer_order
    FROM player_home_furniture f JOIN home_furniture_definitions d ON d.code=f.furniture_code
    WHERE f.home_id=? AND f.floor_no=? AND f.grid_x IS NOT NULL AND f.grid_y IS NOT NULL
    ORDER BY d.layer_order,f.grid_y,f.grid_x,f.id`, [home.id, floor]);
  const room = roomForHouseLevel(Number(home.house_level));
  const period = homePeriod();
  const layoutHash = createHash('sha256').update(JSON.stringify({ asset: HOME_ASSET_VERSION, home: Number(home.id), floor, period, level: Number(home.house_level), furniture: furnitureRows.map(item => [item.id, item.furniture_code, item.grid_x, item.grid_y, item.grid_width, item.grid_height, item.layer_order]) })).digest('hex');
  const [cached] = await pool.execute<RenderCache[]>('SELECT layout_hash,image_path FROM player_home_floor_renders WHERE home_id=? AND floor_no=? LIMIT 1', [home.id, floor]);
  const cache = cached[0];
  if (cache?.layout_hash === layoutHash) {
    try { await access(cache.image_path); return { image: await readFile(cache.image_path), floor, level: Number(home.house_level), furniture: furnitureRows, cached: true }; } catch { /* 缓存文件可再生，丢失后直接重建。 */ }
  }
  const size = room.size * room.gridPixels;
  const background = await readFile(backgroundForFloor(floor, period));
  const composites: Array<{ input: Buffer; left: number; top: number }> = [];
  for (const item of furnitureRows) {
    const asset = furnitureAssets[item.furniture_code];
    if (!asset) continue;
    const width = Number(item.grid_width) * room.gridPixels; const height = Number(item.grid_height) * room.gridPixels;
    const left = Number(item.grid_x) * room.gridPixels; const top = Number(item.grid_y) * room.gridPixels;
    composites.push({ input: shadowSvg(width, height), left, top });
    composites.push({ input: await sharp(await readFile(asset)).resize(width, height, { fit: 'contain', withoutEnlargement: false }).png().toBuffer(), left, top });
  }
  composites.push({ input: floorLabelSvg(size, floor, Number(home.house_level)), left: 0, top: 0 });
  const image = await sharp(background).resize(size, size, { fit: 'fill' }).composite(composites).webp({ quality: 82, effort: 4 }).toBuffer();
  const imagePath = cachePathFor(Number(home.id), floor, layoutHash);
  await mkdir(dirname(imagePath), { recursive: true }); await writeFile(imagePath, image);
  await pool.execute(`INSERT INTO player_home_floor_renders (home_id,floor_no,layout_hash,image_path) VALUES (?,?,?,?)
    ON DUPLICATE KEY UPDATE layout_hash=VALUES(layout_hash),image_path=VALUES(image_path),rendered_at=NOW()`, [home.id, floor, layoutHash, imagePath]);
  return { image, floor, level: Number(home.house_level), furniture: furnitureRows, cached: false };
};
