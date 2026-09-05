import type { PoolConnection } from 'mysql2/promise';
export declare const hasCompatibleSkillWeapon: (connection: PoolConnection, characterId: number, requiredWeaponType: string | null | undefined) => Promise<boolean>;
export declare const skillWeaponRequirementMessage: (skillName: string, requiredWeaponType: string) => string;
