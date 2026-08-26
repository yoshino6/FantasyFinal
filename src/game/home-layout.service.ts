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
  rotation: number;
};

export type HomeRoom = {
  columns: number;
  rows: number;
  canvasPixels: number;
  floorLeft: number;
  floorTop: number;
  floorRight: number;
  floorBottom: number;
  cellWidth: number;
  cellHeight: number;
};
export type FurniturePlacement = { x: number; y: number; rotation: 0 | 90 | 180 | 270; width: number; height: number };

const HOME_LAYOUT_VERSION = 2;
const floorBounds = { left: 0.102, top: 0.202, right: 0.898, bottom: 0.856 } as const;

export const roomForHouseLevel = (houseLevel: number): HomeRoom => {
  const columns = houseLevel >= 3 ? 20 : houseLevel >= 2 ? 16 : 12;
  const rows = houseLevel >= 3 ? 16 : houseLevel >= 2 ? 13 : 10;
  const canvasPixels = columns * 48;
  const floorLeft = canvasPixels * floorBounds.left; const floorTop = canvasPixels * floorBounds.top;
  const floorRight = canvasPixels * floorBounds.right; const floorBottom = canvasPixels * floorBounds.bottom;
  return {
    columns, rows, canvasPixels, floorLeft, floorTop, floorRight, floorBottom,
    cellWidth: (floorRight - floorLeft) / columns,
    cellHeight: (floorBottom - floorTop) / rows
  };
};

export const furnitureDimensions = (width: number, height: number, rotation: number) => rotation % 180 === 0
  ? { width: Number(width), height: Number(height) }
  : { width: Number(height), height: Number(width) };

const cellsFor = (placement: FurniturePlacement) => {
  const cells: Array<[number, number]> = [];
  for (let x = placement.x; x < placement.x + placement.width; x++) {
    for (let y = placement.y; y < placement.y + placement.height; y++) cells.push([x, y]);
  }
  return cells;
};

const reservedCells = (room: HomeRoom, floor: number) => {
  const cells = new Set<string>();
  if (floor === 1) {
    const center = Math.floor(room.columns / 2);
    for (const x of [center - 1, center]) cells.add(`${x}:${room.rows - 1}`);
  } else if (floor === 2 || floor === 3) {
    for (let x = 0; x < Math.min(3, room.columns); x++) {
      for (let y = Math.max(0, room.rows - 3); y < room.rows; y++) cells.add(`${x}:${y}`);
    }
  }
  return cells;
};

const placement = (x: number, y: number, rotation: FurniturePlacement['rotation'], definition: HomeFurnitureDefinition): FurniturePlacement => {
  const dimensions = furnitureDimensions(Number(definition.grid_width), Number(definition.grid_height), rotation);
  return { x, y, rotation, ...dimensions };
};

const wallCandidates = (definition: HomeFurnitureDefinition, room: HomeRoom) => {
  const result: FurniturePlacement[][] = [[], [], [], []];
  const top = furnitureDimensions(definition.grid_width, definition.grid_height, 0);
  for (let x = 0; x <= room.columns - top.width; x++) result[0].push(placement(x, 0, 0, definition));
  const left = furnitureDimensions(definition.grid_width, definition.grid_height, 270);
  for (let y = 0; y <= room.rows - left.height; y++) result[1].push(placement(0, y, 270, definition));
  const right = furnitureDimensions(definition.grid_width, definition.grid_height, 90);
  for (let y = 0; y <= room.rows - right.height; y++) result[2].push(placement(room.columns - right.width, y, 90, definition));
  const bottom = furnitureDimensions(definition.grid_width, definition.grid_height, 180);
  for (let x = 0; x <= room.columns - bottom.width; x++) result[3].push(placement(x, room.rows - bottom.height, 180, definition));
  return result;
};

const centerCandidates = (definition: HomeFurnitureDefinition, room: HomeRoom) => {
  const rotations: Array<0 | 90> = Number(definition.grid_width) === Number(definition.grid_height) ? [0] : [0, 90];
  const middleX = (room.columns - 1) / 2; const middleY = (room.rows - 1) / 2;
  const result: FurniturePlacement[] = [];
  for (const rotation of rotations) {
    const dimensions = furnitureDimensions(definition.grid_width, definition.grid_height, rotation);
    for (let y = 0; y <= room.rows - dimensions.height; y++) {
      for (let x = 0; x <= room.columns - dimensions.width; x++) result.push(placement(x, y, rotation, definition));
    }
  }
  return result.sort((a, b) => {
    const distanceA = Math.abs(a.x + (a.width - 1) / 2 - middleX) + Math.abs(a.y + (a.height - 1) / 2 - middleY);
    const distanceB = Math.abs(b.x + (b.width - 1) / 2 - middleX) + Math.abs(b.y + (b.height - 1) / 2 - middleY);
    return distanceA - distanceB || a.y - b.y || a.x - b.x || a.rotation - b.rotation;
  });
};

const candidatesFor = (homeId: number, floor: number, definition: HomeFurnitureDefinition, room: HomeRoom) => {
  const walls = wallCandidates(definition, room);
  const seed = createHash('sha256').update(`${homeId}:${floor}:${definition.code}`).digest();
  const shiftedWalls = walls.map((side, index) => {
    const offset = seed[index + 1] % Math.max(1, side.length);
    return [...side.slice(offset), ...side.slice(0, offset)];
  });
  const sideOffset = seed[0] % 3; const primarySides = [...shiftedWalls.slice(0, 3).slice(sideOffset), ...shiftedWalls.slice(0, 3).slice(0, sideOffset)];
  const preferredWalls: FurniturePlacement[] = [];
  for (let index = 0; index < Math.max(...primarySides.map(side => side.length), 0); index++) {
    for (const side of primarySides) if (side[index]) preferredWalls.push(side[index]);
  }
  preferredWalls.push(...shiftedWalls[3]);
  const centers = centerCandidates(definition, room);
  const corners = [walls[0][0], walls[0].at(-1), walls[3][0], walls[3].at(-1)].filter((item): item is FurniturePlacement => Boolean(item));
  const ordered = definition.placement_rule === 'corner' ? corners : definition.placement_rule === 'center' ? centers : definition.placement_rule === 'wall' ? preferredWalls : [...preferredWalls, ...centers];
  const unique = ordered.filter((item, index, all) => all.findIndex(other => other.x === item.x && other.y === item.y && other.rotation === item.rotation) === index);
  return unique;
};

const rectanglesTouch = (a: FurniturePlacement, b: FurniturePlacement, padding = 0) =>
  a.x - padding < b.x + b.width && a.x + a.width + padding > b.x && a.y - padding < b.y + b.height && a.y + a.height + padding > b.y;

const placedArea = (item: PlacedFurniture): FurniturePlacement => {
  const rotation = ([0, 90, 180, 270].includes(Number(item.rotation)) ? Number(item.rotation) : 0) as FurniturePlacement['rotation'];
  const dimensions = furnitureDimensions(item.grid_width, item.grid_height, rotation);
  return { x: Number(item.grid_x), y: Number(item.grid_y), rotation, ...dimensions };
};

export const findFurniturePlacement = async (connection: PoolConnection, homeId: number, floor: number, houseLevel: number, definition: HomeFurnitureDefinition) => {
  const room = roomForHouseLevel(houseLevel); const reserved = reservedCells(room, floor);
  const [furniture] = await connection.execute<PlacedFurniture[]>(`SELECT f.id,f.furniture_code,f.grid_x,f.grid_y,f.rotation,d.grid_width,d.grid_height
    FROM player_home_furniture f JOIN home_furniture_definitions d ON d.code=f.furniture_code
    WHERE f.home_id=? AND f.floor_no=? FOR UPDATE`, [homeId, floor]);
  const [cellRows] = await connection.execute<(RowDataPacket & { grid_x: number; grid_y: number })[]>('SELECT grid_x,grid_y FROM player_home_furniture_cells WHERE home_id=? AND floor_no=? FOR UPDATE', [homeId, floor]);
  const occupied = new Set(cellRows.map(cell => `${cell.grid_x}:${cell.grid_y}`));
  const placed = furniture.filter(item => item.grid_x !== null && item.grid_y !== null).map(item => ({ code: item.furniture_code, area: placedArea(item) }));
  for (const candidate of candidatesFor(homeId, floor, definition, room)) {
    const cells = cellsFor(candidate);
    if (cells.some(([x, y]) => x < 0 || x >= room.columns || y < 0 || y >= room.rows || reserved.has(`${x}:${y}`) || occupied.has(`${x}:${y}`))) continue;
    if (definition.code === 'training_dummy' && placed.some(item => rectanglesTouch(candidate, item.area, 1))) continue;
    if (definition.code === 'warm_hearth' && placed.some(item => (item.code === 'wooden_bed' || item.code === 'slime_bed') && rectanglesTouch(candidate, item.area, 1))) continue;
    if ((definition.code === 'wooden_bed' || definition.code === 'slime_bed') && placed.some(item => item.code === 'warm_hearth' && rectanglesTouch(candidate, item.area, 1))) continue;
    return candidate;
  }
  throw new Error('本层没有可放置该家具的空间。');
};

export const occupyFurnitureCells = async (connection: PoolConnection, homeId: number, floor: number, furnitureId: number, placement: FurniturePlacement) => {
  for (const [x, y] of cellsFor(placement)) await connection.execute('INSERT INTO player_home_furniture_cells (home_id,floor_no,grid_x,grid_y,furniture_id) VALUES (?,?,?,?,?)', [homeId, floor, x, y, furnitureId]);
};

/** 将旧版整图网格迁移为真实地板网格，并为全部家具重新生成不重叠的朝向与位置。 */
export const backfillHomeFloorLayout = async (connection: PoolConnection, homeId: number, floor: number, houseLevel: number) => {
  const [furniture] = await connection.execute<(PlacedFurniture & HomeFurnitureDefinition & { layout_version: number })[]>(`SELECT f.id,f.furniture_code,f.grid_x,f.grid_y,f.rotation,f.layout_version,d.grid_width,d.grid_height,d.placement_rule,d.code
    FROM player_home_furniture f JOIN home_furniture_definitions d ON d.code=f.furniture_code
    WHERE f.home_id=? AND f.floor_no=? ORDER BY d.layer_order,f.placed_at,f.id FOR UPDATE`, [homeId, floor]);
  if (!furniture.some(item => Number(item.layout_version) < HOME_LAYOUT_VERSION || item.grid_x === null || item.grid_y === null)) return;
  await connection.execute('DELETE FROM player_home_furniture_cells WHERE home_id=? AND floor_no=?', [homeId, floor]);
  await connection.execute('UPDATE player_home_furniture SET grid_x=NULL,grid_y=NULL,rotation=0 WHERE home_id=? AND floor_no=?', [homeId, floor]);
  for (const item of furniture) {
    const next = await findFurniturePlacement(connection, homeId, floor, houseLevel, item);
    await connection.execute('UPDATE player_home_furniture SET grid_x=?,grid_y=?,rotation=?,layout_version=? WHERE id=?', [next.x, next.y, next.rotation, HOME_LAYOUT_VERSION, item.id]);
    await occupyFurnitureCells(connection, homeId, floor, item.id, next);
  }
};
