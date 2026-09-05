export declare const residentScalablePassives: Set<string>;
export declare const canSpecializePassive: (code: string, effect?: Record<string, unknown>) => boolean;
export declare const passiveSpecializationFactor: (level: unknown, tier?: string) => number;
export declare const specializedPassiveValue: (key: string, value: number, level: unknown, tier?: string) => number;
