import { type useMessage } from 'alemonjs';
type Result = Awaited<ReturnType<ReturnType<typeof useMessage>[0]['send']>>[number];
type RecallEvent = {
    Platform?: string;
    IsPrivate?: boolean;
    SpaceId?: string;
    OpenId?: string;
    ChannelId?: string;
    Target?: {
        scope: string;
        targetId: string;
    };
};
export declare const talentRecallTarget: (event: RecallEvent) => {
    scope: string;
    targetId: string;
} | undefined;
export declare const scheduleTalentRecall: (results: Result[], recall: (id: string) => Promise<Result[]>, schedule?: (callback: import("alemonjs").ScheduleCallback, ms: number) => string) => void;
export declare const useTalentDetailMessage: () => {
    send(params: Parameters<(params?: {
        format: import("alemonjs").Format | import("alemonjs").DataEnums[];
        replyId?: string;
    } | import("alemonjs").DataEnums[]) => Promise<import("alemonjs/common").Result[]>>[0]): Promise<import("alemonjs/common").Result[]>;
};
export {};
