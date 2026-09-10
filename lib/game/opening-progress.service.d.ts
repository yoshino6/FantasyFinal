import type { PoolConnection } from 'mysql2/promise';
export declare const openingExperienceShares: () => {
    arrival: number;
    register: number;
    lesson: number;
};
export declare const grantOpeningExperience: (c: PoolConnection, id: number, stage: keyof ReturnType<typeof openingExperienceShares>) => Promise<number>;
export declare const openingFollowupQuest: (user: string) => Promise<{
    title: string;
    description: string;
    action: {
        label: string;
        command: string;
    };
} | null>;
export declare const newcomerJobs: readonly [{
    readonly title: "药架上的两个标签";
    readonly npc: "补给员";
    readonly intro: "两只药箱挨在一起，一只装外用草药，一只装回魔药。补给员把标签递来：“先分清，再摆稳。别凭瓶子的颜色猜。”";
    readonly first: "核对药物标签";
    readonly second: "垫稳药箱并复查";
    readonly middle: "你按药物名称分好标签。现在把易碎瓶底垫稳，急用药放到容易取出的上层。";
    readonly done: "补给员逐瓶复核后，在交接表上签了名。你知道下一次需要哪一瓶时，不必慌忙翻遍整个架子。";
}, {
    readonly title: "会晃的候车长凳";
    readonly npc: "工匠";
    readonly intro: "候车处的长凳一坐就晃。工匠没有递来钉锤，先放了一把直尺：“找出哪里不平，再决定修哪里。”";
    readonly first: "检查支脚与榫口";
    readonly second: "装好垫片并试坐";
    readonly middle: "你找到松动的榫口，把安全垫片推进标线内。现在扶稳凳面，按顺序检查承重。";
    readonly done: "长凳稳稳承住了工匠的重量。候车的老人道了谢，你将剩下的工具一件件归位。";
}, {
    readonly title: "回程牌不能指错路";
    readonly npc: "值守";
    readonly intro: "接引口换了新的路牌。值守让你拿地图逐项比对：“牌子上的方向，得对得起照着它走的人。”";
    readonly first: "对照当前位置与公会入口";
    readonly second: "挂好安全方向牌";
    readonly middle: "你核对了入口与回程接驳位置，把通向未开放野外的旧箭头遮住。再检查一次，确认没有指反。";
    readonly done: "值守沿牌走了一遍，回来把验收章盖在图角。“这次你替别人认清了回来的路。”";
}];
export declare const openingJob: (user: string, revision?: number) => Promise<{
    title: string;
    text: string;
    revision: number;
    action: string | undefined;
}>;
