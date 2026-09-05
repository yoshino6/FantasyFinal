export type MapMarker = { code?: string; name: string; siteType?: string | null };

type MarkerCategory = 'home' | 'guide' | 'guild' | 'church' | 'shop' | 'gate' | 'market' | 'library' | 'laboratory' | 'civic' | 'inn' | 'archive' | 'shrine' | 'courier' | 'observatory' | 'watchpost' | 'shelter' | 'wayfinder' | 'ranch' | 'garden' | 'workshop' | 'ruin' | 'lighthouse' | 'mining' | 'ferry' | 'industrial' | 'landmark' | 'entrance';

const shopCodes = new Set(['blacksmith', 'alchemy_sweetshop', 'oddworkshop', 'bookshop', 'hunter_lodge', 'baina_residence']);
// 已知静态建筑按代号标识；动态站点则只在登记了明确功能类型时替换 📍。
const landmarkCategories: Record<string, MarkerCategory> = {
  world_gate: 'gate', world_tree_gate: 'gate', canopy_exchange: 'market', world_library: 'library', evolution_lab: 'laboratory'
};
const siteTypeCategories: Partial<Record<string, MarkerCategory>> = {
  civic_hall: 'civic', inn: 'inn', archive: 'archive', shrine: 'shrine', courier_post: 'courier', observatory: 'observatory', watchpost: 'watchpost',
  shelter: 'shelter', rest_stop: 'inn', wayfinder: 'wayfinder', ranch: 'ranch', garden: 'garden', workshop: 'workshop', laboratory: 'laboratory',
  ruin: 'ruin', lighthouse: 'lighthouse', mining_station: 'mining', ferry: 'ferry', industrial: 'industrial'
};
const markerStyle: Record<MarkerCategory, { order: number; emoji: string }> = {
  home: { order: 0, emoji: '🏠' },
  guide: { order: 1, emoji: '🐱' },
  guild: { order: 2, emoji: '🏰' },
  church: { order: 3, emoji: '💒' },
  shop: { order: 4, emoji: '🏘️' },
  gate: { order: 5, emoji: '🌀' },
  market: { order: 6, emoji: '🛍️' },
  library: { order: 7, emoji: '📖' },
  laboratory: { order: 8, emoji: '🧬' },
  civic: { order: 9, emoji: '🏛️' },
  inn: { order: 10, emoji: '🛏️' },
  archive: { order: 11, emoji: '🗃️' },
  shrine: { order: 12, emoji: '⛩️' },
  courier: { order: 13, emoji: '📮' },
  observatory: { order: 14, emoji: '🔭' },
  watchpost: { order: 15, emoji: '🗼' },
  shelter: { order: 16, emoji: '🏕️' },
  wayfinder: { order: 17, emoji: '🧭' },
  ranch: { order: 18, emoji: '🐏' },
  garden: { order: 19, emoji: '🌿' },
  workshop: { order: 20, emoji: '🔧' },
  ruin: { order: 21, emoji: '🏚️' },
  lighthouse: { order: 22, emoji: '🔦' },
  mining: { order: 23, emoji: '⛏️' },
  ferry: { order: 24, emoji: '⛴️' },
  industrial: { order: 25, emoji: '⚙️' },
  landmark: { order: 26, emoji: '📍' },
  entrance: { order: 27, emoji: '🚪' }
};

const markerCategory = (code?: string, name = '', siteType?: string | null): MarkerCategory => {
  if (code === 'player_home') return 'home';
  if (code === 'pear_guide') return 'guide';
  if (code === 'guild_counter') return 'guild';
  if (code?.includes('church') || code?.includes('chapel') || /教堂|圣堂|神殿/.test(name)) return 'church';
  if (code && shopCodes.has(code)) return 'shop';
  if (code?.includes('entrance')) return 'entrance';
  if (code && landmarkCategories[code]) return landmarkCategories[code];
  if (siteType && siteTypeCategories[siteType]) return siteTypeCategories[siteType];
  return 'landmark';
};

export const markerName = (marker: MapMarker) => `${markerStyle[markerCategory(marker.code, marker.name, marker.siteType)].emoji} ${marker.name}`;

export const sortMapMarkers = <T extends MapMarker>(markers: T[]) => [...markers].sort((left, right) => {
  const order = markerStyle[markerCategory(left.code, left.name, left.siteType)].order - markerStyle[markerCategory(right.code, right.name, right.siteType)].order;
  return order || left.name.localeCompare(right.name, 'zh-CN');
});
