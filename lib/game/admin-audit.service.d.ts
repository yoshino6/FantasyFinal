export declare const auditCharacter: (qqUserId: string) => Promise<{
    name: string;
    changed: boolean;
    fixed: string;
}>;
export declare const auditInventory: (qqUserId: string) => Promise<{
    name: string;
    changed: boolean;
    fixed: string;
}>;
export declare const clearPlayerBackpack: (qqUserId: string) => Promise<{
    name: string;
    stacked: number;
    instances: number;
}>;
export declare const auditPlayerState: (qqUserId: string) => Promise<{
    name: string;
    changed: boolean;
    fixed: string;
}>;
export declare const auditSkills: (qqUserId: string) => Promise<{
    name: string;
    changed: boolean;
    fixed: string;
}>;
export declare const auditAllPlayers: () => Promise<{
    total: number;
    completed: number;
    failed: {
        name: string;
        message: string;
    }[];
    results: {
        name: string;
        fixes: string[];
    }[];
}>;
