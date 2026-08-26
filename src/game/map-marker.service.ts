export type MapMarker = { code?: string; name: string };

type MarkerCategory = 'home' | 'guide' | 'guild' | 'church' | 'shop' | 'landmark' | 'entrance';

const shopCodes = new Set(['blacksmith', 'alchemy_sweetshop', 'oddworkshop', 'bookshop', 'hunter_lodge', 'baina_residence']);
const markerStyle: Record<MarkerCategory, { order: number; emoji: string }> = {
  home: { order: 0, emoji: '🏠' },
  guide: { order: 1, emoji: '🐱' },
  guild: { order: 2, emoji: '🏰' },
  church: { order: 3, emoji: '💒' },
  shop: { order: 4, emoji: '🏘️' },
  landmark: { order: 5, emoji: '📍' },
  entrance: { order: 6, emoji: '🚪' }
};

const markerCategory = (code?: string, name = ''): MarkerCategory => {
  if (code === 'player_home') return 'home';
  if (code === 'pear_guide') return 'guide';
  if (code === 'guild_counter') return 'guild';
  if (code?.includes('church') || code?.includes('chapel') || /教堂|圣堂|神殿/.test(name)) return 'church';
  if (code && shopCodes.has(code)) return 'shop';
  if (code?.includes('entrance')) return 'entrance';
  return 'landmark';
};

export const markerName = (marker: MapMarker) => `${markerStyle[markerCategory(marker.code, marker.name)].emoji} ${marker.name}`;

export const sortMapMarkers = <T extends MapMarker>(markers: T[]) => [...markers].sort((left, right) => {
  const order = markerStyle[markerCategory(left.code, left.name)].order - markerStyle[markerCategory(right.code, right.name)].order;
  return order || left.name.localeCompare(right.name, 'zh-CN');
});
