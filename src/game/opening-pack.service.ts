import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { openingRouteByCode } from './opening-content';
import { grantOpeningItem } from './opening.service';
import { grantOpeningService } from './opening-guild.service';

/** Supplements only the packs still referenced by a saved route. The original herb/feed grant is unchanged. */
export const openingPackExtras: Record<string, { items?: [string, number][]; services?: [string, number][] }> = {
  R医: { items: [['novice_mp_potion_small', 2]] },
  R食: { services: [['meal', 3]] },
  R匠: { items: [['home_wood', 3], ['home_stone', 3], ['home_metal', 3]], services: [['repair', 1]] },
  R商: { services: [['supplies', 150]] },
  R探: { items: [['opening_survey_notes', 1]], services: [['map_exchange', 1]] },
  R契: { services: [['companion_care', 1]] },
  R艺: { items: [['opening_craft_coupon', 1]], services: [['craft_practice', 1]] },
  R守: { items: [['opening_guard_charm', 1]], services: [['pve_rescue', 1]] }
};

/** Caller holds the character lock. One marker covers both the new award and old claimed-route repair. */
export const grantOpeningPackExtras = async (c: PoolConnection, id: number, pack: string) => {
  const extra = openingPackExtras[pack];
  if (!extra) throw new Error('这份初行礼包的配置尚未齐全。');
  const [inserted] = await c.execute<any>("INSERT IGNORE INTO player_opening_services (character_id,code,uses) VALUES (?,'pack_extras_v1',0)", [id]);
  if (!inserted.affectedRows) return false;
  for (const [code, quantity] of extra.items ?? []) await grantOpeningItem(c, id, code, quantity);
  for (const [code, uses] of extra.services ?? []) await grantOpeningService(c, id, code, uses);
  return true;
};

export const repairClaimedOpeningPack = async (c: PoolConnection, id: number) => {
  const [stories] = await c.execute<RowDataPacket[]>('SELECT route_code,story_version,branch_code FROM player_opening_stories WHERE character_id=? AND reward_claimed=1', [id]);
  const story = stories[0];
  const pack = story && openingRouteByCode(String(story.route_code), Number(story.story_version))?.choices.find(choice => choice.code === story.branch_code)?.pack;
  return pack ? grantOpeningPackExtras(c, id, pack) : false;
};

export const openingProfessionWeapons: Record<string, string> = { warrior: 'sword', rogue: 'dagger', mage: 'staff', priest: 'book' };
export const grantOpeningProfessionWeapon = async (c: PoolConnection, id: number, profession: string) => {
  const weapon = openingProfessionWeapons[profession];
  if (!weapon) return null;
  const [stories] = await c.execute<RowDataPacket[]>('SELECT 1 FROM player_opening_stories WHERE character_id=? AND reward_claimed=1', [id]);
  if (!stories.length) return null;
  const [inserted] = await c.execute<any>("INSERT IGNORE INTO player_opening_services (character_id,code,uses) VALUES (?,'profession_weapon',0)", [id]);
  if (!inserted.affectedRows) return null;
  return (await import('./opening-chest.service')).grantOpeningEquipment(c, id, `opening_normal_${weapon}`);
};
