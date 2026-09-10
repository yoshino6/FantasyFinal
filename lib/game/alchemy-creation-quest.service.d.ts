import type { PoolConnection } from 'mysql2/promise';
export declare const alchemyCreationQuestCode = "alchemy_world_beyond_bottles";
export declare const alchemyCreationQuestTitle = "\u74F6\u4E2D\u4E4B\u5916\u7684\u4E16\u754C";
export declare const alchemyCreationLesson = "\u6674\u513F\u4ECE\u67DC\u53F0\u4E0B\u7FFB\u51FA\u4E00\u672C\u5377\u89D2\u624B\u8BB0\uFF0C\u7EB8\u9875\u95F4\u6EDA\u51FA\u4E00\u679A\u5C0F\u9F7F\u8F6E\u3002\u201C\u836F\u74F6\u53EF\u88C5\u4E0D\u4E0B\u70BC\u91D1\u7684\u5168\u90E8\u79D8\u5BC6\u3002\u201D\u5979\u7B11\u7740\u753B\u4E0B\u7075\u9B42\u4E0E\u8EAF\u58F3\u76F8\u8FDE\u7684\u9635\u7EB9\uFF1A\u201C\u8FD9\u53EB\u70B9\u7075\uFF1B\u518D\u4EE5\u4E0D\u540C\u539F\u6DB2\u6ECB\u517B\uFF0C\u4FBF\u662F\u80B2\u6210\u3002\u5B83\u4F1A\u6162\u6162\u957F\u51FA\u81EA\u5DF1\u7684\u672C\u9886\u548C\u813E\u6C14\u3002\u201D\u4F60\u6B63\u8981\u4F38\u624B\uFF0C\u5979\u5374\u5408\u4E0A\u624B\u8BB0\uFF1A\u201C\u5148\u522B\u6025\uFF01\u7075\u67A2\u7D20\u4F53\u5F97\u627E\u56DB\u7EA7\u89E3\u6784\u5E08\u60F3\u529E\u6CD5\u6784\u9020\u3002\u6211\u6559\u4F60\u70B9\u4EAE\u5B83\uFF0C\u53EF\u4E0D\u66FF\u4F60\u62E7\u87BA\u4E1D\u54DF\u3002\u201D";
export declare const alchemyCreationQuestFor: (connection: Pick<PoolConnection, "execute">, characterId: number) => Promise<{
    eligible: boolean;
    unlocked: boolean;
    pending: boolean;
}>;
export declare const alchemyCreationQuest: (user: string) => Promise<{
    eligible: boolean;
    unlocked: boolean;
    pending: boolean;
}>;
export declare const assertAlchemyCreationUnlocked: (connection: PoolConnection, characterId: number) => Promise<void>;
export declare const learnAlchemyCreation: (user: string) => Promise<{
    alreadyLearned: boolean;
    story: string;
}>;
