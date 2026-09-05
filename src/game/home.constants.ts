export const BAINA_RESIDENCE_CODE = 'baina_residence';
export const BAINA_GUILD_POSITION = { x: -2, y: -161, z: 0 };

export const homeCosts = {
  purchase: { copper: 500, materials: {} },
  upgrade2: { copper: 800, materials: { home_wood: 30, home_stone: 20 } },
  expand2: { copper: 1000, materials: { home_wood: 50, home_stone: 30 } },
  upgrade3: { copper: 2000, materials: { home_wood: 80, home_stone: 50, home_metal: 20 } },
  expand3: { copper: 3000, materials: { home_wood: 120, home_stone: 80, home_metal: 30 } }
} as const;

export const slotsPerFloor = (houseLevel: number) => houseLevel >= 3 ? 10 : houseLevel >= 2 ? 8 : 6;
export const homePlotDistance = { min: 12, max: 22 };
