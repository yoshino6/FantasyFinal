export declare const openingRoadPanel: (user: string) => Promise<{
    revision: number;
    current: string;
    roads: {
        code: string;
        title: string;
        region: string;
        destination: "浮叶镇" | "百纳镇" | "世界树" | "霜龙客舍";
    }[];
}>;
export declare const selectOpeningRoad: (user: string, revision: number, code: string) => Promise<{
    code: string;
    title: string;
    region: string;
    destination: "浮叶镇" | "百纳镇" | "世界树" | "霜龙客舍";
}>;
