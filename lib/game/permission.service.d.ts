import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../database/pool';
export type PermissionRole = 'owner' | 'admin';
type Connection = PoolConnection | Awaited<ReturnType<typeof getPool>>;
export declare const permissionFor: (qqUserId: string) => Promise<PermissionRole>;
export declare const requireAdministrator: (qqUserId: string, connection?: Connection) => Promise<PermissionRole>;
export declare const requireOwner: (qqUserId: string, connection?: Connection) => Promise<void>;
export declare const loginAsOwner: (qqUserId: string, password: string) => Promise<void>;
export declare const grantAdministrator: (ownerQqUserId: string, targetQqUserId: string) => Promise<void>;
export declare const revokeAdministrator: (ownerQqUserId: string, targetQqUserId: string) => Promise<void>;
export declare const permissionList: () => Promise<{
    qqUserId: string;
    role: PermissionRole;
    characterId: number | null;
    name: string;
}[]>;
export {};
