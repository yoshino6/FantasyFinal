import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { RowDataPacket } from 'mysql2/promise';
import sharp from 'sharp';
import { getPool, withTransaction } from '../database/pool';
import { backfillHomeFloorLayout, furnitureDimensions, roomForHouseLevel } from './home-layout.service';
import floor1Morning from '../assets/home/room/floor-1-morning.png';
import floor1Noon from '../assets/home/room/floor-1-noon.png';
import floor1Evening from '../assets/home/room/floor-1-evening.png';
import floor2Morning from '../assets/home/room/floor-2-morning.png';
import floor2Noon from '../assets/home/room/floor-2-noon.png';
import floor2Evening from '../assets/home/room/floor-2-evening.png';
import floor3Morning from '../assets/home/room/floor-3-morning.png';
import floor3Noon from '../assets/home/room/floor-3-noon.png';
import floor3Evening from '../assets/home/room/floor-3-evening.png';
import woodenBedFront from '../assets/home/furniture/directional/wooden-bed-front.png';
import woodenBedSide from '../assets/home/furniture/directional/wooden-bed-side.png';
import woodenBedBack from '../assets/home/furniture/directional/wooden-bed-back.png';
import slimeBedFront from '../assets/home/furniture/directional/slime-bed-front.png';
import slimeBedSide from '../assets/home/furniture/directional/slime-bed-side.png';
import slimeBedBack from '../assets/home/furniture/directional/slime-bed-back.png';
import storageChestFront from '../assets/home/furniture/directional/storage-chest-front.png';
import storageChestSide from '../assets/home/furniture/directional/storage-chest-side.png';
import storageChestBack from '../assets/home/furniture/directional/storage-chest-back.png';
import trainingDummyFront from '../assets/home/furniture/directional/training-dummy-front.png';
import trainingDummySide from '../assets/home/furniture/directional/training-dummy-side.png';
import trainingDummyBack from '../assets/home/furniture/directional/training-dummy-back.png';
import warmHearthFront from '../assets/home/furniture/directional/warm-hearth-front.png';
import warmHearthSide from '../assets/home/furniture/directional/warm-hearth-side.png';
import warmHearthBack from '../assets/home/furniture/directional/warm-hearth-back.png';
import wolfhideCarpetFront from '../assets/home/furniture/directional/wolfhide-carpet-front.png';
import wolfhideCarpetSide from '../assets/home/furniture/directional/wolfhide-carpet-side.png';
import wolfhideCarpetBack from '../assets/home/furniture/directional/wolfhide-carpet-back.png';
import alchemyShelfFront from '../assets/home/furniture/directional/alchemy-shelf-front.png';
import alchemyShelfSide from '../assets/home/furniture/directional/alchemy-shelf-side.png';
import alchemyShelfBack from '../assets/home/furniture/directional/alchemy-shelf-back.png';
import moonlightLampFront from '../assets/home/furniture/directional/moonlight-lamp-front.png';
import moonlightLampSide from '../assets/home/furniture/directional/moonlight-lamp-side.png';
import moonlightLampBack from '../assets/home/furniture/directional/moonlight-lamp-back.png';

const HOME_ASSET_VERSION = 'cozy-pixel-home-v11-remove-bed-edge-seams';
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
type DirectionalFurnitureAssets = { front: string; side: string; back: string };
type FurnitureEdgeCleanup = 'none' | 'detached' | 'soft-tail';
const directionalAssets = (front: string, side: string, back: string): DirectionalFurnitureAssets => ({
  front: assetPath(front), side: assetPath(side), back: assetPath(back)
});
const furnitureAssets: Record<string, DirectionalFurnitureAssets> = {
  wooden_bed: directionalAssets(woodenBedFront, woodenBedSide, woodenBedBack),
  slime_bed: directionalAssets(slimeBedFront, slimeBedSide, slimeBedBack),
  storage_chest: directionalAssets(storageChestFront, storageChestSide, storageChestBack),
  training_dummy: directionalAssets(trainingDummyFront, trainingDummySide, trainingDummyBack),
  warm_hearth: directionalAssets(warmHearthFront, warmHearthSide, warmHearthBack),
  wolfhide_carpet: directionalAssets(wolfhideCarpetFront, wolfhideCarpetSide, wolfhideCarpetBack),
  alchemy_shelf: directionalAssets(alchemyShelfFront, alchemyShelfSide, alchemyShelfBack),
  moonlight_lamp: directionalAssets(moonlightLampFront, moonlightLampSide, moonlightLampBack)
};

type HomeRow = RowDataPacket & { id: number; house_level: number; floor_count: number };
type FurnitureRow = RowDataPacket & { id: number; furniture_code: string; name: string; floor_no: number; grid_x: number; grid_y: number; grid_width: number; grid_height: number; rotation: number; layer_order: number };
type RenderCache = RowDataPacket & { layout_hash: string; image_path: string };

const cachePathFor = (homeId: number, floor: number, hash: string) => resolve(process.cwd(), '.data', 'qq-bot', 'home-renders', String(homeId), `${floor}-${hash}.webp`);
const shadowSvg = (width: number, height: number) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><filter id="blur"><feGaussianBlur stdDeviation="${Math.max(1, Math.min(width, height) * .025)}"/></filter></defs><ellipse cx="${width / 2}" cy="${height * .86}" rx="${Math.max(3, width * .32)}" ry="${Math.max(2, height * .07)}" fill="#3b2215" opacity=".2" filter="url(#blur)"/></svg>`);
const furnitureAssetFor = (code: string, rotation: number) => {
  const assets = furnitureAssets[code];
  if (!assets) return null;
  const edgeCleanup: FurnitureEdgeCleanup = code === 'storage_chest'
    ? 'detached'
    : code === 'wooden_bed' && (rotation === 90 || rotation === 270) ? 'soft-tail' : 'none';
  if (rotation === 90) return { asset: assets.side, mirror: false, edgeCleanup };
  if (rotation === 180) return { asset: assets.back, mirror: false, edgeCleanup };
  if (rotation === 270) return { asset: assets.side, mirror: true, edgeCleanup };
  return { asset: assets.front, mirror: false, edgeCleanup };
};
const cleanFurnitureAsset = async (asset: string, width: number, height: number, mirror: boolean, edgeCleanup: FurnitureEdgeCleanup) => {
  let source = sharp(await readFile(asset));
  if (mirror) source = source.flop();
  const rendered = await source.resize(width, height, {
    fit: 'contain',
    withoutEnlargement: false,
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = rendered.data; const channels = rendered.info.channels; const alphaAt = (x: number, y: number) => pixels[(y * width + x) * channels + 3];
  const clearColumn = (x: number) => { for (let y = 0; y < height; y++) pixels[(y * width + x) * channels + 3] = 0; };
  const clearRow = (y: number) => { for (let x = 0; x < width; x++) pixels[(y * width + x) * channels + 3] = 0; };
  const edgeColumns = Math.max(1, Math.ceil(width * .15)); const edgeRows = Math.max(1, Math.ceil(height * .15));
  for (let x = 0; x < width; x++) {
    if (x >= edgeColumns && x < width - edgeColumns) continue;
    let visible = 0; for (let y = 0; y < height; y++) if (alphaAt(x, y) > 32) visible++;
    if (visible >= height * .9) clearColumn(x);
  }
  for (let y = 0; y < height; y++) {
    if (y >= edgeRows && y < height - edgeRows) continue;
    let visible = 0; for (let x = 0; x < width; x++) if (alphaAt(x, y) > 32) visible++;
    if (visible >= width * .9) clearRow(y);
  }
  if (edgeCleanup !== 'none') {
    const visibleColumns = Array.from({ length: width }, (_, x) => {
      let visible = 0; for (let y = 0; y < height; y++) if (alphaAt(x, y) > 32) visible++;
      return visible;
    });
    const runs: Array<{ start: number; end: number }> = [];
    for (let x = 0; x < width;) {
      if (visibleColumns[x] === 0) { x++; continue; }
      const start = x; while (x + 1 < width && visibleColumns[x + 1] > 0) x++;
      runs.push({ start, end: x }); x++;
    }
    const body = runs.sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
    if (body) {
      if (edgeCleanup === 'detached') {
        for (let x = 0; x < body.start; x++) clearColumn(x);
        for (let x = body.end + 1; x < width; x++) clearColumn(x);
      }
      if (edgeCleanup === 'soft-tail') {
        const denseThreshold = height * .7; const maxTail = Math.ceil(width * .08);
        const firstDense = visibleColumns.findIndex((visible, x) => x >= body.start && x <= body.end && visible >= denseThreshold);
        let lastDense = -1; for (let x = body.end; x >= body.start; x--) if (visibleColumns[x] >= denseThreshold) { lastDense = x; break; }
        const clearDarkSeamPixels = (x: number) => {
          for (let y = 0; y < height; y++) {
            const offset = (y * width + x) * channels;
            if (pixels[offset + 3] <= 32) continue;
            const brightness = pixels[offset] * .299 + pixels[offset + 1] * .587 + pixels[offset + 2] * .114;
            if (brightness >= 150) continue;
            pixels[offset + 3] = 0;
          }
        };
        if (firstDense > body.start && firstDense - body.start <= maxTail) for (let x = body.start; x < firstDense; x++) clearDarkSeamPixels(x);
        if (lastDense >= body.start && body.end - lastDense <= maxTail) for (let x = lastDense + 1; x <= body.end; x++) clearDarkSeamPixels(x);
      }
    }
  }
  return sharp(pixels, { raw: { width, height, channels } }).png().toBuffer();
};
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
  const [furnitureRows] = await pool.execute<FurnitureRow[]>(`SELECT f.id,f.furniture_code,d.name,f.floor_no,f.grid_x,f.grid_y,f.rotation,d.grid_width,d.grid_height,d.layer_order
    FROM player_home_furniture f JOIN home_furniture_definitions d ON d.code=f.furniture_code
    WHERE f.home_id=? AND f.floor_no=? AND f.grid_x IS NOT NULL AND f.grid_y IS NOT NULL
    ORDER BY d.layer_order,f.grid_y,f.grid_x,f.id`, [home.id, floor]);
  const room = roomForHouseLevel(Number(home.house_level));
  const period = homePeriod();
  const layoutHash = createHash('sha256').update(JSON.stringify({ asset: HOME_ASSET_VERSION, home: Number(home.id), floor, period, level: Number(home.house_level), furniture: furnitureRows.map(item => [item.id, item.furniture_code, item.grid_x, item.grid_y, item.grid_width, item.grid_height, item.rotation, item.layer_order]) })).digest('hex');
  const [cached] = await pool.execute<RenderCache[]>('SELECT layout_hash,image_path FROM player_home_floor_renders WHERE home_id=? AND floor_no=? LIMIT 1', [home.id, floor]);
  const cache = cached[0];
  if (cache?.layout_hash === layoutHash) {
    try { await access(cache.image_path); return { image: await readFile(cache.image_path), floor, level: Number(home.house_level), furniture: furnitureRows, cached: true }; } catch { /* 缓存文件可再生，丢失后直接重建。 */ }
  }
  const size = room.canvasPixels;
  const background = await readFile(backgroundForFloor(floor, period));
  const resizedBackground = await sharp(background).resize(size, size, { fit: 'fill' }).png().toBuffer();
  const composites: Array<{ input: Buffer; left: number; top: number }> = [];
  for (const item of furnitureRows) {
    const rotation = [0, 90, 180, 270].includes(Number(item.rotation)) ? Number(item.rotation) : 0;
    const selectedAsset = furnitureAssetFor(item.furniture_code, rotation);
    if (!selectedAsset) continue;
    const footprint = furnitureDimensions(Number(item.grid_width), Number(item.grid_height), rotation);
    const left = Math.round(room.floorLeft + Number(item.grid_x) * room.cellWidth); const top = Math.round(room.floorTop + Number(item.grid_y) * room.cellHeight);
    const right = Math.round(room.floorLeft + (Number(item.grid_x) + footprint.width) * room.cellWidth); const bottom = Math.round(room.floorTop + (Number(item.grid_y) + footprint.height) * room.cellHeight);
    const width = Math.max(1, right - left); const height = Math.max(1, bottom - top);
    const wallBleedX = Math.round(room.cellWidth * .18); const wallBleedY = Math.round(room.cellHeight * .18);
    const renderLeft = Number(item.grid_x) === 0
      ? left - wallBleedX
      : Number(item.grid_x) + footprint.width === room.columns ? left + wallBleedX : left;
    const renderTop = Number(item.grid_y) === 0 ? top - wallBleedY : top;
    composites.push({ input: shadowSvg(width, height), left: renderLeft, top: renderTop });
    composites.push({ input: await cleanFurnitureAsset(selectedAsset.asset, width, height, selectedAsset.mirror, selectedAsset.edgeCleanup), left: renderLeft, top: renderTop });
  }
  const frontWallTop = Math.max(0, Math.round(room.floorBottom - size * 0.016));
  composites.push({ input: await sharp(resizedBackground).extract({ left: 0, top: frontWallTop, width: size, height: size - frontWallTop }).png().toBuffer(), left: 0, top: frontWallTop });
  composites.push({ input: floorLabelSvg(size, floor, Number(home.house_level)), left: 0, top: 0 });
  const image = await sharp(resizedBackground).composite(composites).webp({ quality: 82, effort: 4 }).toBuffer();
  const imagePath = cachePathFor(Number(home.id), floor, layoutHash);
  await mkdir(dirname(imagePath), { recursive: true }); await writeFile(imagePath, image);
  await pool.execute(`INSERT INTO player_home_floor_renders (home_id,floor_no,layout_hash,image_path) VALUES (?,?,?,?)
    ON DUPLICATE KEY UPDATE layout_hash=VALUES(layout_hash),image_path=VALUES(image_path),rendered_at=NOW()`, [home.id, floor, layoutHash, imagePath]);
  return { image, floor, level: Number(home.house_level), furniture: furnitureRows, cached: false };
};
