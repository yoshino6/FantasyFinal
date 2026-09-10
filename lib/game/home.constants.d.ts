export declare const BAINA_RESIDENCE_CODE = "baina_residence";
export declare const BAINA_GUILD_POSITION: {
    x: number;
    y: number;
    z: number;
};
export declare const homeCosts: {
    readonly purchase: {
        readonly copper: 500;
        readonly materials: {};
    };
    readonly upgrade2: {
        readonly copper: 800;
        readonly materials: {
            readonly home_wood: 30;
            readonly home_stone: 20;
        };
    };
    readonly expand2: {
        readonly copper: 1000;
        readonly materials: {
            readonly home_wood: 50;
            readonly home_stone: 30;
        };
    };
    readonly upgrade3: {
        readonly copper: 2000;
        readonly materials: {
            readonly home_wood: 80;
            readonly home_stone: 50;
            readonly home_metal: 20;
        };
    };
    readonly expand3: {
        readonly copper: 3000;
        readonly materials: {
            readonly home_wood: 120;
            readonly home_stone: 80;
            readonly home_metal: 30;
        };
    };
};
export declare const slotsPerFloor: (houseLevel: number) => 10 | 6 | 8;
export declare const homePlotDistance: {
    min: number;
    max: number;
};
