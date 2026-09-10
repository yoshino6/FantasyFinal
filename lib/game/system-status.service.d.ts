export type StorageStatus = {
    label: string;
    total: number;
    free: number;
};
export type GameStatusSummary = {
    characters: number;
    activeCharacters: number;
    battles: number;
    travelling: number;
    monsters: number;
    resources: number;
    dungeons: number;
    worldScenes: number;
};
export type SystemStatusSnapshot = {
    capturedAt: Date;
    hostname: string;
    operatingSystem: string;
    architecture: string;
    cpu: string;
    cpuCores: number;
    serviceUptimeSeconds: number;
    systemUptimeSeconds: number;
    memory: {
        total: number;
        free: number;
        used: number;
        process: number;
    };
    storage: StorageStatus | null;
    networkInterfaces: number;
    game: GameStatusSummary | null;
};
export declare const systemStatusSnapshot: () => Promise<SystemStatusSnapshot>;
