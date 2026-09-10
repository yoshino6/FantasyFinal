export type DispelAuthority = 'ordinary' | 'holy' | 'mechanism';
export declare const isHardControlEffect: (code: string) => boolean;
export declare const nativeCleanseLimit: (code: string) => number;
export declare const protectedControlCodes: Set<string>;
export declare const canDispelCombatEffect: (code: string, authority?: DispelAuthority, mechanismLocked?: boolean) => boolean;
