import type { WebSession } from '../game/admin-web.service';
export declare const adminCoverPath = "/admin/assets/pear-admin-cover.png";
export declare const loginPage: (nonce: string) => string;
export declare const adminPage: (session: WebSession, nonce: string) => string;
