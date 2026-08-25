import { createHash } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

type HomeFurnitureDefinition = RowDataPacket & {
  code: string;
  grid_width: number;
  grid_height: number;
  placement_rule: 'wall' | 'center' | 'corner' | 'wall_or_center';
};
type PlacedFurniture = RowDataPacket & {
  id: number;
  furniture_code: string;
  grid_x: number | null;
  grid_y: number | null;
  grid_width: number;
  grid_height: number;
};

export type HomeRoom = { size: number; innerMin: number; innerMax: number; gridPixels: number };
export type FurniturePlacement = { x: number; y: number };

export const roomForHouseLevel = (houseLevel: number): HomeRoom => {
  const size = houseLevel >= 3 ? 20 : houseLevel >= 2 ? 16 : 12;
  return { size, innerMin: 1, innerMax: size - 2, gridPixels: 48 };
};

const cellsFor = (placement: FurniturePlacement, definition: HomeFurnitureDefinition) => {
  const cells: Array<[number, number]> = [];
  for (let x = placement.x; x < placement.x + Number(definition.grid_width); x++) {
    for (let y = placement.y; y < placement.y + Number(definition.grid_height); y++) cells.push([x, y]);
  }
  return cells;
};

const reservedCells = (room: HomeRoom, floor: number) => {
  const center = Math.floor(room.size / 2);
  if (floor === 1) return new Set([`${center - 1}:${room.innerMax}`, `${center}:${room.innerMax}`]);
  if (floor === 2 || floor === 3) return new Set([`1:${room.innerMax - 1}`, `1:${room.innerMax}`, `2:${room.innerMax - 1}`, `2:${room.innerMax}`]);
  return new Set<string>();
};

const candidatesFor = (homeId: number, floor: number, definition: HomeFurnitureDefinition, room: HomeRoom) => {
  const width = Number(definition.grid_width); const height = Number(definition.grid_height);
  const min = room.innerMin; const maxX = room.innerMax - width + 1; const maxY = room.innerMax - height + 1;
  if (maxX < min || maxY < min) return [] as FurniturePlacement[];
  const wall: FurniturePlacement[] = [];
  for (let x = min; x <= maxX; x++) wall.push({ x, y: min });
  for (let y = min + 1; y <= maxY; y++) wall.push({ x: min, y });
  for (let y = min + 1; y <= maxY; y++) wall.push({ x: maxX, y });
  for (let x = min + 1; x < maxX; x++) wall.push({ x, y: maxY });
  const corner = [{ x: min, y: min }, { x: maxX, y: min }, { x: min, y: maxY }, { x: maxX, y: maxY }];
  const middle = (room.innerMin + room.innerMax) / 2;
  const center: FurniturePlacement[] = [];
  for (let y = min; y <= maxY; y++) for (let x = min; x <= maxX; x++) center.push({ x, y });
  center.sort((a, b) => (Math.abs(a.x + (width - 1) / 2 - middle) + Math.abs(a.y + (height - 1) / 2 - middle)) - (Math.abs(b.x + (width - 1) / 2 - middle) + Math.abs(b.y + (height - 1) / 2 - middle)) || a.y - b.y || a.x - b.x);
  const ordered = definition.placement_rule === 'corner' ? corner : definition.placement_rule === 'center' ? center : definition.placement_rule === 'wall' ? wall : [...wall, ...center];
  const unique = ordered.filter((item, index, all) => all.findIndex(other => other.x === item.x && other.y === item.y) === index);
  const offset = createHash('sha256').update(`${homeId}:${floor}:${definition.code}`).digest()[0] % Math.max(1, unique.length);
  return [...unique.slice(offset), ...unique.slice(0, offset)];
};

const rectanglesTouch = (a: FurniturePlacement, aDef: Pick<HomeFurnitureDefinition, 'grid_width' | 'grid_height'>, b: FurniturePlacement, bDef: Pick<HomeFurnitureDefinition, 'grid_width' | 'grid_height'>, padding = 0) =>
  a.x - padding < b.x + Number(bDef.grid_width) && a.x + Number(aDef.grid_width) + padding > b.x && a.y - padding < b.y + Number(bDef.grid_height) && a.y + Number(aDef.grid_height) + padding > b.y;

export const findFurniturePlacement = async (connection: PoolConnection, homeId: number, floor: number, houseLevel: number, definition: HomeFurnitureDefinition) => {
  const room = roomForHouseLevel(houseLevel); const reserved = reservedCells(room, floor);
  const [furniture] = await connection.execute<PlacedFurniture[]>(`SELECT f.id,f.furniture_code,f.grid_x,f.grid_y,d.grid_width,d.grid_height
    FROM player_home_furniture f JOIN home_furniture_definitions d ON d.code=f.furniture_code
    WHERE f.home_id=? AND f.floor_no=? FOR UPDATE`, [homeId, floor]);
  const [cellRows] = await connection.execute<(RowDataPacket & { grid_x: number; grid_y: number })[]>('SELECT grid_x,grid_y FROM player_home_furniture_cells WHERE home_id=? AND floor_no=? FOR UPDATE', [homeId, floor]);
  const occupied = new Set(cellRows.map(cell => `${cell.grid_x}:${cell.grid_y}`));
  const placed = furniture.filter(item => item.grid_x !== null && item.grid_y !== null);
  for (const candidate of candidatesFor(homeId, floor, definition, room)) {
    const cells = cellsFor(candidate, definition);
    if (cells.some(([x, y]) => x < room.innerMin || x > room.innerMax || y < room.innerMin || y > room.innerMax || reserved.has(`${x}:${y}`) || occupied.has(`${x}:${y}`))) continue;
    if (definition.code === 'training_dummy' && placed.some(item => rectanglesTouch(candidate, definition, { x: Number(item.grid_x), y: Number(item.grid_y) }, item, 1))) continue;
    if (definition.code === 'warm_hearth' && placed.some(item => (item.furniture_code === 'wooden_bed' || item.furniture_code === 'slime_bed') && rectanglesTouch(candidate, definition, { x: Number(item.grid_x), y: Number(item.grid_y) }, item, 1))) continue;
    if ((definition.code === 'wooden_bed' || definition.code === 'slime_bed') && placed.some(item => item.furniture_code === 'warm_hearth' && rectanglesTouch(candidate, definition, { x: Number(item.grid_x), y: Number(item.grid_y) }, item, 1))) continue;
    return candidate;
  }
  throw new Error('本层没有可放置该家具的空间。');
};

export const occupyFurnitureCells = async (connection: PoolConnection, homeId: number, floor: number, furnitureId: number, placement: FurniturePlacement, definition: HomeFurnitureDefinition) => {
  const cells = cellsFor(placement, definition);
  for (const [x, y] of cells) await connection.execute('INSERT INTO player_home_furniture_cells (home_id,floor_no,grid_x,grid_y,furniture_id) VALUES (?,?,?,?,?)', [homeId, floor, x, y, furnitureId]);
};

/** 为旧版仅有 slot_key 的家具补齐位置；实在无处可放时保留其数据，等待之后的整理功能处理。 */
export const backfillHomeFloorLayout = async (connection: PoolConnection, homeId: number, floor: number, houseLevel: number) => {
  const [missing] = await connection.execute<(PlacedFurniture & HomeFurnitureDefinition)[]>(`SELECT f.id,f.furniture_code,f.grid_x,f.grid_y,d.grid_width,d.grid_height,d.placement_rule,d.code
    FROM player_home_furniture f JOIN home_furniture_definitions d ON d.code=f.furniture_code
    WHERE f.home_id=? AND f.floor_no=? AND (f.grid_x IS NULL OR f.grid_y IS NULL) ORDER BY f.placed_at,f.id FOR UPDATE`, [homeId, floor]);
  for (const item of missing) {
    try {
      const placement = await findFurniturePlacement(connection, homeId, floor, houseLevel, item);
      await connection.execute('UPDATE player_home_furniture SET grid_x=?,grid_y=?,layout_version=1 WHERE id=?', [placement.x, placement.y, item.id]);
      await occupyFurnitureCells(connection, homeId, floor, item.id, placement, item);
    } catch { /* 保留旧家具，避免迁移时因满房而丢失物品。 */ }
  }
};
